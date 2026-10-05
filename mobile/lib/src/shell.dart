import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'config.dart';
import 'config_repository.dart';
import 'screens.dart';
import 'shop_view.dart';
import 'strings.dart';

typedef ShopBuilder = Widget Function(BuildContext context, Shop shop, Strings strings);

/// Decides what the app shows: the shop chosen in our panel — from the phone's copy at once, then from the server —
/// or a screen saying why not. The server is asked again whenever the app comes back to the screen, so another
/// business chosen in the panel shows up without reinstalling anything.
class Shell extends StatefulWidget {
  const Shell({super.key, required this.source, required this.appVersion, this.shopBuilder});

  final ConfigSource source;
  final String appVersion;

  /// The shop itself; tests put a stand-in for the web view here.
  final ShopBuilder? shopBuilder;

  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> with WidgetsBindingObserver {
  /// Not more often than this when the app keeps coming back to the screen.
  static const _askEvery = Duration(seconds: 20);

  AppConfig? _config;
  bool _unreachable = false;
  bool _asking = false;
  DateTime? _askedAt;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _start();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Future<void> _start() async {
    final cached = await widget.source.cached();
    if (mounted && cached != null && _config == null) setState(() => _config = cached);
    await _ask();
  }

  Future<void> _ask() async {
    if (_asking) return;
    setState(() {
      _asking = true;
      _askedAt = DateTime.now();
    });
    try {
      final fresh = await widget.source.fetch();
      if (mounted) {
        setState(() {
          _config = fresh;
          _unreachable = false;
        });
      }
    } on Object {
      // No network: the phone's copy keeps working; without one, the app says so.
      if (mounted) setState(() => _unreachable = true);
    } finally {
      if (mounted) setState(() => _asking = false);
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final askedAt = _askedAt;
    if (state == AppLifecycleState.resumed && (askedAt == null || DateTime.now().difference(askedAt) >= _askEvery)) {
      _ask();
    }
  }

  void _openStore(AppConfig config) {
    final store = defaultTargetPlatform == TargetPlatform.iOS ? config.iosStore : config.androidStore;
    final url = store == null ? null : Uri.tryParse(store);
    if (url != null) launchUrl(url, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(View.of(context).platformDispatcher.locale);
    final config = _config;
    if (config == null) {
      if (!_unreachable) return const ShopSplash(shop: null);
      return StatusScreen(
        icon: Icons.wifi_off_rounded,
        title: strings.offlineTitle,
        text: strings.offlineText,
        action: strings.retry,
        onAction: _ask,
        busy: _asking,
      );
    }
    if (config.requiresUpdate(widget.appVersion)) {
      return StatusScreen(
        icon: Icons.system_update_rounded,
        title: strings.updateTitle,
        text: strings.updateText,
        action: strings.update,
        onAction: () => _openStore(config),
      );
    }
    final shop = config.shop;
    if (shop == null) {
      return StatusScreen(
        icon: Icons.storefront_rounded,
        title: strings.noShopTitle,
        text: strings.noShopText,
        action: strings.retry,
        onAction: _ask,
        busy: _asking,
      );
    }
    final builder = widget.shopBuilder;
    if (builder != null) return builder(context, shop, strings);
    // A new key for another shop: a fresh web view, nothing of the previous shop left in it.
    return ShopView(key: ValueKey(shop.url), shop: shop, appVersion: widget.appVersion, strings: strings);
  }
}

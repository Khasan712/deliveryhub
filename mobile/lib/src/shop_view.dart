import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';

import 'config.dart';
import 'links.dart';
import 'look.dart';
import 'screens.dart';
import 'strings.dart';

/// Runs in every page of the shop. Links that leave the shop and `window.open` (the Telegram sign-in) go to the
/// app — Android web views ignore `window.open` — and the page reports its colours, so the status bar matches.
const _bridge = r'''
(function () {
  if (window.__deliveryHubApp) return;
  window.__deliveryHubApp = true;
  function send(message) {
    try { DeliveryHubApp.postMessage(JSON.stringify(message)); } catch (e) {}
  }
  function open(href) {
    try { send({ type: 'open', url: new URL(href, location.href).href }); } catch (e) {}
  }
  window.open = function (url) { if (url) open(url); return null; };
  document.addEventListener('click', function (event) {
    var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!link || event.defaultPrevented) return;
    var url;
    try { url = new URL(link.href, location.href); } catch (e) { return; }
    if (link.target === '_blank' || url.origin !== location.origin) {
      event.preventDefault();
      open(url.href);
    }
  }, true);
  function theme() {
    var meta = document.querySelector('meta[name="theme-color"]');
    send({
      type: 'theme',
      color: meta ? meta.getAttribute('content') : null,
      dark: document.documentElement.getAttribute('data-theme') === 'dark'
    });
  }
  new MutationObserver(theme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  new MutationObserver(theme).observe(document.head, { subtree: true, attributes: true, attributeFilter: ['content'] });
  theme();
})();
''';

/// Android: asks the customer for the location for the web view (MainActivity.kt).
const _location = MethodChannel('deliveryhub/location');

/// Failures that mean "no network" (an offline screen with a retry), not a broken page.
const _offline = {
  WebResourceErrorType.connect,
  WebResourceErrorType.hostLookup,
  WebResourceErrorType.timeout,
  WebResourceErrorType.io,
  WebResourceErrorType.failedSslHandshake,
};

/// The shop of the business in a web view: the same shop customers open in a browser or in Telegram, so every
/// deploy of the shop reaches the app at once — no store update.
class ShopView extends StatefulWidget {
  const ShopView({super.key, required this.shop, required this.appVersion, required this.strings});

  final Shop shop;
  final String appVersion;
  final Strings strings;

  @override
  State<ShopView> createState() => _ShopViewState();
}

class _ShopViewState extends State<ShopView> {
  late final WebViewController _controller = _createController();

  /// The first page has been shown: the splash fades out.
  bool _shown = false;
  bool _offlineNow = false;
  Color _background = Look.paper;
  bool _dark = false;

  @override
  void initState() {
    super.initState();
    _open();
  }

  WebViewController _createController() {
    final params = WebViewPlatform.instance is WebKitWebViewPlatform
        ? WebKitWebViewControllerCreationParams(
            allowsInlineMediaPlayback: true,
            mediaTypesRequiringUserAction: const <PlaybackMediaTypes>{},
          )
        : const PlatformWebViewControllerCreationParams();
    final controller = WebViewController.fromPlatformCreationParams(params)
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Look.paper)
      ..addJavaScriptChannel('DeliveryHubApp', onMessageReceived: _onMessage)
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: _onNavigation,
          onPageFinished: (_) => _onPageFinished(),
          onWebResourceError: _onError,
        ),
      );
    final platform = controller.platform;
    if (platform is AndroidWebViewController) {
      AndroidWebViewController.enableDebugging(kDebugMode);
      platform.setGeolocationPermissionsPromptCallbacks(onShowPrompt: _askForLocation);
      platform.setMediaPlaybackRequiresUserGesture(false);
    }
    if (platform is WebKitWebViewController) {
      platform.setAllowsBackForwardNavigationGestures(true);
      platform.setInspectable(kDebugMode);
    }
    return controller;
  }

  Future<void> _open() async {
    // The shop can tell it runs in our app (and which one) by the user agent.
    final agent = await _controller.getUserAgent() ?? '';
    final system = defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';
    await _controller.setUserAgent('$agent DeliveryHubApp/${widget.appVersion} ($system)'.trim());
    await _controller.loadRequest(widget.shop.url);
  }

  NavigationDecision _onNavigation(NavigationRequest request) {
    final target = Uri.tryParse(request.url);
    if (target == null) return NavigationDecision.prevent;
    if (!request.isMainFrame || staysInApp(widget.shop.url, target)) return NavigationDecision.navigate;
    _openOutside(target);
    return NavigationDecision.prevent;
  }

  /// Telegram, the phone, maps, other sites: the app made for them.
  Future<void> _openOutside(Uri target) async {
    try {
      await launchUrl(target, mode: LaunchMode.externalApplication);
    } on Object {
      // Nothing on the phone can open it: staying in the shop is all we can do.
    }
  }

  void _onPageFinished() {
    _controller.runJavaScript(_bridge);
    if (!_shown || _offlineNow) {
      setState(() {
        _shown = true;
        _offlineNow = false;
      });
    }
  }

  void _onError(WebResourceError error) {
    if (error.isForMainFrame == false) return;
    if (error.errorType == WebResourceErrorType.webContentProcessTerminated) {
      _controller.reload(); // the system took the page's memory back: just load it again
      return;
    }
    if (_offline.contains(error.errorType)) setState(() => _offlineNow = true);
  }

  void _onMessage(JavaScriptMessage message) {
    final Object? data;
    try {
      data = jsonDecode(message.message);
    } on FormatException {
      return;
    }
    if (data is! Map<String, Object?>) return;
    switch (data['type']) {
      case 'open':
        final url = Uri.tryParse(data['url'] as String? ?? '');
        if (url != null) _openOutside(url);
      case 'theme':
        final color = Look.parse(data['color'] as String?);
        final dark = data['dark'] == true;
        if (color != null && (color != _background || dark != _dark)) {
          setState(() {
            _background = color;
            _dark = dark;
          });
        }
    }
  }

  /// Android: the page asks for the location (the map's "my location"); the phone asks the customer once.
  Future<GeolocationPermissionsResponse> _askForLocation(GeolocationPermissionsRequestParams request) async {
    final origin = Uri.tryParse(request.origin);
    if (origin == null || !isShopPage(widget.shop.url, origin.replace(path: '/'))) {
      return const GeolocationPermissionsResponse(allow: false, retain: false);
    }
    final allowed = await _location.invokeMethod<bool>('request') ?? false;
    return GeolocationPermissionsResponse(allow: allowed, retain: false);
  }

  Future<void> _retry() async {
    setState(() => _offlineNow = false);
    if (_shown) {
      await _controller.reload();
    } else {
      await _controller.loadRequest(widget.shop.url);
    }
  }

  /// Android's back button: closes the shop's sheets and goes back in the shop; on its first page it leaves.
  Future<void> _back() async {
    if (await _controller.canGoBack()) {
      await _controller.goBack();
    } else {
      await SystemNavigator.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final overlay = (_dark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark).copyWith(
      statusBarColor: Colors.transparent,
      systemNavigationBarColor: _background,
      systemNavigationBarIconBrightness: _dark ? Brightness.light : Brightness.dark,
    );
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: overlay,
      child: PopScope(
        canPop: false,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop) _back();
        },
        child: Stack(
          children: [
            Positioned.fill(
              child: ColoredBox(
                color: _background,
                // iOS: the shop fills the screen and keeps clear of the notch and the home indicator itself
                // (viewport-fit=cover, env(safe-area-inset-*)) — its sheets dim the status bar too. Android web
                // views do not report the system bars, so the app keeps the shop between them.
                child: defaultTargetPlatform == TargetPlatform.iOS
                    ? WebViewWidget(controller: _controller)
                    : SafeArea(child: WebViewWidget(controller: _controller)),
              ),
            ),
            Positioned.fill(
              child: IgnorePointer(
                ignoring: _shown,
                child: AnimatedOpacity(
                  opacity: _shown ? 0 : 1,
                  duration: const Duration(milliseconds: 280),
                  child: ShopSplash(shop: widget.shop),
                ),
              ),
            ),
            if (_offlineNow)
              Positioned.fill(
                child: StatusScreen(
                  icon: Icons.wifi_off_rounded,
                  title: widget.strings.offlineTitle,
                  text: widget.strings.offlineText,
                  action: widget.strings.retry,
                  onAction: _retry,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

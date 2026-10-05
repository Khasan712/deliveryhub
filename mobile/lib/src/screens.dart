import 'package:flutter/material.dart';

import 'config.dart';
import 'look.dart';

/// While the shop loads: its logo and name on its brand colour, so the app feels like the business's own.
class ShopSplash extends StatelessWidget {
  const ShopSplash({super.key, required this.shop});

  final Shop? shop;

  @override
  Widget build(BuildContext context) {
    final brand = Look.parse(shop?.brandColor) ?? Look.brand;
    final onBrand = Look.isDark(brand) ? Colors.white : Look.ink;
    final name = shop?.name ?? '';
    return ColoredBox(
      color: brand,
      child: SafeArea(
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _Logo(shop: shop, brand: brand),
              if (name.isNotEmpty) ...[
                const SizedBox(height: 20),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 32),
                  child: Text(
                    name,
                    textAlign: TextAlign.center,
                    style: TextStyle(color: onBrand, fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: -0.3),
                  ),
                ),
              ],
              if (shop?.tagline.isNotEmpty ?? false) ...[
                const SizedBox(height: 6),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 40),
                  child: Text(
                    shop!.tagline,
                    textAlign: TextAlign.center,
                    style: TextStyle(color: onBrand.withValues(alpha: 0.75), fontSize: 15),
                  ),
                ),
              ],
              const SizedBox(height: 36),
              SizedBox.square(
                dimension: 22,
                child: CircularProgressIndicator(strokeWidth: 2.4, color: onBrand.withValues(alpha: 0.8)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Logo extends StatelessWidget {
  const _Logo({required this.shop, required this.brand});

  final Shop? shop;
  final Color brand;

  @override
  Widget build(BuildContext context) {
    final initial = (shop?.name.trim().isNotEmpty ?? false) ? shop!.name.trim()[0].toUpperCase() : '';
    final letter = Center(
      child: Text(initial, style: TextStyle(color: brand, fontSize: 44, fontWeight: FontWeight.w800)),
    );
    final logo = shop?.logo;
    return Container(
      width: 112,
      height: 112,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(30),
        boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 24, offset: Offset(0, 10))],
      ),
      child: logo == null
          ? letter
          : Image.network(logo, fit: BoxFit.cover, errorBuilder: (_, _, _) => letter, gaplessPlayback: true),
    );
  }
}

/// A full screen with a message and one action: no shop chosen, no internet, an update needed.
class StatusScreen extends StatelessWidget {
  const StatusScreen({
    super.key,
    required this.icon,
    required this.title,
    required this.text,
    required this.action,
    required this.onAction,
    this.busy = false,
  });

  final IconData icon;
  final String title;
  final String text;
  final String action;
  final VoidCallback onAction;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final ink = dark ? Look.inkDark : Look.ink;
    return ColoredBox(
      color: dark ? Look.paperDark : Look.paper,
      child: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    color: dark ? const Color(0xFF1B1D22) : Colors.white,
                    borderRadius: BorderRadius.circular(22),
                    boxShadow: const [BoxShadow(color: Color(0x14000000), blurRadius: 18, offset: Offset(0, 6))],
                  ),
                  child: Icon(icon, size: 34, color: Look.brand),
                ),
                const SizedBox(height: 22),
                Text(
                  title,
                  textAlign: TextAlign.center,
                  style: TextStyle(color: ink, fontSize: 21, fontWeight: FontWeight.w800, letterSpacing: -0.2),
                ),
                const SizedBox(height: 8),
                Text(
                  text,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Look.muted, fontSize: 15, height: 1.4),
                ),
                const SizedBox(height: 28),
                FilledButton(
                  onPressed: busy ? null : onAction,
                  style: FilledButton.styleFrom(
                    backgroundColor: Look.brand,
                    foregroundColor: Colors.white,
                    minimumSize: const Size(200, 50),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                  ),
                  child: busy
                      ? const SizedBox.square(
                          dimension: 20,
                          child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white),
                        )
                      : Text(action),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';

/// The app's own colours (the shop brings its own): the indigo of DeliveryHub on the shop's warm background.
abstract final class Look {
  static const brand = Color(0xFF5B5BD6);
  static const brandDeep = Color(0xFF7C3AED);
  static const paper = Color(0xFFF6F5F2);
  static const paperDark = Color(0xFF0E0F11);
  static const ink = Color(0xFF16181D);
  static const inkDark = Color(0xFFF2F3F5);
  static const muted = Color(0xFF6B7280);

  /// `#rrggbb` → a colour; null when empty or malformed.
  static Color? parse(String? hex) {
    final match = RegExp(r'^#?([0-9a-fA-F]{6})$').firstMatch(hex?.trim() ?? '');
    return match == null ? null : Color(0xFF000000 | int.parse(match.group(1)!, radix: 16));
  }

  static bool isDark(Color color) => color.computeLuminance() < 0.4;
}

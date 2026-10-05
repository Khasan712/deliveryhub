import 'package:flutter/material.dart';

import 'config_repository.dart';
import 'look.dart';
import 'shell.dart';

class DeliveryHubApp extends StatelessWidget {
  const DeliveryHubApp({super.key, required this.source, required this.appVersion, this.shopBuilder});

  final ConfigSource source;
  final String appVersion;
  final ShopBuilder? shopBuilder;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'DeliveryHub',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorSchemeSeed: Look.brand, scaffoldBackgroundColor: Look.paper),
      darkTheme: ThemeData(
        colorSchemeSeed: Look.brand,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: Look.paperDark,
      ),
      home: Scaffold(
        body: Shell(source: source, appVersion: appVersion, shopBuilder: shopBuilder),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:package_info_plus/package_info_plus.dart';

import 'src/app.dart';
import 'src/config_repository.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // The shop paints the whole screen; the status and navigation bars sit on top of its colours.
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  final info = await PackageInfo.fromPlatform();
  runApp(DeliveryHubApp(source: ConfigRepository(), appVersion: info.version));
}

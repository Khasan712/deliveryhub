import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'config.dart';

/// Where the config comes from: the server, and a copy on the phone from the last answer, so the shop opens at
/// once (even offline) while the server is asked again.
abstract class ConfigSource {
  Future<AppConfig?> cached();

  /// The server's answer; throws when it cannot be reached.
  Future<AppConfig> fetch();
}

class ConfigRepository implements ConfigSource {
  ConfigRepository({http.Client? client, String baseUrl = platformUrl})
    : _client = client ?? http.Client(),
      _url = Uri.parse('$baseUrl/api/v1/app/config');

  static const _cacheKey = 'app_config';
  static const _timeout = Duration(seconds: 10);

  final http.Client _client;
  final Uri _url;

  @override
  Future<AppConfig?> cached() async {
    try {
      final raw = (await SharedPreferences.getInstance()).getString(_cacheKey);
      return raw == null ? null : AppConfig.fromJson(jsonDecode(raw) as Map<String, Object?>);
    } on Object {
      return null; // an unreadable copy is as good as none
    }
  }

  @override
  Future<AppConfig> fetch() async {
    final response = await _client.get(_url, headers: {'Accept': 'application/json'}).timeout(_timeout);
    if (response.statusCode != 200) throw http.ClientException('HTTP ${response.statusCode}', _url);
    final config = AppConfig.fromJson(jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, Object?>);
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(_cacheKey, jsonEncode(config.toJson()));
    return config;
  }
}

import 'dart:convert';

import 'package:deliveryhub/src/config.dart';
import 'package:deliveryhub/src/config_repository.dart';
import 'package:deliveryhub/src/links.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

const answer = {
  'shop': {
    'slug': 'navroz-choyxona',
    'name': "Navro'z Choyxona",
    'tagline': 'Milliy taomlar',
    'logo': 'https://deliveryhub.sizlarbilan.uz/media/public/logos/a.webp',
    'brand_color': '#1e5aa8',
    'url': 'https://navroz-choyxona.sizlarbilan.uz/',
  },
  'min_version': '1.0.0',
  'store': {'android': 'https://play.google.com/store/apps/details?id=uz.sizlarbilan.deliveryhub', 'ios': null},
};

void main() {
  group('config', () {
    test('reads what the server says', () {
      final config = AppConfig.fromJson(answer);
      expect(config.shop!.name, "Navro'z Choyxona");
      expect(config.shop!.url, Uri.parse('https://navroz-choyxona.sizlarbilan.uz/'));
      expect(config.androidStore, startsWith('https://play.google.com/'));
      expect(config.iosStore, isNull);
      expect(AppConfig.fromJson(config.toJson()).shop!.brandColor, '#1e5aa8');
    });

    test('no shop, or one without a usable address, is no shop', () {
      expect(AppConfig.fromJson({'shop': null, 'min_version': '1.0.0', 'store': {}}).shop, isNull);
      expect(Shop.fromJson({'name': 'X', 'url': 'not a url'}), isNull);
    });

    test('an app older than the minimum asks for an update', () {
      expect(compareVersions('1.2.10', '1.10.0'), -1);
      expect(compareVersions('1.0.0+7', '1.0'), 0);
      expect(compareVersions('2.0.0', '1.9.9'), 1);
      final config = AppConfig.fromJson({...answer, 'min_version': '1.1.0'});
      expect(config.requiresUpdate('1.0.3'), isTrue);
      expect(config.requiresUpdate('1.1.0'), isFalse);
    });
  });

  group('links', () {
    final shop = Uri.parse('https://navroz-choyxona.sizlarbilan.uz/');

    test('the shop stays in the app, everything else opens outside', () {
      expect(staysInApp(shop, Uri.parse('https://navroz-choyxona.sizlarbilan.uz/orders/12')), isTrue);
      expect(staysInApp(shop, Uri.parse('about:blank')), isTrue);
      expect(staysInApp(shop, Uri.parse('https://t.me/navroz_bot?start=login_x')), isFalse);
      expect(staysInApp(shop, Uri.parse('tel:+998901234567')), isFalse);
      expect(staysInApp(shop, Uri.parse('https://sharqona.sizlarbilan.uz/')), isFalse); // another business
      expect(staysInApp(shop, Uri.parse('http://navroz-choyxona.sizlarbilan.uz/')), isFalse);
    });
  });

  group('repository', () {
    setUp(() => SharedPreferences.setMockInitialValues({}));

    test('keeps the last answer on the phone', () async {
      final client = MockClient((request) async {
        expect(request.url.toString(), 'https://deliveryhub.sizlarbilan.uz/api/v1/app/config');
        return http.Response.bytes(utf8.encode(jsonEncode(answer)), 200);
      });
      final repository = ConfigRepository(client: client);
      expect(await repository.cached(), isNull);
      expect((await repository.fetch()).shop!.slug, 'navroz-choyxona');
      expect((await ConfigRepository(client: client).cached())!.shop!.slug, 'navroz-choyxona');
    });

    test('an error answer is an error, and the copy stays', () async {
      final ok = ConfigRepository(client: MockClient((_) async => http.Response(jsonEncode(answer), 200)));
      await ok.fetch();
      final down = ConfigRepository(client: MockClient((_) async => http.Response('Bad gateway', 502)));
      await expectLater(down.fetch(), throwsA(isA<http.ClientException>()));
      expect((await down.cached())!.shop!.slug, 'navroz-choyxona');
    });
  });
}

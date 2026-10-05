import 'dart:async';

import 'package:deliveryhub/src/app.dart';
import 'package:deliveryhub/src/config.dart';
import 'package:deliveryhub/src/config_repository.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Shop shop(String slug) => Shop(
  slug: slug,
  name: slug,
  tagline: '',
  logo: null,
  brandColor: '#1e5aa8',
  url: Uri.parse('https://$slug.sizlarbilan.uz/'),
);

AppConfig config({Shop? shop, String minVersion = '1.0.0'}) => AppConfig(shop: shop, minVersion: minVersion);

/// The server and the phone's copy, arranged by each test.
class FakeSource implements ConfigSource {
  FakeSource({this.copy, List<FutureOr<AppConfig> Function()>? answers}) : answers = answers ?? [];

  AppConfig? copy;
  final List<FutureOr<AppConfig> Function()> answers;
  int asked = 0;

  @override
  Future<AppConfig?> cached() async => copy;

  @override
  Future<AppConfig> fetch() async {
    asked++;
    if (answers.isEmpty) throw Exception('offline');
    return answers.removeAt(0)();
  }
}

Future<void> start(WidgetTester tester, FakeSource source, {String version = '1.0.0'}) async {
  await tester.pumpWidget(
    DeliveryHubApp(
      source: source,
      appVersion: version,
      shopBuilder: (context, shop, strings) => Text('shop ${shop.url}'),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('opens the shop from the phone\'s copy at once, then the one chosen in the panel', (tester) async {
    final server = Completer<AppConfig>();
    final source = FakeSource(copy: config(shop: shop('sharqona')), answers: [() => server.future]);
    await tester.pumpWidget(
      DeliveryHubApp(source: source, appVersion: '1.0.0', shopBuilder: (_, shop, _) => Text('shop ${shop.url}')),
    );
    await tester.pump();
    expect(find.text('shop https://sharqona.sizlarbilan.uz/'), findsOneWidget);

    server.complete(config(shop: shop('navroz-choyxona')));
    await tester.pumpAndSettle();
    expect(find.text('shop https://navroz-choyxona.sizlarbilan.uz/'), findsOneWidget);
  });

  testWidgets('says so when no shop is chosen, and asks again on retry', (tester) async {
    final source = FakeSource(answers: [() => config(), () => config(shop: shop('sharqona'))]);
    await start(tester, source);
    expect(find.text("Hozircha do'kon yo'q"), findsOneWidget);

    await tester.tap(find.text('Qayta urinish'));
    await tester.pumpAndSettle();
    expect(find.text('shop https://sharqona.sizlarbilan.uz/'), findsOneWidget);
  });

  testWidgets('without internet and without a copy: an offline screen until the server answers', (tester) async {
    final source = FakeSource();
    await start(tester, source);
    expect(find.text("Internet aloqasi yo'q"), findsOneWidget);

    source.answers.add(() => config(shop: shop('sharqona')));
    await tester.tap(find.text('Qayta urinish'));
    await tester.pumpAndSettle();
    expect(find.text('shop https://sharqona.sizlarbilan.uz/'), findsOneWidget);
  });

  testWidgets('offline with a copy: the shop opens anyway', (tester) async {
    await start(tester, FakeSource(copy: config(shop: shop('sharqona'))));
    expect(find.text('shop https://sharqona.sizlarbilan.uz/'), findsOneWidget);
    expect(find.text("Internet aloqasi yo'q"), findsNothing);
  });

  testWidgets('an app too old for the server asks for an update', (tester) async {
    await start(tester, FakeSource(answers: [() => config(shop: shop('sharqona'), minVersion: '1.2.0')]), version: '1.1.9');
    expect(find.text('Ilovani yangilang'), findsOneWidget);
    expect(find.textContaining('shop '), findsNothing);
  });

  testWidgets('asks the server again when the app comes back to the screen', (tester) async {
    final source = FakeSource(
      answers: [() => config(shop: shop('sharqona')), () => config(shop: shop('navroz-choyxona'))],
    );
    await start(tester, source);
    expect(source.asked, 1);

    // Back from the background right away: not asked again so soon.
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(source.asked, 1);
  });
}

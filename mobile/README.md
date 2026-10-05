# mobile — DeliveryHub app for Android and iOS

The app opens the **shop of one business**, chosen in our panel ("Mobil ilova", `/mobile`): we show a business its
own shop on a phone, the way its customers would use it. Flutter 3.44 · Dart 3.12 · `webview_flutter`.

## Why a web view

The shop inside the app *is* the shop on the server (client-ui at `https://<slug>.<domain>/`), not a copy written
again in Dart:

- **Every deploy reaches every phone at once** — design, menu, prices, new features. Nobody has to update the app from
  Google Play or the App Store; an open shop reloads itself onto the new build at a calm moment (`/version.json`,
  client-ui `src/lib/updates.ts`; a missing lazy chunk after a deploy reloads once instead of breaking).
- One shop for the website, the Telegram Mini App and the app: a feature is built and tested once.

A fully native app would feel a little smoother, but every change would wait for a store release and for customers to
update — the opposite of what we want. The app itself changes rarely (only for what a web page cannot do); when it
must, the server's `MOBILE_MIN_VERSION` makes older installs ask for an update.

## What the app does itself

- Asks our platform which shop to open: `GET <PLATFORM_URL>/api/v1/app/config` (docs/api.md, "Mobile app") — on every
  start and whenever it comes back to the screen (at most every 20 s). The last answer is kept on the phone, so the
  shop opens at once, offline too, while the server is asked again. Another business chosen in the panel → a fresh
  web view with that shop.
- While the shop loads: its logo and name on its brand colour. No shop chosen, no internet without a saved copy, an
  app too old for the server: a screen saying so, with a button (retry / update).
- Links that leave the shop go to the app made for them: the Telegram sign-in (`t.me`), the phone (`tel:`), maps,
  other sites. Android web views ignore `window.open`, so a small script in every page hands those to the app.
- Android: the back button closes the shop's sheets and goes back in the shop, and leaves the app on its first page;
  the map's "my location" asks for the location permission (`MainActivity.kt`). iOS: swipe back.
- The status and navigation bars take the shop's colours (light/dark), reported by the page.
- The shop knows it runs in the app: its user agent ends with `DeliveryHubApp/<version> (android|ios)`.

## Code

```
lib/main.dart              start: edge-to-edge, the app's version
lib/src/config.dart        AppConfig / Shop from the server, PLATFORM_URL, version comparison
lib/src/config_repository.dart  the server + the copy on the phone (shared_preferences)
lib/src/shell.dart         what to show: the shop, or why not; asks again on return to the screen
lib/src/shop_view.dart     the web view: links, back button, location, colours, offline screen
lib/src/links.dart         what stays in the app (the shop's own pages) and what goes outside
lib/src/screens.dart       the shop's splash and the status screens
lib/src/strings.dart       the app's own words (Uzbek; Russian on a Russian phone)
android/…/MainActivity.kt  the location permission for the web view
```

## Run

```bash
flutter pub get
flutter test && flutter analyze
flutter run                                   # against production (https://deliveryhub.sizlarbilan.uz)
```

Against a stack on this computer (e.g. the throwaway one of `make e2e`, port 8200 — pick a business in its panel):

```bash
flutter run --dart-define=PLATFORM_URL=http://hub.localhost:8200      # iOS simulator (*.localhost reaches the Mac)
adb reverse tcp:8200 tcp:8200                                            # Android emulator: its localhost:8200 → the Mac
flutter run --dart-define=PLATFORM_URL=http://localhost:8200
```

Plain http is allowed only to `localhost` (iOS: `NSAppTransportSecurity`; Android: debug builds only,
`android/app/src/debug/res/xml/network_security_config.xml`). Android builds need a JDK — Android Studio's works:
`export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`.

## Release

The version is `version:` in `pubspec.yaml` (`1.0.0+1` → name 1.0.0, build 1); raise the build number for every
upload.

**Android (Google Play)**

1. Once: an upload key — `keytool -genkey -v -keystore ~/deliveryhub-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload`
   — and `android/key.properties` (never committed):
   ```
   storePassword=…
   keyPassword=…
   keyAlias=upload
   storeFile=/Users/<you>/deliveryhub-upload.jks
   ```
   Keep the key and its passwords safe: Play needs the same key for every update. Without `key.properties` a release
   build is signed with the debug key (fine for trying it on a phone, not for the store).
2. `flutter build appbundle` → `build/app/outputs/bundle/release/app-release.aab` → Play Console.
   For a phone directly: `flutter build apk` → `build/app/outputs/flutter-apk/app-release.apk`.

**iOS (App Store / TestFlight)** — an Apple Developer account is needed: open `ios/Runner.xcworkspace` in Xcode,
choose the team under Signing & Capabilities, then `flutter build ipa` and upload with Xcode's Organizer or
Transporter. Bundle id: `uz.sizlarbilan.deliveryhub`; iOS 15 or newer.

After publishing, put the store addresses in the server's `.env` (`MOBILE_ANDROID_URL`, `MOBILE_IOS_URL`) — the
"update" screen opens them.

## Icons

The app's mark (a white bag on the DeliveryHub indigo → violet) is drawn by `tool/make_icons.py` (Pillow:
`backend/.venv/bin/python mobile/tool/make_icons.py mobile`) into every size of
`ios/Runner/Assets.xcassets/AppIcon.appiconset`, `android/app/src/main/res/mipmap-*` (an adaptive icon on Android 8+:
`mipmap-anydpi-v26/ic_launcher.xml`) and the launch screens (`LaunchImage`, `drawable-*/launch_mark.png`).

/// What the app opens, as our platform answers `GET /api/v1/app/config` (docs/api.md, "Mobile app"): the shop of
/// the business chosen in our panel, the oldest app version still allowed and where to update.
library;

/// Our platform. A build for another server: `--dart-define=PLATFORM_URL=http://localhost:8200`.
const platformUrl = String.fromEnvironment('PLATFORM_URL', defaultValue: 'https://deliveryhub.sizlarbilan.uz');

class Shop {
  const Shop({
    required this.slug,
    required this.name,
    required this.tagline,
    required this.logo,
    required this.brandColor,
    required this.url,
  });

  final String slug;
  final String name;
  final String tagline;
  final String? logo;

  /// `#rrggbb`, or empty: the app's own colour.
  final String brandColor;
  final Uri url;

  static Shop? fromJson(Object? json) {
    if (json is! Map<String, Object?>) return null;
    final url = Uri.tryParse(json['url'] as String? ?? '');
    if (url == null || !url.hasScheme || url.host.isEmpty) return null;
    return Shop(
      slug: json['slug'] as String? ?? '',
      name: json['name'] as String? ?? '',
      tagline: json['tagline'] as String? ?? '',
      logo: json['logo'] as String?,
      brandColor: json['brand_color'] as String? ?? '',
      url: url,
    );
  }

  Map<String, Object?> toJson() => {
    'slug': slug,
    'name': name,
    'tagline': tagline,
    'logo': logo,
    'brand_color': brandColor,
    'url': url.toString(),
  };
}

class AppConfig {
  const AppConfig({required this.shop, required this.minVersion, this.androidStore, this.iosStore});

  /// Null: no business chosen (or it is suspended).
  final Shop? shop;
  final String minVersion;
  final String? androidStore;
  final String? iosStore;

  factory AppConfig.fromJson(Map<String, Object?> json) {
    final store = json['store'] is Map<String, Object?> ? json['store'] as Map<String, Object?> : const {};
    return AppConfig(
      shop: Shop.fromJson(json['shop']),
      minVersion: json['min_version'] as String? ?? '0.0.0',
      androidStore: store['android'] as String?,
      iosStore: store['ios'] as String?,
    );
  }

  Map<String, Object?> toJson() => {
    'shop': shop?.toJson(),
    'min_version': minVersion,
    'store': {'android': androidStore, 'ios': iosStore},
  };

  /// This app is too old for the server: it has to be updated from the store first.
  bool requiresUpdate(String appVersion) => compareVersions(appVersion, minVersion) < 0;
}

/// Compares "1.2.10" with "1.10.0" number by number (a missing part is 0, a build suffix is ignored).
int compareVersions(String a, String b) {
  List<int> parts(String version) =>
      version.split('+').first.split('.').map((part) => int.tryParse(part.trim()) ?? 0).toList();
  final left = parts(a);
  final right = parts(b);
  for (var index = 0; index < 3; index++) {
    final difference = (index < left.length ? left[index] : 0) - (index < right.length ? right[index] : 0);
    if (difference != 0) return difference.sign;
  }
  return 0;
}

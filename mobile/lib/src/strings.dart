import 'dart:ui';

/// The few words the app says itself (the shop inside speaks for itself). Russian on a Russian phone, Uzbek
/// otherwise.
class Strings {
  const Strings._(this._ru);

  factory Strings.of(Locale locale) => Strings._(locale.languageCode == 'ru');

  final bool _ru;

  String get retry => _ru ? 'Повторить' : 'Qayta urinish';
  String get noShopTitle => _ru ? 'Магазин пока не выбран' : "Hozircha do'kon yo'q";
  String get noShopText => _ru
      ? 'Приложение ещё не подключено к магазину. Попробуйте немного позже.'
      : "Ilova hali do'konga ulanmagan. Birozdan so'ng qayta urinib ko'ring.";
  String get offlineTitle => _ru ? 'Нет соединения с интернетом' : "Internet aloqasi yo'q";
  String get offlineText =>
      _ru ? 'Проверьте подключение и попробуйте снова.' : "Ulanishni tekshirib, qayta urinib ko'ring.";
  String get updateTitle => _ru ? 'Обновите приложение' : 'Ilovani yangilang';
  String get updateText => _ru
      ? 'Вышла новая версия приложения. Обновите его, чтобы продолжить.'
      : "Ilovaning yangi versiyasi chiqdi. Davom etish uchun uni yangilang.";
  String get update => _ru ? 'Обновить' : 'Yangilash';
  String get loading => _ru ? 'Загрузка…' : 'Yuklanmoqda…';
}

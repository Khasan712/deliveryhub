/// Which addresses the shop opens inside the app and which go to another app (Telegram, the phone, maps, a
/// browser): the app shows the shop, not the whole web.
library;

/// True when [target] is a page of the shop itself (same scheme, host and port as [shop]).
bool isShopPage(Uri shop, Uri target) {
  if (target.scheme != 'http' && target.scheme != 'https') return false;
  return target.host == shop.host && target.port == shop.port && target.scheme == shop.scheme;
}

/// Pages the web view may load without leaving the app: the shop, and `about:blank` (an empty frame).
bool staysInApp(Uri shop, Uri target) => target.toString() == 'about:blank' || isShopPage(shop, target);

# DeliveryHub API v1

Every UI calls the API on **its own host**: `/api/v1/...`. The host selects the business and the API:

| UI | Host | API |
|---|---|---|
| client-ui (shop, Mini App) | `<slug>.<domain>` (dev: `<slug>.localhost:<port>`) | [Shop API](#shop-api) |
| admin-ui (admin panel, admin Mini App) | `<slug>-admin.<domain>` (dev: `<slug>-admin.localhost:<port>`) | [Admin API](#admin-api) |
| deliveryhub-ui (our panel) | `deliveryhub.<domain>` (dev: `hub.localhost:<port>`) | [Platform API](#platform-api) |

The machine-readable schema of each API: `GET /api/v1/schema/` on its host (OpenAPI 3); generated copies live in
[`docs/openapi/`](openapi/) (`make schema` refreshes them). `GET /healthz` answers `{"status": "ok"}` on any host.

## Conventions

* JSON in and out; file uploads use `multipart/form-data`.
* Money is an integer amount in so'm (UZS). Dates are ISO-8601 with time zone.
* Names come in both languages (`name_uz`, `name_ru`); the UI picks one.
* **Errors**: `{"error": "<code>", ...extra}`. Validation: `{"error": "validation", "fields": {"phone": ["required"]}}`
  (field error codes: `required`, `invalid`, `blank`, `null`, `max_length`, `min_value`, `does_not_exist`, `unique`, ...).

  | Status | `error` |
  |---|---|
  | 400 | `validation` or an endpoint-specific code |
  | 401 | `auth_required` |
  | 403 | `forbidden`, `csrf_failed` |
  | 404 | `not_found`; `unknown_host` (no business has this host) |
  | 405 | `method_not_allowed` |
  | 429 | `too_many_requests` (`retry_after` seconds when known) |
  | 503 | `business_suspended` (any request to a suspended business) |

* **Pagination** (lists marked *paginated*): `?page=1&page_size=20` (max 100) →
  `{"count": 135, "page": 1, "pages": 7, "results": [...]}`.
* **Caching**: every `GET` of an API answers with an `ETag` and `Cache-Control: private, no-cache` — the browser keeps
  the answer and asks again with `If-None-Match`; an unchanged one is a `304` without a body (a menu or an order list
  costs nothing on mobile data). Uploaded files (`/media/...`) never change at their address: cached for a year.
* **Images**: uploads are stored as WebP at the size phones show them — a product photo as `image` (up to 1280 px,
  the product sheet) and `thumb` (up to 512 px, cards and lists; the image itself for photos uploaded before), a logo
  up to 512 px. Upload limits stay (5 MB a product photo, 2 MB a logo).

### Authentication

* **Admin and Platform API — session cookie + CSRF.**
  1. `GET /api/v1/auth/csrf` → `204`, sets the `csrftoken` cookie.
  2. Every `POST/PUT/PATCH/DELETE` sends header `X-CSRFToken: <value of the csrftoken cookie>`.
  3. `POST /api/v1/auth/login` `{"phone": "+998901234567", "password": "..."}` → the same body as `GET /auth/me`
     (sets the session cookie and a new `csrftoken`) or `400 {"error": "invalid_credentials"}`; `429 too_many_requests`
     after 10 failed attempts in 15 minutes. The phone may be typed loosely (`90 123 45 67`).
  4. `GET /api/v1/auth/me` → `{"user": ...}` or `401`. `POST /api/v1/auth/logout` → `204`.
* **Shop API — bearer token.** Sign-in endpoints return `token`; send `Authorization: Bearer <token>`.
  A token is valid for 90 days and only on the shop that issued it. Endpoints marked *auth* need it; others accept it
  optionally.

### Working hours
A business sets them in its admin panel; the shop shows them and takes orders only while open. Every API shows them
as `WorkingHours`:
```json
{"week": [{"open": "09:00", "close": "22:00"}, ..., null], "timezone": "Asia/Tashkent",
 "open": true, "opens_at": null, "closes_at": "2026-10-05T22:00:00+05:00"}
```
* `week` — seven shifts, Monday first; `null` is a day off. A `close` that is not after `open` is on the next day
  (`"18:00"`–`"02:00"` closes at 02:00 the next night, and that night still counts as the day it started);
  `"00:00"`–`"24:00"` is the whole day. `week: null` — no hours set: open at any time.
* `open` / `opens_at` / `closes_at` — at the time of the response, in `timezone`: while open, when it closes (`null`:
  never — open around the clock); while closed, when it opens next (`null`: every day off). Back-to-back shifts
  (Monday 18:00–24:00, Tuesday 00:00–02:00) count as one.

---

## Shop API

### `GET /api/v1/shop`
Business profile and the whole catalog in one call.
```json
{
  "business": {"name": "Burger House", "tagline": "", "support_phone": "+998712001122",
               "address": "Amir Temur ko'chasi, 15", "lat": 41.311081, "lng": 69.279737, "working_hours": WorkingHours,
               "delivery_time": "30–45", "min_order": 0, "brand_color": "#ff6b00", "logo": "/media/burger_house/logos/a.png"},
  "bot_username": "burger_house_bot",
  "categories": [{"id": 1, "name_uz": "Burgerlar", "name_ru": "Бургеры"}],
  "products": [Product],
  "popular": [12, 4, 7],
  "client": Client | null
}
```
`Product`: `{"id", "name_uz", "name_ru", "desc_uz", "desc_ru", "price", "unit_uz", "unit_ru", "category_id", "image",
"thumb", "frozen": bool}` (`image`: URL or `null`, `thumb`: its small copy — see [Images](#conventions); `frozen` — not
available right now: shown, but cannot be ordered). `popular`: product ids, most ordered first. `bot_username`: the customers' bot or `null`.
`business.address` / `lat` / `lng`: where pickup orders are collected (`""` / `null` for a business not yet put on the
map).

`Client`: `{"id", "first_name", "last_name", "phone", "telegram": bool, "tg_nick", "lang": "uz"|"ru"|"", "address", "lat", "lng"}`
(`address`/`lat`/`lng` — last delivery address, to prefill checkout).

### `GET /api/v1/products/{id}/image`
Image bytes of a product stored in the database (old products). `Product.image` already points here when needed.

### Sign-in
| Request | Response |
|---|---|
| `POST /api/v1/auth/telegram/webapp` `{"init_data": "<Telegram.WebApp.initData>"}` | `{"token", "client", "created": bool}`; `401 invalid_init_data` |
| `POST /api/v1/auth/telegram/start` | `{"token", "url": "https://t.me/<bot>?start=login_<token>", "expires_in": 300}`; `503 telegram_unavailable` |
| `GET /api/v1/auth/telegram/check?token=...` (poll every 2 s) | `{"status": "pending"}` / `{"status": "expired"}` / `{"status": "confirmed", "token", "client", "created"}`; `404` once used |
| `POST /api/v1/auth/phone/request` `{"phone"}` | `{"ok": true, "phone": "+998901234567", "resend_in": 60, "ttl": 300, "debug_code"?: "123456"}`; `400 invalid_phone`; `429 too_soon` (`retry_after`) / `too_many_requests`; `502 sms_failed` |
| `POST /api/v1/auth/phone/verify` `{"phone", "code", "lang"?}` | `{"token", "client", "created"}`; `400 invalid_code` (`attempts_left`) / `code_expired`; `429 too_many_attempts` |

Phone numbers: Uzbek only (`+998` + 9 digits); `debug_code` is returned only in local development.

### `GET /api/v1/me` *(auth)* · `PATCH /api/v1/me` *(auth)*
PATCH body (all optional): `{"first_name", "last_name", "lang": "uz"|"ru"}` → `{"client"}`.

### Orders *(auth)*
* `GET /api/v1/orders` → `{"orders": [Order]}` (the customer's latest 50, newest first).
* `POST /api/v1/orders` →  `201 {"order": Order}`. Header `Idempotency-Key: <random, 8–64 of A-Z a-z 0-9 _ ->` — the
  same for every try of one checkout: sent again (an answer lost on a bad network) it returns the order already placed
  instead of a second one; `409 order_in_progress` while the first try is still being placed (try again in a moment).
  ```json
  {"items": [{"product_id": 1, "quantity": 2}], "name": "Aziz", "phone": "+998901234567",
   "delivery_type": "delivery" | "pickup", "address": "Chilonzor 9", "lat": 41.31, "lng": 69.27,
   "payment_method": "cash" | "card", "comment": "", "platform": "web" | "miniapp", "lang": "uz" | "ru"}
  ```
  Errors: `business_closed` (`opens_at`: iso or `null` — outside the [working hours](#working-hours)), `validation`
  with `fields.name` / `fields.phone` / `fields.address` (`required` or `invalid`; delivery needs an address or
  coordinates), `empty` (no items), `product_not_found` (`detail`: ids), `product_unavailable` (`detail`: ids of
  frozen products), `min_order` (`min_order`), `429 too_many_requests`. Prices always come from the catalog.
* `GET /api/v1/orders/{id}` → `{"order": Order}`.

`Order`:
```json
{"id": 131, "status": "ordered" | "on_the_way" | "completed" | "rejected", "source": "web" | "miniapp" | "bot" | "admin",
 "created_at": "...", "updated_at": "...", "total": 82000,
 "items": [{"product_id": 1, "name_uz": "...", "name_ru": "...", "image": "<thumb>", "quantity": 2, "price": 35000, "total": 70000}],
 "customer_name": "Aziz", "phone": "+998901234567", "address": "Chilonzor 9", "lat": "41.31", "lng": "69.27",
 "delivery_type": "delivery", "payment_method": "card", "comment": ""}
```
Status meaning for customers: `ordered` — accepted, being prepared; `on_the_way` (delivery only); `completed` —
delivered / handed over (pickup); `rejected` — cancelled.

### Map: addresses ⇄ points
The checkout's map asks the backend, which asks a Nominatim server (OpenStreetMap data, `GEOCODER_URL`); answers are
cached and the public server's limit (one request a second) is kept for all businesses together. The map tiles
themselves come straight from OpenFreeMap.
* `GET /api/v1/geo/reverse?lat=41.311081&lng=69.279737&lang=uz|ru` → `{"address": "Amir Temur ko'chasi, 15, Yunusobod
  tumani, Toshkent"}` (`""` when the map knows no address there).
* `GET /api/v1/geo/search?q=Chilonzor&lang=uz|ru` → `{"results": [{"address", "lat", "lng"}]}` — up to 5, in
  Uzbekistan (`GEOCODER_COUNTRIES`), the surroundings of the business first. Search on Enter, not on every keystroke.

Errors: `validation` (`lat`/`lng` out of range, `q` shorter than 2), `429 too_many_requests` (per visitor: 60
addresses / 20 searches in 5 minutes), `503 geocoder_unavailable` (out of reach or switched off — the address is
typed instead).

---

## Admin API

Staff of one business (session auth). Roles: `admin` (everything) and `manager` (everything except staff users).

`StaffUser`: `{"id", "phone_number", "first_name", "last_name", "role": "admin"|"manager", "is_active", "created_at"}`.

### Auth
* `GET /api/v1/auth/csrf`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout` (see Conventions).
* `GET /api/v1/auth/me` →
  `{"user": StaffUser, "business": {"name", "slug", "logo", "brand_color", "shop_url"}}` (`shop_url` — the public shop address).
* `POST /api/v1/auth/telegram` `{"init_data"}` — sign-in from the staff bot's Mini App (Telegram account linked to
  a user) → `{"user": StaffUser}`; `403 not_linked` / `403 invalid_init_data`.

### Working hours
* `GET /api/v1/business` → `WorkingHours` (see [Working hours](#working-hours)) — every staff member.
* `PATCH /api/v1/business` `{"week": [...] | null}` → `WorkingHours` — admin role only (`403` for managers);
  `fields.week: ["invalid"]` for anything but seven shifts / `null`s.

### `GET /api/v1/dashboard`
```json
{"orders": {"total": 120, "new": 3, "on_the_way": 1, "completed": 100, "last_7_days": 35},
 "clients": {"total": 40, "new_7_days": 6}, "products": {"total": 60}, "categories": {"total": 12},
 "by_status": [{"status": "completed", "count": 100}],
 "daily": [{"date": "2026-10-01", "count": 5}],
 "latest_orders": [OrderSummary]}
```
`daily` covers the last 7 days (days without orders are included with `0`). Counts never include unfinished carts.

### Orders
* `GET /api/v1/orders?status=&source=&search=&page=&page_size=` — *paginated* `OrderSummary`, newest first.
  `search` matches id, customer name, phone.
* `GET /api/v1/orders/{id}` → `OrderDetail`.
* `PATCH /api/v1/orders/{id}` `{"status": "ordered"|"on_the_way"|"completed"|"rejected"}` → `OrderDetail`
  (the customer gets a Telegram message about the change).

`OrderSummary`: `{"id", "status", "source", "created_at", "customer_name", "phone", "total", "items_count", "client_id"}`.
`OrderDetail`: OrderSummary + `{"updated_at", "address", "lat", "lng", "delivery_type", "payment_method", "comment",
"created_by": {"id", "name"} | null, "client": {"id", "first_name", "last_name", "phone", "tg_nick"} | null,
"items": [{"product_id", "name_uz", "name_ru", "quantity", "price", "total"}]}`.

### Clients (customers)
* `GET /api/v1/clients?search=&page=` — *paginated*
  `{"id", "first_name", "last_name", "phone", "tg_nick", "telegram": bool, "lang", "orders_count", "created_at"}`.
* `GET /api/v1/clients/{id}` → the same + `{"location", "orders": [OrderSummary]}`.
* `PATCH /api/v1/clients/{id}` `{"first_name", "last_name", "phone", "location"}` → client.

### Catalog
* Products — `GET /api/v1/products?search=&category=&frozen=true|false&page=` (*paginated*), `POST /api/v1/products`,
  `GET|PATCH|DELETE /api/v1/products/{id}`.
  `Product` (admin): `{"id", "name_uz", "name_ru", "desc_uz", "desc_ru", "price", "unit": Unit | null,
  "category": Category | null, "image", "thumb", "frozen": bool, "frozen_at", "created_at"}`.
  Create / update fields (multipart when an image is attached): `name_uz`, `name_ru`, `price` (integer),
  `desc_uz`, `desc_ru`, `unit_id`, `category_id`, `image` (file; `null` or an empty value removes it), `frozen`
  (bool — any staff member; the shop shows the product as unavailable and refuses orders for it, staff may still sell
  it). Required on create: `name_uz`, `name_ru`, `price`.
* Categories — `GET /api/v1/categories?search=` → `[{"id", "name_uz", "name_ru", "products_count"}]` (not paginated);
  `POST`, `GET|PATCH|DELETE /{id}` with `{"name_uz", "name_ru"}` (deleting a category keeps its products).
* Units — `GET /api/v1/units` → `[{"id", "name_uz", "name_ru"}]`; `POST {"name_uz", "name_ru"}`.

### Staff users *(admin role only — others get 403)*
* `GET /api/v1/users?search=&page=` (*paginated* StaffUser), `POST`, `GET|PATCH|DELETE /api/v1/users/{id}`.
  Body: `{"phone_number", "first_name", "last_name", "role", "is_active", "password"}` — `password` required on
  create (8+ chars), optional on update. Deleting yourself → `400 cannot_delete_self`; changing your own role or
  deactivating yourself → `400 cannot_change_self`.

### Sales (point of sale, orders without a customer account)
* `GET /api/v1/sales` →
  ```json
  {"categories": [{"id", "name_uz", "name_ru"}],
   "products": [{"id", "name_uz", "name_ru", "price", "unit_uz", "unit_ru", "category_id", "image", "thumb", "frozen"}],
   "recent": [SaleSummary], "stats": {"count", "revenue", "average", "all_orders_today"},
   "voice": {"gemini": bool, "live": bool}}
  ```
* `POST /api/v1/sales`
  `{"items": [{"product_id", "quantity"}], "customer_name", "phone", "delivery_type", "address", "payment_method",
  "status", "comment"}` → `201 {"order": SaleSummary, "stats"}`. Defaults: `delivery_type=pickup`; `status` —
  `completed` for pickup, `ordered` for delivery; frozen products are sold too (the UI warns). Errors: `empty`,
  `product_not_found`.
  `SaleSummary`: `{"id", "name", "phone", "status", "total", "items_count", "created_at"}`.

### Voice order entry (Gemini)
* `POST /api/v1/voice/token` → `{"token", "url", "setup"}` — a single-use Gemini Live session for live captions:
  open a WebSocket to `url + "?access_token=" + token`, send `setup` as the first message, then stream 16 kHz mono
  PCM16 audio as `{"realtimeInput": {"audio": {"data": "<base64>", "mimeType": "audio/pcm;rate=16000"}}}`.
  Errors: `400 not_configured`, `502 live_unavailable`.
* `POST /api/v1/voice/parse` — the recorded clip (multipart: `audio` file, `state` JSON string, `live_text`, `lang`) or
  text (JSON: `{"text", "state", "lang"}`) → `{"result": VoiceResult, "engine": "gemini" | "local"}`. `lang` (`uz` |
  `ru`, default `uz`) is the language of `reply`.
  `state` is the current form: `{"customer_name", "phone", "address", "delivery_type", "payment_method", "status",
  "comment", "items": [{"product_id", "quantity"}]}`.
  `VoiceResult` = the complete updated form + `{"unmatched": [words], "submit": bool, "reply": "...", "transcript": "..."}`.
  Errors: `400 empty` / `not_configured` / `empty_transcript` / `audio_too_large` (10 MB), `502 ai_failed` /
  `transcription_failed`.

### Telegram (staff bot)
* `GET /api/v1/telegram` →
  `{"bot": {"username", "alive"} | null, "voice_ready": bool, "my_links": [Link], "team_links": [Link], "users": [{"id", "name"}]}`
  (`team_links` and `users` are filled for admins only).
  `Link`: `{"id", "user": {"id", "name"}, "telegram_id", "first_name", "username", "lang", "notify_orders", "blocked": bool, "created_at", "last_seen_at"}`.
* `POST /api/v1/telegram/invites` `{"user_id"?}` → `201 {"url": "https://t.me/<bot>?start=inv_...", "qr_svg": "<svg ...>", "user": "Aziz", "expires_at"}`
  (for yourself; admins may pass any active `user_id`). Errors: `400 bot_missing`, `403 forbidden`.
* `PATCH /api/v1/telegram/links/{id}` `{"notify_orders": bool}` → Link · `DELETE /api/v1/telegram/links/{id}` → `204`
  (your own links; admins — any).

---

## Platform API

Our staff only (superusers of the platform; session auth).

* Auth: `GET /api/v1/auth/csrf`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`,
  `GET /api/v1/auth/me` → `{"user": {"id", "phone_number", "first_name"}}`.

### Businesses
* `GET /api/v1/businesses` → `{"domain": "portex.uz", "totals": {"businesses", "active", "orders_today", "revenue_today"},
  "results": [BusinessCard]}` (`domain` — businesses live at `<slug>.<domain>`).
* `GET /api/v1/businesses/check-slug?slug=burger-house` → `{"available": true}` or
  `{"available": false, "error": "slug_invalid" | "slug_reserved" | "slug_taken"}`.
* `POST /api/v1/businesses` (JSON, or multipart with `logo`) →  `201 {"business": BusinessDetail, "credentials": {"phone", "password"}}`
  ```json
  {"name": "Burger House", "slug": "burger-house", "owner_name": "Aziz", "owner_phone": "+998901112233",
   "owner_password": "" , "tagline": "", "support_phone": "", "delivery_time": "30–45", "min_order": 0, "brand_color": "#ff6b00",
   "address": "Amir Temur ko'chasi, 15", "lat": 41.311081, "lng": 69.279737}
  ```
  Creates the business schema, its domains and the owner's admin account (`owner_password` empty → generated; the
  password is returned only here). Slug: 3–30 chars, `a-z`, `0-9`, `-`. The place on the map (`address`, `lat`,
  `lng` — the shop's pickup address) is required. Errors: `validation` (`fields.slug`: `slug_invalid` /
  `slug_reserved` / `slug_taken`; `fields.owner_phone`: `invalid`; `fields.address` / `lat` / `lng`: `required`).
* `GET /api/v1/businesses/{slug}` → `BusinessDetail`.
* `PATCH /api/v1/businesses/{slug}` (`name`, `tagline`, `support_phone`, `address`, `lat` + `lng` (always together),
  `delivery_time`, `min_order`, `brand_color`, `logo`) → `BusinessDetail`.
* `POST /api/v1/businesses/{slug}/status` `{"status": "active" | "suspended"}` → `BusinessDetail`.
* `DELETE /api/v1/businesses/{slug}` `{"confirm": "<slug>"}` → `204` — deletes the business for good: its schema (staff,
  catalog, customers, orders), domains, bots, setup links and uploaded files; its bots are released first (Mini App
  button, commands and descriptions reset — the bots stay their owners'; a bot created through our platform bot stays
  managed by it on Telegram's side, as the Bot API has no way to let it go). Only a suspended business:
  `409 business_active`; `confirm` must be the slug: `400 confirmation_required`.
* `POST /api/v1/businesses/{slug}/owner-password` → `{"phone", "password"}` (a new password, shown once);
  `400 owner_missing`.

`BusinessCard`:
```json
{"slug": "burger-house", "name": "Burger House", "status": "active" | "suspended", "logo": null, "brand_color": "#ff6b00",
 "tagline": "", "created_at": "...",
 "links": {"shop": "https://burger-house.portex.uz/", "admin": "https://burger-house-admin.portex.uz/"},
 "stats": {"orders_today": 2, "revenue_today": 505000, "orders_total": 11, "customers": 7},
 "bots": {"client": Bot | null, "admin": Bot | null}}
```
`Bot`: `{"username", "alive": bool, "created_via": "managed" | "token"}` (`alive` — the bot service polls it now).
`BusinessDetail` = BusinessCard + `{"support_phone", "address", "lat", "lng", "working_hours": WorkingHours,
"delivery_time", "min_order", "owner": {"name", "phone"} | null, "platform_bot": {"username"} | null,
"missing_roles": ["client", "admin"]}` (`working_hours` is set by the business in its admin panel — read-only here)
(`lat`/`lng` are `null` for a business opened before it was put on the map).

### Map
`GET /api/v1/geo/reverse` and `GET /api/v1/geo/search` — the same as in the [Shop API](#map-addresses--points)
(without the preference for a business's surroundings).

### Mobile app
Our Android/iOS app (`mobile/`) opens the shop of one business, chosen here — to show a business its own shop on a
phone, the way its customers would use it.
* `GET /api/v1/mobile-app` → `{"business": BusinessCard | null, "updated_at", "config": AppConfig}` (`config` — exactly
  what the app receives now).
* `PUT /api/v1/mobile-app` `{"business": "<slug>" | null}` → the same. Errors: `validation` with `fields.business`:
  `does_not_exist` / `suspended`.
* `GET /api/v1/app/config` — **no sign-in**: asked by the app on every start and whenever it comes back to the screen →
  `AppConfig`:
  ```json
  {"shop": {"slug": "navroz", "name": "Navro'z Choyxona", "tagline": "", "logo": "https://deliveryhub.<domain>/media/public/logos/a.webp",
            "brand_color": "#1e5aa8", "url": "https://navroz.<domain>/"} | null,
   "min_version": "1.0.0", "store": {"android": "<Google Play URL>" | null, "ios": "<App Store URL>" | null}}
  ```
  `shop` is `null` when no business is chosen or it is suspended. An app older than `min_version` (settings
  `MOBILE_MIN_VERSION`, `MOBILE_ANDROID_URL`, `MOBILE_IOS_URL`) asks to be updated from its store — needed only for
  changes of the app itself: the shop inside it is always the one on the server.

### Applications
A business that wants its own shop leaves an application on our landing page (`landing/`, served on this host to
visitors without a session: `/`, `/ru`); our staff see it in the panel ("Arizalar") and call back.
* `POST /api/v1/leads` — **no sign-in** (the landing's form):
  ```json
  {"name": "Aziz", "phone": "+998 90 123 45 67", "business": "Navro'z Choyxona", "kind": "cafe", "comment": "", "lang": "uz"}
  ```
  → `201 {"ok": true}`. `business`, `kind` (`cafe` | `fastfood` | `shop` | `other`), `comment` and `lang` (`uz` | `ru`,
  the language of the page) may be left out. Errors: `validation` (`fields.name`: `required` / `blank` /
  `max_length`; `fields.phone`: `required` / `blank` / `invalid` — Uzbek numbers only;
  `fields.kind`, `fields.lang`: `invalid_choice`), `429 too_many_requests` (10 an hour from
  one address). The same phone again within a day, while its application is still `new`, updates that application
  instead of making a second one. A filled hidden field `website` (a bot) is answered `201` and dropped.
* `GET /api/v1/leads?status=new|contacted|won|lost` *(paginated, newest first; without `status` — all)* →
  `{"count", "page", "pages", "results": [Lead], "counts": {"new": 3, "contacted": 1, "won": 0, "lost": 0}}`
  (`counts` — of all applications, for the tabs and the badge of new ones).
* `PATCH /api/v1/leads/{id}` `{"status"?, "note"?}` → `Lead`. Leaving `new` sets `contacted_at` (once). Errors:
  `validation` (`fields.status`: `invalid_choice`; `fields.note`: `max_length` — 1000).

`Lead`:
```json
{"id": 7, "name": "Aziz", "phone": "+998901234567", "business": "Navro'z Choyxona", "kind": "cafe" | "fastfood" | "shop" | "other" | "",
 "comment": "", "lang": "uz" | "ru", "status": "new" | "contacted" | "won" | "lost", "note": "",
 "created_at": "...", "updated_at": "...", "contacted_at": "..." | null}
```

### Bots of a business
* `POST /api/v1/businesses/{slug}/bots/setup-link` → `{"url": "https://t.me/<platform bot>?start=setup_...", "qr_svg", "expires_at"}`
  — the owner opens it and creates both bots in two taps (Telegram Managed Bots). `400 platform_bot_missing`.
* `POST /api/v1/businesses/{slug}/bots` `{"role": "client" | "admin", "token": "<token from @BotFather>"}` → `{"bot": Bot}`;
  `400 invalid_token` / `bot_in_use`.
* `DELETE /api/v1/businesses/{slug}/bots/{role}` → `204` (the bot is released: its Mini App button, commands and descriptions are reset).

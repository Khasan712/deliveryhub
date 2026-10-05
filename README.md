# DeliveryHub — yetkazib berish bizneslari uchun platforma

Bitta platformada ko'p biznes ishlaydi. Har bir biznesga (fast food, restoran, do'kon) bizning paneldan **profil**
ochiladi va unga darhol quyidagilar beriladi:

```
DeliveryHub — platforma paneli (deliveryhub.<domen>)
└── Biznes (masalan, Burger House) — ma'lumotlari alohida PostgreSQL sxemasida
    ├── Mijozlar uchun: web do'kon + Telegram Mini App (<slug>.<domen>) va mijozlar boti
    └── Egasi va xodimlar uchun: admin panel + admin Mini App (<slug>-admin.<domen>) va xodimlar boti
```

## Tuzilma

Har bir qism — o'z papkasida, o'z bog'liqliklari, Dockerfile'i, testlari va README'si bilan. UI'lar bir-biri bilan
hech narsa bo'lishmaydi — faqat API orqali gaplashadi.

| Papka | Nima | Stek |
|---|---|---|
| [`backend/`](backend/) | Barcha funksiyalar va API (`/api/v1/...`), biznes qoidalari, baza, Gemini | Django 5.2 + DRF + django-tenants, PostgreSQL 16, Redis |
| [`bot/`](bot/) | Barcha Telegram botlar: mijozlar, xodimlar va platforma boti | aiogram 3 + SQLAlchemy 2 async (bazaga to'g'ridan-to'g'ri) |
| [`client-ui/`](client-ui/) | Mijozlar do'koni — sayt va Telegram Mini App | React + Vite + TypeScript |
| [`admin-ui/`](admin-ui/) | Biznes egalari va xodimlari uchun admin panel (+ admin Mini App) | React + Vite + TypeScript |
| [`deliveryhub-ui/`](deliveryhub-ui/) | Bizning platforma panelimiz (bizneslar, «Mobil ilova», «Arizalar») | React + Vite + TypeScript |
| [`landing/`](landing/) | Bizneslar uchun sahifamiz `sizlarbilan.uz` da: muammo → yechim, jonli demo, **ariza formasi** (o'zbekcha `/`, ruscha `/ru`) | HTML + CSS + JS, Node bilan yig'iladi |
| [`mobile/`](mobile/) | Android / iOS ilova: paneldagi «Mobil ilova» bo'limida tanlangan biznesning do'koni | Flutter (WebView) |
| [`docs/`](docs/) | [Arxitektura](docs/architecture.md), [API shartnomasi](docs/api.md), [OpenAPI](docs/openapi/) | |
| `docker-compose.yml`, `Caddyfile` | Qismlarni birga ishga tushirish: hostga qarab UI, `/api` → backend, `/media` → fayllar | Docker, Caddy |

```
brauzer / Telegram ──► web (Caddy) ──┬── client-ui / admin-ui / deliveryhub-ui / landing (host bo'yicha)
                                      ├── /api/*   ──► backend (gunicorn)
                                      └── /media/* ──► rasmlar (volume)
bot ──► PostgreSQL (to'g'ridan-to'g'ri)      backend ──► PostgreSQL, Redis
bot ──► Telegram Bot API (long polling), Gemini
backend ──► Nominatim (manzil ⇄ xarita nuqtasi)      brauzer ──► OpenFreeMap (xarita)
```

Host hamma narsani hal qiladi: `food.<domen>` → `food` biznesi, do'kon API; `food-admin.<domen>` → o'sha biznes,
admin API; `deliveryhub.<domen>` → platforma API. Noma'lum host — 404, to'xtatilgan biznes — 503.

## Ishga tushirish

```bash
cp .env.example .env          # qiymatlarni to'ldiring
docker compose up -d --build  # yoki: make up
```

Lokal manzillar (`*.localhost` macOS'da o'zi 127.0.0.1 ga boradi):

* platforma paneli — http://hub.localhost:8100 (login: `.env` dagi `PLATFORM_ADMIN_PHONE` / `PLATFORM_ADMIN_PASSWORD`);
  arizalar — «Arizalar» bo'limida
* bizneslar uchun sahifamiz (productionda `sizlarbilan.uz`) — http://localhost:8100, ruscha http://localhost:8100/ru
* biznes do'koni — `http://<slug>.localhost:8100`, admin paneli — `http://<slug>-admin.localhost:8100`

Backend har ishga tushganda barcha biznes sxemalariga migratsiyalarni qo'llaydi va platforma akkauntini yangilaydi.
Har bir qismni alohida ishlab chiqish — o'z README'sida (UI'lar `npm run dev` da `/api` ni `localhost:8100` ga
proksilaydi).

## Testlar

```bash
make test           # hammasi
make test-backend   # pytest + flake8 (vaqtinchalik PostgreSQL konteyneri bilan)
make test-bot       # pytest-asyncio
make test-ui        # har bir UI: vitest + lint + build
make test-mobile    # mobil ilova: flutter analyze + test
make test-landing   # bizneslar sahifasi: ikki tilda yig'ish + tarjima, havola va forma tekshiruvi
make e2e            # Playwright: o'zining vaqtinchalik stack'ida (8200), keyin o'chiriladi
make schema         # docs/openapi/*.yaml ni koddan yangilash
```

## Yangi biznes ochish

1. Platforma paneli → **Yangi biznes**: nom, manzil (subdomen), egasining ismi va telefoni, logo, rang. Yaratish
   biznes sxemasini, manzillarni va egasining admin akkauntini ochadi (parol bir marta ko'rsatiladi).
2. Biznes sahifasida **QR va havola** → egasi Telegram'da ikki tugma bosadi — **mijozlar boti** va **xodimlar boti**
   yaratiladi (Telegram Managed Bots). Tokenlar platformaga o'zi keladi, bot servisi ularni ~10 soniyada ishga
   tushiradi va sozlaydi (Mini App tugmasi, buyruqlar, tavsif). Busiz ham bo'ladi: "@BotFather tokeni bilan ulash".
3. Egasi admin panelda mahsulotlarini qo'shadi, xodimlarini **Telegram bot** sahifasidagi QR orqali ulaydi.

**Biznesni o'chirish:** biznes sahifasining pastidagi "Biznesni o'chirish" — faqat to'xtatilgan biznes, manzilini
(slug) qo'lda yozib tasdiqlangach. Sxemasi (buyurtmalar, mijozlar, mahsulotlar, xodimlar), domenlari, rasmlari
o'chadi; botlar platformadan uziladi: Mini App tugmasi, buyruqlari va tavsiflari tozalanadi, botlarning o'zi
Telegram'da egasida qoladi. Platforma boti orqali yaratilgan botlar Telegram tomonida uning boshqaruvida qoladi (Bot API
menejerga undan voz kechish imkonini bermaydi), lekin bot servisi ularni boshqa ishlatmaydi; egasi istasa, botni
@BotFather'da o'chiradi. Qaytarib bo'lmaydi — kerak bo'lsa avval `make backup`.

Platforma boti uchun: @BotFather'da bot yarating, unda **Bot Management** rejimini yoqing va tokenini `.env` dagi
`PLATFORM_BOT_TOKEN` ga yozing.

## Asosiy sozlamalar (`.env`)

| O'zgaruvchi | Tavsif |
|---|---|
| `SECRET_KEY` | Sessiyalar, mijoz tokenlari va bot tokenlarining shifri — o'zgarsa, botlarni qayta ulash kerak |
| `PLATFORM_DOMAIN`, `PLATFORM_HUB_SUBDOMAIN` | Bizneslar manzili (`<slug>.domen`) va bizning panel subdomeni |
| `PLATFORM_RESERVED_SUBDOMAINS` | Domen umumiy: boshqa loyihalarning subdomenlari (biznes ularni ololmaydi) |
| `PLATFORM_BOT_TOKEN` | Platforma boti (Managed Bots) — bizneslar botlarini yaratadi |
| `PLATFORM_ADMIN_PHONE`, `PLATFORM_ADMIN_PASSWORD` | Platforma paneliga kirish |
| `SMS_BACKEND` + `ESKIZ_*` / `TELEGRAM_GATEWAY_TOKEN` | Do'konga telefon orqali kirish kodlari (`console` — faqat log) |
| `GEMINI_API_KEY`, `GEMINI_*` | Ovozli buyurtma (admin "Sotuv" va xodimlar boti) |
| `WEB_PORT`, `WEB_BIND`, `DB_PORT` | Hostdagi portlar (8100 — faqat `127.0.0.1` da, 5440) |
| `COOKIE_SECURE` | Production'da `True` (faqat HTTPS) |

Biznes nomi, telefoni, logosi va botlari `.env` da emas — platforma panelida (bazada; bot tokenlari shifrlangan).
To'liq ro'yxat: [`.env.example`](.env.example).

## Domenlar va production

Har biznes: `<slug>.<PLATFORM_DOMAIN>` — do'kon, `<slug>-admin.<PLATFORM_DOMAIN>` — admin panel; bizning panel —
`<PLATFORM_HUB_SUBDOMAIN>.<PLATFORM_DOMAIN>`. Web konteyner oddiy HTTP beradi; TLS'ni serverdagi umumiy edge yopadi.
`PLATFORM_DOMAIN` o'zgarsa, backend (`ensure_platform`, har startda) bizneslarga yangi domenlarni qo'shadi, bot servisi
esa Mini App tugmalarini yangi manzilga sozlaydi.

Serverga chiqarish (`sizlarbilan.uz`, DNS, edge, ma'lumotlarni ko'chirish, zaxira): **[docs/deploy.md](docs/deploy.md)**.

```bash
make backup                         # baza + rasmlar → backups/<stamp>/
make restore FROM=backups/<stamp>   # shu stack'dagi hamma narsani almashtiradi
```

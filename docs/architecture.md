# DeliveryHub — architecture

DeliveryHub is a multi-business platform for delivery businesses (fast food, restaurants, shops). We open a
**business** from our panel; every business immediately gets a customer shop (website + Telegram Mini App), an
admin panel (web + Telegram Mini App) and two Telegram bots (customers' and staff).

```
deliveryhub/
├── backend/          Django 5.2 + DRF + django-tenants — the API (/api/v1/...), business rules, database, Gemini
├── bot/              Telegram service (aiogram 3 + SQLAlchemy 2 async): customers', staff and platform bots
├── client-ui/        React + Vite + TS — customer shop + Telegram Mini App          (<slug>.<domain>)
├── admin-ui/         React + Vite + TS — business admin panel + admin Mini App     (<slug>-admin.<domain>)
├── deliveryhub-ui/   React + Vite + TS — our platform panel                        (deliveryhub.<domain>)
├── docker-compose.yml, Caddyfile   — how the parts run together
└── docs/             architecture.md, api.md
```

## How the parts talk

```
browser / Telegram ──► web (Caddy) ──┬── client-ui / admin-ui / deliveryhub-ui containers (chosen by host)
                                      ├── /api/*   ──► backend (gunicorn)
                                      └── /media/* ──► media volume (product images, logos)

bot service ──► PostgreSQL (direct, async)      backend ──► PostgreSQL, Redis (cache, rate limits)
bot service ──► Telegram Bot API (long polling of every bot), Gemini (staff voice orders)
backend ──► Nominatim (addresses ⇄ map points; cached, one request a second)
browsers ──► OpenFreeMap (map tiles of the checkout and our panel)
```

* **One database, one schema per business** (django-tenants). The public schema holds the platform:
  businesses (`hub_business`), their domains (`hub_domain`) and bots (`hub_businessbot`, tokens encrypted with a key
  derived from `SECRET_KEY`). Every business schema has the same tables: staff users, catalog, customers, orders,
  Telegram data.
* **The backend owns the schema** (Django migrations). The bot service maps the tables it needs with SQLAlchemy
  and switches the schema per business (`schema_translate_map`); it never creates or migrates tables.
* **Host decides everything**: `food.example.uz` → business `food`, shop API; `food-admin.example.uz` → the same
  business, admin API; `deliveryhub.example.uz` → the platform API. Unknown host → 404; suspended business → 503.
* **Customer messages** (order placed, status changed) are written by the backend to the `adminbot_outbox` table
  of the business; the bot service sends them from the business's customers' bot and marks them sent.
* **Staff order cards** — the bot service watches orders of each business: new customer orders go to every staff
  chat with Accept / Reject buttons, status changes made in the admin panel update those cards.
* **Bots** are polled by the bot service (one process for all businesses); a bot connected or switched off in our
  panel is picked up within ~10 s. New bots are created by our platform bot (Telegram Managed Bots).
* **Each UI is a static build** served by its own small Caddy container (SPA fallback, long-lived asset cache); the
  `web` container in front only routes. Any part can be scaled or moved on its own.
* **Health**: `GET /healthz` on the backend (any host) — used by the container healthcheck; the bot service starts
  after the backend is healthy, i.e. after the migrations of every business are applied.

## Principles

* Each part is independent: own dependencies, Dockerfile, tests and README; the UIs share nothing but the API.
* The API is the contract (`docs/api.md`, OpenAPI at `/api/v1/schema/` on each host).
* Same-origin everywhere: every UI calls `/api/v1/...` on its own host, so cookies + CSRF work and no CORS is needed.
* Tests at every layer: backend (pytest + Django), bot (pytest-asyncio), UIs (Vitest + Testing Library + MSW).

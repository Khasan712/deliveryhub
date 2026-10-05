# DeliveryHub — bot service

One process that runs every Telegram bot of the platform:

* **customers' bot** of each business — welcomes customers with the shop (Mini App), confirms website sign-ins
  (`t.me/<bot>?start=login_<token>`), language switch, and sends the **customer messages** from the outbox
  (order placed, accepted / on the way / completed / rejected);
* **staff bot** of each business — invite links from the admin panel, orders dictated by voice or typed
  (Gemini, or a local parser without an API key) → draft card (a product the business froze is marked ❄️ with a
  warning — staff may still sell it) → order, new customer orders pushed to every
  staff chat with Accept / Reject / On the way / Delivered buttons, all card copies kept in sync, today's
  orders and stats, uz / ru;
* **our platform bot** — creates the two bots of a business with Telegram Managed Bots from a setup link of
  our panel, stores their tokens encrypted and links the creator to the staff bot.

It talks to PostgreSQL directly (SQLAlchemy 2 async + asyncpg) — the same database as the backend, which owns
the schema — and to the Telegram Bot API (aiogram 3, long polling) and Gemini (google-genai, async client).

## Structure

```
app/
├── __main__.py          python -m app: logging (tokens redacted), signals, the runtime
├── config.py            settings from the environment (the backend's variable names)
├── crypto.py            Fernet token encryption, key derived from SECRET_KEY exactly like the backend
├── utils.py             money / quantity / phone rules of the backend, local time
├── businesses.py        businesses and their bots (public schema), public URLs of a business
├── orders.py            an order with customer, author and items; order creation (backend rules)
├── outbox.py            customer messages: adminbot_outbox → customers' bot
├── db/
│   ├── models.py        the mapped tables (public schema + placeholder schema "tenant")
│   └── engine.py        Database: one small pool; public() and tenant(schema) sessions (schema_translate_map)
├── telegram/
│   ├── runtime.py       Runtime: reconcile pollers, dispatch (one chat at a time), staff pushes, outbox, heartbeat
│   ├── api.py           send / edit / answer / delete / download helpers, error kinds, BotFactory, flood control
│   ├── configure.py     commands, descriptions and the Mini App menu button of business bots
│   └── filters.py       aiogram filters: text commands, button labels, plain text, callback kinds
├── staff/               staff bot: handlers.py (routers), service.py (logic), cards.py (rendering), texts.py
├── customer/            customers' bot: handlers.py, texts.py (incl. order messages)
├── platform/            platform bot: handlers.py, texts.py
└── ai/                  understanding.py (Gemini: transcription + hedged JSON parsing), local_parser.py
tests/                   pytest + pytest-asyncio against a real PostgreSQL and a fake Bot API
```

## How it works

* **Runtime** (`app/telegram/runtime.py`). Every 10 s the wanted bots are read from `hub_businessbot`
  (active bots of active businesses) plus `PLATFORM_BOT_TOKEN`; pollers are started, stopped, or restarted when
  the token changed. A starting business bot is configured first (commands, descriptions, menu button:
  customers' bot → `https://<slug>.<PLATFORM_DOMAIN>/`, staff bot → `https://<slug>-admin.<PLATFORM_DOMAIN>/tg`),
  then its webhook is deleted and `getUpdates` long polls (50 s). Updates of one chat are handled one at a time
  and in order; different chats and bots in parallel (16 at once). Every update is checked against the database
  (bot and business still active) and handled in the business's schema. A poller survives any error: it backs off
  30 s on 401 / 404 / 409 (409: someone else polls the bot) and 3 s on other errors (incl. an HTML error page);
  a poller that stopped anyway is restarted by the next reconcile. Reconcile, the heartbeat and the background
  rounds run on schedules of their own. Every 3 s a round starts for every business bot — new orders → staff
  chats and statuses changed elsewhere → their cards (staff bot), outbox → customers (customers' bot) — at most
  4 side by side; a bot whose previous round still runs is skipped. On Telegram trouble (no answer, 5xx, an
  unreadable answer, flood control, a revoked token) a round stops at once and that bot's rounds pause for 10 s
  (flood control: as long as Telegram asks). Every 30 s `last_seen_at` is refreshed for the bots whose
  `getUpdates` succeeded in the last 70 s. SIGTERM stops polling at once and gives running handlers and rounds
  8 s (Docker kills after 10 s; rounds stop between two messages); then Telegram is told which updates were
  taken. An update cut short is lost, not repeated: Telegram forgets an update as soon as the next `getUpdates`
  call is made.
* **Staff pushes**: orders with status `ordered`, without a ticket, updated in the last 3 hours get a ticket
  (`adminbot_orderticket`, unique per order) and a card in every staff chat that gets notifications — except the
  order's author. A chat counts as told once its card is stored (`adminbot_ordercard`): a card that did not go
  out is sent in a later round while the ticket is younger than 15 minutes, nobody has accepted the order and it
  is still `ordered`. Each card goes out in a transaction of its own holding an advisory lock of the ticket and
  checking the chat has no card yet, so two running services never send a chat the same order twice. Status
  changes made in the admin panel are noticed through `status_seen` and every card copy is re-rendered; the
  ticket takes the new status only after the copies were edited, so a refresh cut short is repeated. Telegram
  403 → `blocked_at`.
* **Status buttons** in the staff bot lock the order, update it and its ticket and — for customers with a
  Telegram chat — write an `adminbot_outbox` row (`order_status` + `accepted` / `on_the_way` / `completed` /
  `rejected`); customer messages have one code path, the outbox.
* **Outbox** (`app/outbox.py`): a row is finished when `sent_at` is set (delivered) or `attempts` reaches 5
  (given up; `error` says why). Network trouble and Telegram 5xx count an attempt and are retried 10 s, 1 min,
  5 min and 30 min after the row was created; flood control counts none (the bot waits, see Runtime); a blocked
  bot / unknown chat (403 / 400 / 404), a customer without `tg_id` and rows older than 6 hours are given up at
  once (`attempts = 5`). Messages about one order go out in order. Each row is sent inside a transaction holding
  its row lock (`FOR UPDATE SKIP LOCKED`), so two running services never send the same message; nothing sleeps
  while holding it. The polling queries write `status = 'ordered'` and `attempts < 5` into the SQL (not as bound
  parameters) so that the partial indexes `app_order_ordered_idx` and `adminbot_outbox_due` serve every
  execution of their prepared statements.
* **Voice** (`app/ai/understanding.py`): the voice message (≤ 2 min, ≤ 10 MB) is transcribed by
  `GEMINI_TRANSCRIBE_MODEL` (product names as custom vocabulary), then `GEMINI_PARSE_MODEL` returns the whole
  updated form against a JSON schema; if it has not answered in `GEMINI_PARSE_HEDGE_SECONDS`, the next model of
  `GEMINI_PARSE_FALLBACK_MODELS` is asked in parallel and the first good answer wins. Without `GEMINI_API_KEY`
  typed orders go to the local rule-based parser (in a worker thread, the first 500 characters) and voice
  messages are refused politely.

## Configuration

The same variables as the backend (one `.env` for both; locally `../.env` is read, set variables win).

| Variable | Default | |
|---|---|---|
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT` | `deliveryhub`, `deliveryhub`, —, `db`, `5432` | the backend's database |
| `SECRET_KEY` | — (required) | the backend's key: bot tokens are encrypted with a key derived from it |
| `PLATFORM_BOT_TOKEN` | — | our platform bot; without it only business bots run |
| `PLATFORM_DOMAIN` | `portex.uz` | shop `https://<slug>.<domain>/`, admin `https://<slug>-admin.<domain>/` |
| `TELEGRAM_API_URL` | `https://api.telegram.org` | another Bot API server (local server without `--local`, a fake) |
| `GEMINI_API_KEY` | — | voice orders and AI parsing of typed orders |
| `GEMINI_PARSE_MODEL` | `gemini-3.5-flash-lite` | |
| `GEMINI_PARSE_FALLBACK_MODELS` | `gemini-3.1-flash-lite,gemini-3.5-flash` | comma separated |
| `GEMINI_PARSE_HEDGE_SECONDS` | `4` | |
| `GEMINI_TRANSCRIBE_MODEL` | `gemini-3.5-transcribe` | |
| `TIME_ZONE` | `Asia/Tashkent` | the businesses' local time ("today", times on cards) |
| `LOG_LEVEL` | `INFO` | |

## Run

```bash
make install                                # .venv with requirements-dev.txt (Python 3.12)
make run                                    # python -m app, reads ../.env (POSTGRES_HOST=localhost, ...)

docker build -t deliveryhub-bot . && docker run --env-file ../.env -e POSTGRES_HOST=... deliveryhub-bot
```

With everything else: the repository's `docker-compose.yml` runs it as the `bot` service, started once the
backend is healthy (the backend applies the migrations of every schema; this service never does).

## Tests

A throwaway PostgreSQL; the fixtures create the database `deliveryhub_bot_test`, the mapped tables in the
public schema and in two business schemas (`test_shop`, `other_shop`), and truncate them before every test.
Telegram is a fake aiogram session (plus one test against a local HTTP fake through the real aiohttp session);
Gemini is a fake client.

```bash
make test                                   # starts the container below if needed, then pytest
make stop-test-db

# by hand:
docker run --rm -d --name dh-bot-test-db -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:16
.venv/bin/pytest -q
```

`TEST_DATABASE_URL` (default `postgresql+asyncpg://postgres:test@127.0.0.1:55432/deliveryhub_bot_test`) points
elsewhere; the database name must end with `_test`.

## Database contract

Tables come from the backend's migrations (Django labels `hub`, `app`, `adminbot`); this service never creates
or alters them. The mapping (`app/db/models.py`) follows the migrations; read-only tables map only the columns
used. Django keeps no database defaults except `db_default` columns (`app_order.source`,
`app_telegramlogintoken.status`, `adminbot_outbox`), so every insert here fills every NOT NULL column itself.

| Table | Schema | The service |
|---|---|---|
| `hub_business` | public | reads (`schema_name`, `name`, `slug`, `status`, `support_phone`) |
| `hub_businessbot` | public | reads; inserts / updates bots from the platform bot; `last_seen_at` |
| `hub_botsetup` | public | reads; sets `telegram_user_id` |
| `app_user`, `app_product`, `app_descriptions` | business | reads |
| `app_client` | business | inserts customers of the customers' bot; `lang` |
| `app_order`, `app_orderitem` | business | inserts orders from staff drafts; status changes |
| `app_telegramlogintoken` | business | confirms website sign-ins |
| `adminbot_stafflink`, `adminbot_staffinvite`, `adminbot_draft`, `adminbot_orderticket`, `adminbot_ordercard` | business | the staff bot's bookkeeping |
| `adminbot_outbox` | business | sends rows (`sent_at`, `attempts`, `error`); inserts status rows from staff buttons |

# admin-ui — DeliveryHub business admin panel

The admin panel of one business on DeliveryHub, served at `<slug>-admin.<domain>`. The same app opens inside
Telegram as a Mini App from the business's staff bot (`/tg` signs in with Telegram `initData` and opens Sales).

It talks only to the **Admin API** on its own host (`/api/v1/...`, session cookie + CSRF) — see
[`docs/api.md`](../docs/api.md) and [`docs/architecture.md`](../docs/architecture.md).

**Pages:** dashboard (KPIs, orders by status, last 7 days, latest orders) · sales point of sale with the AI voice
assistant (Gemini Live captions, browser speech fallback, typed commands, undo, Space / Esc / `/` / Ctrl+Enter; frozen
products can be sold, with a warning and one-tap "return to sale"; every tile has "+ Qo'shish" or − count + right
under its price) · orders (status / source filters, search, pagination) and order detail (items, customer, address
with map links, status change) · clients (list, detail, edit) ·
products (search, category and on sale / frozen filters, one-tap freeze with undo, create / edit with image upload,
delete) · categories · units · working hours (open now / closed status, weekly schedule — admins edit, managers see
it) · staff users (admins only) · Telegram bot (status, linked accounts, notifications, invite link + QR, team) ·
branches (admins, while our panel lets the business have them). Uzbek / Russian, light / dark theme.

**Branches** ([docs/api.md → Branches](../docs/api.md)) appear only when our panel turns them on for the business;
off, the panel is exactly as without them. The admin opens branches on `/branches` (all of them on a map with today's
orders and money and their staff — «Xodim qo'shish» opens a new «Filial admini» of that branch; a form with a map
picker — search, a click, a dragged pin, pasted coordinates or a Yandex / Google link — that fills in the address;
stopping; deleting, or stopping instead when a branch has orders or staff). With two or more active branches
(*dispatch*) a delivery order waits for the head office: the orders page has a «Filial tanlanmagan» shortcut and a
branch filter, every order shows its branch or the nearest one with «Chilonzorga yuborish» in one tap (on a phone's
card instead of its next step), and an order's page opens with the branch across the page — a big map of the customer
and the branches beside the branches nearest first and «Yuborish»; once sent, a strip («Filial: Chilonzor · Malika
yubordi, 15:43») that opens them again to move it (a phone: a card after the progress). The dashboard shows today per
branch and how many orders wait; every sale of the head office names its branch (chips, required in dispatch mode).
Branch staff have a panel of their branch's own: its home page, sales, orders and the bot — nothing of the menu, the
customers, the hours or the staff. The maps (MapLibre + OpenFreeMap tiles) are a lazy chunk of their own
(`src/components/map`); tests replace them with a list (`src/test/fakeMap.tsx`).

**On a phone or a tablet** (below 1024 px) the side menu and the header give way to a bottom menu: the home page,
the orders (with the number of new ones), a big «+» for a sale, the products, and «Yana» (`/more`: the other pages,
language, theme, signing out). A sale goes in three screens, none of which needs scrolling to its button: the products
(by category, a tap adds one, − count +, a bar with the total and «Davom etish»), the details (pickup / delivery,
phone, name, address, payment, status, comment; «Buyurtma yaratish» fixed at the bottom), and «Buyurtma yaratildi»
with the order's number and contents. The voice assistant opens in a sheet. Order cards name what was ordered and
where to, with a call button and the next step in one tap («Yo'lga chiqarish», «Yetkazildi», «Bajarildi»); an
order's page shows its progress and keeps that step and «Bekor qilish» at the bottom. The home page shows whether the
business is open, today's money, the counts by status and the new orders. Lists and the point of sale show the small photo
(`thumb`); after a deploy an open panel loads the new build at a calm moment (`src/lib/updates.ts`: a lazy chunk gone
from the server, `/version.json` checked on return from the background and on page changes).

## Stack

React 19 · Vite 8 · TypeScript 6 (strict) · React Router 7 · TanStack Query 5 · Tailwind CSS 4 · Recharts ·
Vitest + Testing Library + MSW 2 · oxlint.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on port 5174, open <http://food-admin.localhost:5174>. `/api` and `/media` are proxied to `http://localhost:8100` keeping the Host header (the backend picks the business from it). |
| `npm run dev:mock` | The same, but the whole Admin API is mocked in the browser (MSW) — no backend needed. Sign in with `+998 90 123 45 67` / `admin12345` (admin), `+998 93 555 77 88` / `manager12345` (manager) or `+998 90 111 22 44` / `branch12345` (the admin of the Chilonzor branch); `?mock-as=admin\|manager\|branch` signs in directly. The mock business has branches; `?mock-branches=off` opens it without them, `?mock-branches=empty` with none opened yet. |
| `npm run build` | Type-check (`tsc -b`) and build static files into `dist/` (serve with an SPA fallback to `index.html`). |
| `npm test` | Unit + integration tests (Vitest, jsdom, MSW handlers following `docs/api.md`). |
| `npm run lint` / `npm run typecheck` | oxlint / `tsc -b`. |
| `npm run preview` | Serve the production build locally (same port and proxy). |

`docker build .` produces a small Caddy image serving `dist/` (SPA fallback, immutable `/assets/*`, no-cache
`index.html`); `docker-compose.yml` at the repository root runs it behind the `web` container.

## Structure

```
src/
  main.tsx, index.css        entry point; Tailwind theme tokens (light / dark surfaces, brand, AI accents)
  app/                       App (providers), routes, lazy pages, query client
  api/                       fetch client (CSRF, errors, 401 / 503 events), endpoints, React Query hooks, types
  auth/                      session (/auth/me), login, Telegram Mini App sign-in (/tg), guards, system screens
  layout/                    sidebar (collapsible) and header for wide screens; the phone's bottom menu and «Yana» page
  components/ui/             design system: buttons, inputs, select, modal, data table, pagination, badges, …
  components/feedback/       toasts and confirm dialogs
  features/<page>/           one folder per section; features/sales/voice/ is the voice engine
  i18n/                      uz / ru dictionary (+ plural rules), provider
  lib/                       formatting (money, dates, phones), URL list params, storage, media queries
  mocks/                     in-memory mock API (MSW handlers) used by the tests and `dev:mock`
  test/                      test setup, render helper and the test suites
```

## Voice order entry (features/sales/voice)

- **Gemini Live** (`voice.live`): an AudioWorklet downsamples the microphone to 16 kHz mono PCM16 in 100 ms chunks and
  streams them over a WebSocket opened with the single-use token from `POST /voice/token` (`setup` is sent first,
  audio captured before `setupComplete` is buffered). Captions are feedback only.
- **The full recording is authoritative**: on stop the recorder keeps 350 ms of tail, the PCM buffer is flushed,
  the clip is sent to `POST /voice/parse` (with the live text as a fallback and the UI language as `lang`).
- **Without Gemini** the browser's Web Speech API gives the text (Chrome), parsed with `POST /voice/parse` as text.
- The result fills the whole form (AI badges, highlighted fields); **Undo** restores the form as it was.

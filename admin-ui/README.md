# admin-ui — DeliveryHub business admin panel

The admin panel of one business on DeliveryHub, served at `<slug>-admin.<domain>`. The same app opens inside
Telegram as a Mini App from the business's staff bot (`/tg` signs in with Telegram `initData` and opens Sales).

It talks only to the **Admin API** on its own host (`/api/v1/...`, session cookie + CSRF) — see
[`docs/api.md`](../docs/api.md) and [`docs/architecture.md`](../docs/architecture.md).

**Pages:** dashboard (KPIs, orders by status, last 7 days, latest orders) · sales point of sale with the AI voice
assistant (Gemini Live captions, browser speech fallback, typed commands, undo, Space / Esc / `/` / Ctrl+Enter; frozen
products can be sold, with a warning and one-tap "return to sale") · orders (status / source filters, search,
pagination) and order detail (items, customer, address with map links, status change) · clients (list, detail, edit) ·
products (search, category and on sale / frozen filters, one-tap freeze with undo, create / edit with image upload,
delete) · categories · units · working hours (open now / closed status, weekly schedule — admins edit, managers see
it) · staff users (admins only) · Telegram bot (status, linked accounts, notifications, invite link + QR, team).
Uzbek / Russian, light / dark theme, responsive down to phones.

## Stack

React 19 · Vite 8 · TypeScript 6 (strict) · React Router 7 · TanStack Query 5 · Tailwind CSS 4 · Recharts ·
Vitest + Testing Library + MSW 2 · oxlint.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on port 5174, open <http://food-admin.localhost:5174>. `/api` and `/media` are proxied to `http://localhost:8100` keeping the Host header (the backend picks the business from it). |
| `npm run dev:mock` | The same, but the whole Admin API is mocked in the browser (MSW) — no backend needed. Sign in with `+998 90 123 45 67` / `admin12345` (admin) or `+998 93 555 77 88` / `manager12345` (manager). |
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
  layout/                    sidebar (collapsible, mobile drawer), header (business, language, theme, user menu)
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

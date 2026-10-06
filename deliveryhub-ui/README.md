# deliveryhub-ui

Our platform panel (`deliveryhub.<domain>`): sign in, see all businesses, open a new one (shop, admin panel, owner
account, its place on the map) and manage it — status, profile, location, owner password and both Telegram bots
(two-tap setup link with QR, or a @BotFather token), and its working hours — read-only here, the business sets
them in its admin panel. Uzbek UI. The place of a business is picked on a map (MapLibre
GL + OpenFreeMap tiles, loaded only on those pages): a click or a dragged pin, a search (an address through
`GET /geo/search`, or coordinates / a Yandex or Google Maps link pasted in); the address fills in from the point
(`GET /geo/reverse`) and can be edited — customers see it for pickup. **Mobil ilova** (`/mobile`): which business
our Android/iOS app (`../mobile`) opens — pick one of the active businesses (saved at once, `PUT /mobile-app`), with a
live phone preview of its shop and what the app receives. **Arizalar** (`/leads`): applications businesses leave on
our landing page (`../landing`), in tabs by status with their counts (`GET /leads`, the new ones first) — the phone to
call (a `tel:` link, copy), the language to speak and their message; staff mark how the call went and keep a note
(`PATCH /leads/{id}`). The menu shows the number of new ones, re-read every minute and when the window gets the focus
back. Its **Sayt** card picks the sample shop the landing page links to (one of the active businesses or none; saved
at once, `PUT /landing`). After a deploy, a page that misses a lazy chunk of the old build reloads once. Talks only to the **Platform API** on its own host (`/api/v1/...`, see
[`../docs/api.md`](../docs/api.md)): session cookie + `X-CSRFToken`.

React 19 · Vite 8 · TypeScript 6 (strict) · React Router 7 · TanStack Query 5 · Tailwind CSS 4 ·
Vitest + Testing Library + MSW 2 · oxlint.

## Run

Node 20.19+ or 22.12+ (Vite 8).

```sh
npm install
npm run dev          # http://hub.localhost:5175
```

The dev server proxies `/api` and `/media` to the backend at `http://localhost:8100`, keeping the `Host` header
(`changeOrigin: false`) — the backend picks the platform API by host, so open the panel at **hub.localhost:5175**.
Another backend: `API_TARGET=http://localhost:8200 npm run dev`.

| Command | |
|---|---|
| `npm run build` | type-check + production build to `dist/` |
| `npm test` | Vitest (jsdom, MSW mock of the Platform API) |
| `npm run lint` | oxlint (react, typescript, jsx-a11y, vitest plugins) |
| `npm run typecheck` | `tsc -b` |
| `npm run preview` | serve `dist/` on :5175 with the same proxy |

**Deploy:** serve `dist/` as static files with an SPA fallback to `index.html`; `/api` and `/media` go to the
backend on the same host. Assets in `dist/assets/` are content-hashed (cache them forever).

The address preview of the "Yangi biznes" form uses the domain `GET /api/v1/businesses` reports (`domain`).
Fallbacks: `VITE_PLATFORM_DOMAIN` at build time, the links of existing businesses, the panel's own host
(`deliveryhub.portex.uz` → `portex.uz`).

## Pages

| Path | |
|---|---|
| `/login?next=…` | phone + password; any `401` leads here and back to `next` afterwards |
| `/` | totals, search/filter, business cards (status, address, numbers, bots with alive dot) |
| `/new` | new business: address from the name (Uzbek Cyrillic → Latin), live availability, brand color, logo, owner |
| `/b/<slug>` | header actions, numbers, bots (setup link + QR, token, disconnect), addresses, profile, owner password, delete (a suspended business; its slug typed to confirm) |
| `/leads?status=…&page=…` | applications from the landing page: status tabs with counts (new ones by default), phone, language, message, status buttons («Bog'lanildi» at hand for a new one), our note; 20 a page; the «Sayt» card above them picks the landing's sample shop |

The owner's credentials after creating a business travel in the history state and are shown once (gone after a
reload). Pages `/new`, `/b/<slug>`, `/leads` and `/mobile` are separate chunks, preloaded when the browser is idle.

## Code

```
src/
  api/          client.ts (fetch, CSRF, ApiError), endpoints.ts, queries.ts (TanStack Query hooks), types.ts
  lib/          slug transliteration, formatting, error messages (Uzbek), phone, color, paths…
  components/   layout, auth guard, avatar, bot status, credentials panel; ui/ — buttons, fields, dialog, toasts…
  pages/        LoginPage, BusinessesPage, BusinessCreatePage, business/ (the business page and its sections),
                LeadsPage, MobileAppPage
  test/         MSW backend (follows docs/api.md), fixtures, render helper, page tests
```

## Container

`Dockerfile` builds the app and serves `dist/` with Caddy (`Caddyfile`: SPA fallback to `index.html`, a year of cache
for the hashed `/assets/*`, `no-cache` for the pages, `X-Frame-Options: DENY`). In the platform it runs as the
`deliveryhub-ui` service of `../docker-compose.yml`, behind the `web` container that routes the platform host to it.

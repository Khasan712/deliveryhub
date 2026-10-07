# client-ui — DeliveryHub customer shop

The shop of one business at `<slug>.<domain>`: the same page is the **website** and the **Telegram Mini App**.
It talks only to the [Shop API](../docs/api.md#shop-api) on its own host (`/api/v1/...`) — the host selects the
business. React 19 · Vite 8 · TypeScript 6 (strict) · React Router 7 · TanStack Query 5 · Tailwind CSS 4.

**Features**

- Menu: one header row — logo and name, the search (from 1024px; above the brand hero on phones), the links,
  language, theme and profile — brand hero (tagline, chips, popular photos), search by Uzbek/Russian names
  (apostrophe-tolerant; typing on another screen goes back to the menu), categories with scroll-spy — a
  list on the left from 1360px, sticky chips below that — popular dishes ("Siz yoqtirganlar": one row that
  scrolls sideways, swiped on phones, with arrows where there is a mouse), menu lines (name, description, price,
  photo) whose round "+" next to the price turns
  into a stepper in place (the same on phones and in the Mini App), product details sheet.
  The cart beside the menu starts level with the hero; from 1360px the header lines up with the columns below
  (the search exactly as wide as the hero); every page keeps the same width. `brand_color` becomes the accent (`--brand*` CSS variables,
  readable text colour is computed; a navy or near-black brand turns into light buttons on the dark theme) and is
  cached so the next visit paints in the right colour. The tab and home-screen icon is the business's own, drawn
  by the server for the host (`GET /api/v1/icon`, `/icon/touch`: its logo, or the bag on its brand colour) and
  named in `index.html`, so it is right from the first load (Safari ignores an icon swapped in later).
- Speed and deploys: cards, the cart and lists load the small photo (`thumb`, 512 px WebP), the product sheet the
  full one; the menu request starts before the Telegram SDK has loaded and the last menu shows at once; API answers
  revalidate with ETags. After a deploy the shop picks up the new build at a calm moment — a lazy chunk gone from the
  server reloads once, `/version.json` (written by the build) is checked when the shop comes back from the background
  and on page changes (`src/lib/updates.ts`); an error boundary shows "Qayta yuklash" instead of a blank page, and one
  around the map. Requests give up after 20 s (30 s for placing an order) with a network error; one checkout sends the
  same `Idempotency-Key` on every try, so a lost answer never makes a second order. Inside our mobile app (`../mobile`)
  the shop is the same page — the user agent ends with `DeliveryHubApp/<version>`.
- Cart: persisted per shop host, synced between tabs, minimum-order progress, "clear" with undo; always-open side
  panel on desktop (lines with unit price, delivery time, total), bottom sheet + floating bar on phones.
- On a phone (below 768px — the website, our app and the Telegram Mini App alike) the main menu is a bar at the
  bottom: Menyu · Savat (the count; opens the cart) · Buyurtmalarim (a dot while an order is on its way) · Profil —
  the header keeps the shop's name only.
  Above it the menu's floating bar is the next step: «Rasmiylashtirish» straight to the checkout (sign-in first for
  a guest), or, dark, what stands in the way — «Yana 22 000 so‘m qo‘shing» with a progress line below the minimum,
  the opening time while closed — which opens the cart. An order on its way waits on top of the menu (phones and
  tablets), the banner is one short block (the tagline and a row of facts that scrolls sideways), the checkout sums
  the order up in one line on top and keeps the comment folded, and a finished order is ordered again right from
  the list («Yana buyurtma berish»). The checkout has its own bar at the bottom, so the menu bar steps aside there.
  Inside Telegram the MainButton stays off the screens with the menu bar (no two bars at the bottom): it does the
  cart sheet, the product sheet, the map and the checkout; a wide Telegram window keeps the cart in it.
- Working hours (`business.working_hours`, the business sets them in its admin panel): the banner shows "Ochiq ·
  22:00 gacha" / "Yopiq · ertaga 09:00 da ochiladi", worked out live on the business's clock (`lib/hours.ts`, the
  backend's rules: night shifts past midnight, days off), and opens the week in a sheet. While closed the menu and
  the cart stay usable, but checkout is blocked with the opening time (the backend refuses with `business_closed`).
- Frozen products (`product.frozen`): on the menu with a grey photo and "Mavjud emas"; "+" tells it is not
  available instead of adding. One already in the cart is greyed out, left out of the total and holds the order
  until it is taken out ("Olib tashlash"); `product_unavailable` from the backend refreshes the menu.
- Checkout: delivery/pickup. Delivery: the point on a **map** (a full-screen sheet; the pin stays in the middle
  while the map moves under it, like in taxi apps — OpenFreeMap tiles, MapLibre GL loaded only then; search by
  street/landmark and the address under the pin through `GET /geo/*`; "my location": Telegram `LocationManager`
  inside Telegram, browser geolocation elsewhere; in Telegram the MainButton picks the place) and the address text
  (an empty one takes the map's address, a typed one stays and the map's is offered with one tap). Pickup: the
  business's address with a map link. Name, phone (`+998` mask, "share my Telegram number" in the Mini App),
  cash/card, comment.
  Client-side validation, server `validation` errors mapped to fields, `min_order`, `product_not_found` (removed
  from the cart), `401` (sign-in again). Contact details are remembered for the next order.
- Sign-in: automatic in Telegram (`initData`); on the website phone + SMS code (resend timer, attempts left,
  `debug_code` shown in development) or "Telegram orqali kirish" (deep link + polling every 2 s). A new account is
  asked for its name. Token in localStorage per host; any `401` signs out.
- Orders: active orders and history, order page with a live tracker (delivery: accepted → on the way → delivered;
  pickup: accepted → handed over; rejected banner with a call button), polling while active, reorder.
- Profile: name, language (uz/ru, saved on the account), theme (auto/light/dark on the website), support phone.
- Telegram Mini App: `ready`/`expand`, Telegram theme → CSS variables, MainButton for the primary action (cart,
  checkout, add to cart, reorder), BackButton for sheets and screens, haptics, safe areas, header/background colours.
  On the website the browser back button closes sheets and leaves screens (sheets are history entries).
- Skeletons, empty and error states (offline, suspended business, unknown shop, 404), toasts, smooth sheet/page
  transitions with drag-to-dismiss, `prefers-reduced-motion`, keyboard and screen-reader support.

## Scripts

| Command | |
|---|---|
| `npm run dev` | dev server on <http://food.localhost:5173>, `/api` and `/media` proxied to `http://localhost:8100` (`BACKEND_URL` to change) with the original `Host` header |
| `npm run dev:mock` | the same UI without a backend: the Shop API is served by the test MSW handlers with a demo menu (`MOCK_MEDIA_DIR=/path/to/images` serves `/media/demo/*`) |
| `npm run build` | type-check (`tsc -b`) and build to `dist/` |
| `npm run preview` | serve `dist/` on :4173 (same proxy) |
| `npm test` | Vitest + Testing Library + MSW (`npm run test:watch` while developing) |
| `npm run lint` / `npm run typecheck` | oxlint / `tsc -b` |

Open the shop through a business host: `http://<slug>.localhost:5173` (e.g. `food.localhost`). Any
`*.localhost` host works with the dev server. The Telegram Mini App needs HTTPS — point a tunnel at the dev server
and set that URL as the bot's Mini App / menu button.

## Deployment

`dist/` is static: `index.html` for every unknown path (SPA routes `/checkout`, `/orders/131`, …), `/assets/*`
cached forever (file names are hashed), a missing asset is a 404. `Dockerfile` builds the app and serves it with
Caddy on :80 (`Caddyfile`). In the platform it runs as the `client-ui` service of `../docker-compose.yml`, behind the
`web` container, which sends every business host that is not an admin or platform host here. No `X-Frame-Options`:
Telegram Web opens the Mini App in an iframe.

## Structure

```
index.html            pre-paint theme/lang/brand; loads telegram-web-app.js only inside Telegram
src/
  main.tsx            waits for the Telegram SDK (if any), initialises it, renders <App>
  app/                App (router), Providers (query → toasts → i18n → theme → auth → catalog → cart), AppShell (routes, sheets)
  api/                fetch wrapper (ApiError, 401 listeners), Shop API endpoints, types from docs/api.md
  i18n/               messages.ts (every string, uz + ru), provider and helpers (t, money, dates, names)
  state/              auth, catalog (GET /shop + offline copy), cart, theme, toasts, orders, navigation (sheets in history)
  lib/                telegram (SDK, MainButton registry, haptics), geo, color (brand palette), format, storage, motion
  components/         Sheet, Button, Stepper, Segmented, PhoneInput, Field, OrderStatus/Tracker, Header, CartBar, …
  screens/            menu, checkout, orders (list + order), profile, sheets (product, cart, auth), status screens
  test/               MSW handlers (the Shop API in memory), fixtures, demo menu, Telegram mock, render helpers
```

Tests live next to the code (`*.test.ts(x)`): catalog, cart math, checkout (validation, server errors, success),
phone and Telegram sign-in, order tracker and orders, languages, the Telegram Mini App flow, helpers.

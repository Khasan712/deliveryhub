# landing — DeliveryHub's page for businesses

The page we send to a business that might want its own shop: the problem (orders lost in chats), the solution step by
step, a live demo of one order (the customer's shop ↔ the staff bot), what the platform does, how a shop is opened,
questions — and the **application form**: a business leaves its name and phone, our staff see it in the panel
("Arizalar") and call back. Uzbek and Russian.

It lives on the platform host (`deliveryhub.<domain>`, `../Caddyfile`):

| Address | |
|---|---|
| `/` | Uzbek — for a visitor without a session; our staff, signed in, get the panel there |
| `/uz`, `/ru` | Uzbek / Russian, for anyone |
| `/landing/*` | fonts, photos, the icon (content-hashed names, cached for a year) |

The form sends `POST /api/v1/leads` to the same host (docs/api.md, "Applications") — no account, rate limited, with a
hidden field as a trap for bots.

Light by default; the ☀️/🌙 switch in the menu turns it dark, and the choice is kept (`localStorage`, applied
before the first paint). Plain HTML, CSS and JavaScript — no framework; Node only builds it. Fonts are served from
here (Manrope and JetBrains Mono, Latin + Cyrillic), the photos are the demo shop's (Navro'z Choyxona).

## Build and test

```bash
npm ci
npm test                 # builds dist/ (both languages) and checks translations, links, the form and the files
npm run build            # dist/index.html, dist/ru/index.html, dist/landing/*
npm run build:artifact   # dist/artifact.html — one self-contained file for a claude.ai preview (both languages, the
                         # form only shows what would happen: there is no server behind an artifact)
```

Open `dist/index.html` through any static server (the form needs the backend: run the whole stack, `make up`, and open
`http://hub.localhost:8100/` in a private window). `SITE_URL` (default `https://deliveryhub.sizlarbilan.uz`) sets the
canonical and social links.

## Code

```
src/body.html   the page; Uzbek in place, data-t="key" (inner HTML) / data-t-attr="attr:key" mark what is translated
src/i18n.mjs    Russian for those keys, the words of the script in both languages, titles and descriptions
src/page.css    the styles (DeliveryHub's paper, ink and indigo; light and dark)
src/page.js     the problem chat, the calculator, the order demo, the form, the language switch of the preview
build.mjs       template → one page per language (node-html-parser puts the Russian in), fonts and photos hashed
public/img/     the dish photos of the demo (WebP, 160 px)
test/           node:test against the build
```

A new text: write it in Uzbek in `body.html` with a new `data-t` key and add its Russian to `src/i18n.mjs` — the
build fails on a key without Russian, and the tests on Russian without a key.

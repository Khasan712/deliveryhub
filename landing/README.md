# landing — DeliveryHub's page for businesses

The page we send to a business that might want its own shop: the problem (orders lost in chats), the solution step by
step, a live demo of one order (the customer's shop ↔ the staff bot), what the platform does, how a shop is opened,
questions — and the **application form**: a business leaves its name and phone, our staff see it in the panel
("Arizalar") and call back. Uzbek and Russian.

It lives at the bare domain — `sizlarbilan.uz` (`PLATFORM_DOMAIN`; `localhost` on a developer's machine; the edge
sends `www.` there), routed by `../Caddyfile`:

| Address | |
|---|---|
| `/`, `/uz` | Uzbek |
| `/ru` | Russian |
| `/landing/*` | fonts, photos, the icon (content-hashed names, cached for a year) |

The form sends `POST /api/v1/leads` to its own host; the web container passes that path to the backend as our panel's
host (docs/api.md, "Applications") — no account, rate limited, with a hidden field as a trap for bots. Nothing of our
panel is linked from the page. Under the first screen and after a sent application the page links to a live **sample
shop**: the business our staff pick in the panel ("Arizalar" → "Sayt"), asked for with `GET /api/v1/landing/config`
on every visit (passed on the same way; docs/api.md, "Our page for businesses"); while none is picked (or it is
suspended), the link stays hidden.

Carrot orange is DeliveryHub's colour here (food, appetite, speed; in Uzbekistan purple is Uzum's and yellow
Yandex Eats'), green and blue mark the customer's and the staff's presses in the demo, red only what is lost. Light by
default; the ☀️/🌙 switch in the menu turns it dark, and the choice is kept (`localStorage`, applied before the first
paint). Plain HTML, CSS and JavaScript — no framework; Node only builds it. Fonts are served from
here (Manrope and JetBrains Mono, Latin + Cyrillic), the photos are the demo shop's (Navro'z Choyxona).

**Scroll-driven stages.** The problem chat (5 steps) and the order demo (8 states) stay in place while the page
scrolls through them (`position: sticky` in a tall `.scrolly` wrapper — the page's own scroll, nothing is hijacked):
each stretch of scroll is one step, scrolling back goes back, and after the last step the page scrolls on. The
script turns a stage on only when it fits the screen. A phone always keeps a phone's shape (1:2) and only gets
smaller as a whole, not below 66 % (its text would no longer read); where the menu would make it much smaller (a
phone, a low laptop screen), the menu steps aside while the stage is pinned. On a phone the time counter sits on the
chat phone's lower edge and the demo's screen name ("Mijoz telefoni" / "Xodimlar boti") on its upper edge instead of
the tabs; on a short laptop screen the step list keeps only the text of the step it is on. Not pinned — and working
as before (the chat plays when seen, the demo by clicking or "▶ O‘zi ko‘rsatsin") — with "reduce motion", on a screen
too short (a phone on its side, an iPhone SE's Safari) or without the script.

**Who presses what.** When the demo plays (by the scroll or by "▶ O‘zi ko‘rsatsin"), a touch comes to each button,
presses it with a ripple and says whose finger it is — **Mijoz** (green) or **Xodim** (blue); the title of that
phone lights up in the same colour, and the caption under the steps says it in words: "[Mijoz] bosdi: [Buyurtma
berish]" as the touch sets off, then what the press did. On a phone the screen switches to the side that presses.

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

// Builds the page from one template (src/body.html — Uzbek in place, data-t keys for Russian):
//   node build.mjs             → dist/index.html (uz, "/"), dist/ru/index.html (ru, "/ru"), dist/landing/* (fonts, photos)
//   node build.mjs --artifact  → dist/artifact.html: one file for a claude.ai preview — photos inline, both languages
//                                switched in place, and a form that only shows what would happen (no server there).
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'node-html-parser'
import { LANGS, meta, ru, strings } from './src/i18n.mjs'

const root = dirname(fileURLToPath(import.meta.url))
const dist = join(root, 'dist')
const artifact = process.argv.includes('--artifact')
// Where the page lives: canonical and social links need the full address.
const SITE_URL = (process.env.SITE_URL || 'https://sizlarbilan.uz').replace(/\/$/, '')
// The site asks our panel which shop is its live sample; the preview has no server to ask.
const PREVIEW_SAMPLE = { name: 'Navro‘z Choyxona', url: 'https://navroz-choyxona.sizlarbilan.uz/' }
// Before the first paint: light, unless the visitor switched to dark last time (whatever the device's theme), and
// the class the styles of the script-driven parts wait for.
const PREPAINT = `<script>var t='light';try{if(localStorage.getItem('dh-theme')==='dark')t='dark'}catch(e){}document.documentElement.setAttribute('data-theme',t);document.documentElement.classList.add('js')</script>`

const read = (path) => readFile(join(root, path), 'utf8')
const hash = (data) => createHash('sha256').update(data).digest('hex').slice(0, 10)
const json = (value) => JSON.stringify(value).replace(/</g, '\\u003c')
const FONTS = [
  ['@fontsource-variable/manrope', 'manrope', 'Manrope Variable'],
  ['@fontsource-variable/jetbrains-mono', 'jetbrains-mono', 'JetBrains Mono Variable'],
]
const SUBSETS = ['latin', 'cyrillic']

/** Fills {{img:name}} and {{href:uz|ru}}; an unknown placeholder fails the build. */
function fillPlaceholders(text, values) {
  return text.replace(/\{\{([a-z]+):?([a-z]*)\}\}/g, (match, kind, name) => {
    const value = kind === 'img' ? values.img[name] : kind === 'href' ? values.href[name] : undefined
    if (value === undefined) throw new Error(`Unknown placeholder ${match}`)
    return value
  })
}

/** Every key the template asks for, so a missing translation fails the build instead of showing Uzbek. */
export function keysOf(html) {
  const doc = parse(html)
  const markup = doc.querySelectorAll('[data-t]').map((el) => el.getAttribute('data-t'))
  const attrs = doc.querySelectorAll('[data-t-attr]').flatMap((el) =>
    el.getAttribute('data-t-attr').split(',').map((pair) => pair.split(':')[1]))
  return { markup: [...new Set(markup)], attrs: [...new Set(attrs)] }
}

/** The body in Russian: inner HTML by data-t, attributes by data-t-attr. */
function translate(html) {
  const doc = parse(html, { comment: false, blockTextElements: { script: true, style: true } })
  for (const el of doc.querySelectorAll('[data-t]')) {
    const value = ru.markup[el.getAttribute('data-t')]
    if (value === undefined) throw new Error(`No Russian for data-t="${el.getAttribute('data-t')}"`)
    el.set_content(value)
  }
  for (const el of doc.querySelectorAll('[data-t-attr]')) {
    for (const pair of el.getAttribute('data-t-attr').split(',')) {
      const [attr, key] = pair.split(':')
      if (ru.attrs[key] === undefined) throw new Error(`No Russian for data-t-attr key "${key}"`)
      el.setAttribute(attr, ru.attrs[key])
    }
  }
  return doc.toString()
}

async function images(asDataUri) {
  const dir = join(root, 'public/img')
  const out = {}
  for (const file of (await readdir(dir)).filter((name) => name.endsWith('.webp'))) {
    const data = await readFile(join(dir, file))
    const name = file.replace(/\.webp$/, '')
    if (asDataUri) {
      out[name] = `data:image/webp;base64,${data.toString('base64')}`
    } else {
      const published = `${name}.${hash(data)}.webp`
      await writeFile(join(dist, 'landing', published), data)
      out[name] = `/landing/${published}`
    }
  }
  return out
}

/** @font-face rules for the self-hosted variable fonts (only the Latin and Cyrillic subsets the page uses). */
async function fontFaces() {
  const rules = []
  const preload = {}
  for (const [pkg, file, family] of FONTS) {
    const css = await readFile(join(root, 'node_modules', pkg, 'wght.css'), 'utf8')
    for (const subset of SUBSETS) {
      const source = join(root, 'node_modules', pkg, 'files', `${file}-${subset}-wght-normal.woff2`)
      const data = await readFile(source)
      const published = `${file}-${subset}.${hash(data)}.woff2`
      await copyFile(source, join(dist, 'landing', published))
      const range = css.match(new RegExp(`/\\* ${file}-${subset}-wght-normal \\*/[\\s\\S]*?unicode-range: ([^;]+);`))[1]
      rules.push(`@font-face{font-family:'${family}';font-style:normal;font-display:swap;font-weight:100 900;` +
        `src:url(/landing/${published}) format('woff2-variations');unicode-range:${range}}`)
      if (file === 'manrope') preload[subset] = `/landing/${published}`
    }
  }
  return { css: rules.join('\n'), preload }
}

function head(lang, fonts, icons) {
  const { title, description } = meta[lang]
  const url = lang === 'uz' ? `${SITE_URL}/` : `${SITE_URL}/ru`
  const preload = [fonts.preload.latin, lang === 'ru' && fonts.preload.cyrillic].filter(Boolean)
    .map((href) => `<link rel="preload" href="${href}" as="font" type="font/woff2" crossorigin>`).join('\n')
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="uz" href="${SITE_URL}/">
<link rel="alternate" hreflang="ru" href="${SITE_URL}/ru">
<link rel="alternate" hreflang="x-default" href="${SITE_URL}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="DeliveryHub">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="${lang === 'uz' ? 'uz_UZ' : 'ru_RU'}">
<meta name="theme-color" content="#F6F5F2">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="${icons.svg}" type="image/svg+xml">
<link rel="apple-touch-icon" href="${icons.touch}">
${preload}`
}

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF8A1F"/><stop offset="1" stop-color="#E4500A"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="url(#g)"/><g transform="rotate(8 17.5 18) translate(2.2 0)"><path d="M12.3 12.6v-1.5a3.7 3.7 0 0 1 7.4 0v1.5" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/><path d="M9.4 12.6h13.2l-.95 10.7a2.1 2.1 0 0 1-2.1 1.9h-7.1a2.1 2.1 0 0 1-2.1-1.9z" fill="#FFFFFF"/></g><path d="M6.2 15.4h3.4M4.4 18.6h5.2M6.6 21.8h3" fill="none" stroke="#FFFFFF" stroke-width="1.9" stroke-linecap="round"/></svg>`

async function buildSite() {
  const [body, css, js] = await Promise.all([read('src/body.html'), read('src/page.css'), read('src/page.js')])
  await rm(dist, { recursive: true, force: true })
  await mkdir(join(dist, 'landing'), { recursive: true })
  await mkdir(join(dist, 'ru'), { recursive: true })
  const img = await images(false)
  const fonts = await fontFaces()
  // The mark as an SVG icon, its home-screen PNG (hashed, cached for good) and /favicon.ico for browsers that take no
  // SVG icon (scripts/make-web-icons.sh draws the last two).
  const touch = await readFile(join(root, 'public/icons/apple-touch-icon.png'))
  const icons = { svg: `/landing/icon.${hash(ICON)}.svg`, touch: `/landing/apple-touch-icon.${hash(touch)}.png` }
  await writeFile(join(dist, icons.svg), ICON)
  await writeFile(join(dist, icons.touch), touch)
  await copyFile(join(root, 'public/icons/favicon.ico'), join(dist, 'favicon.ico'))
  const values = { img, href: { uz: '/', ru: '/ru' } }
  const script = fillPlaceholders(js, values)

  for (const lang of LANGS) {
    const filled = fillPlaceholders(body, values)
    const page = `<!doctype html>
<html lang="${lang}">
<head>
${head(lang, fonts, icons)}
<style>
${fonts.css}
${css}</style>
${PREPAINT}
</head>
<body>
${lang === 'uz' ? filled : translate(filled)}
<script type="application/json" id="i18n">${json({ lang, strings: { [lang]: strings[lang] } })}</script>
<script>
${script}</script>
</body>
</html>
`
    await writeFile(join(dist, lang === 'uz' ? 'index.html' : 'ru/index.html'), page)
  }
}

async function buildArtifact() {
  const [body, css, js] = await Promise.all([read('src/body.html'), read('src/page.css'), read('src/page.js')])
  await mkdir(dist, { recursive: true })
  const img = await images(true)
  const values = { img, href: { uz: '#uz', ru: '#ru' } }
  const page = `<title>DeliveryHub sayti</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap">
<style>
${css}</style>
${PREPAINT}
${fillPlaceholders(body, values)}
<script type="application/json" id="i18n">${json({ lang: 'uz', strings, markup: ru.markup, attrs: ru.attrs, preview: true, sample: PREVIEW_SAMPLE })}</script>
<script>
${fillPlaceholders(js, values)}</script>
`
  await writeFile(join(dist, 'artifact.html'), page)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await (artifact ? buildArtifact() : buildSite())
}

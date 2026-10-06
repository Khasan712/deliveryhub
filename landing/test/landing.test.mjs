// `npm test` builds the site first (dist/), then runs these with node:test.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { parse } from 'node-html-parser'
import { keysOf } from '../build.mjs'
import { meta, ru, strings } from '../src/i18n.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const file = (path) => readFileSync(join(root, path), 'utf8')
const page = (path) => parse(file(path), { blockTextElements: { script: true, style: true } })
const i18nOf = (doc) => JSON.parse(doc.querySelector('#i18n').text)

/** "a.b.c" paths of every leaf, to compare the shape of two dictionaries. */
function leaves(value, prefix = '') {
  if (Array.isArray(value)) return [`${prefix}[${value.length}]`]
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, inner]) => leaves(inner, `${prefix}.${key}`))
  return [prefix]
}

describe('the words', () => {
  const keys = keysOf(file('src/body.html'))

  it('every Uzbek text of the template has its Russian, and nothing more', () => {
    assert.deepEqual(keys.markup.filter((key) => !(key in ru.markup)), [])
    assert.deepEqual(Object.keys(ru.markup).filter((key) => !keys.markup.includes(key)), [])
    assert.deepEqual(keys.attrs.filter((key) => !(key in ru.attrs)), [])
    assert.deepEqual(Object.keys(ru.attrs).filter((key) => !keys.attrs.includes(key)), [])
  })

  it('the script speaks both languages with the same keys', () => {
    const forms = (path) => !/Words\.\w+$/.test(path)  // plural forms differ by language on purpose
    assert.deepEqual(leaves(strings.ru).filter(forms), leaves(strings.uz).filter(forms))
    for (const lang of ['uz', 'ru']) assert.ok(strings[lang].calc.hourWords.other && meta[lang].title)
  })
})

describe('the site', () => {
  const uz = page('dist/index.html')
  const ruPage = page('dist/ru/index.html')

  it('is Uzbek at / and Russian at /ru', () => {
    assert.equal(uz.querySelector('html').getAttribute('lang'), 'uz')
    assert.equal(ruPage.querySelector('html').getAttribute('lang'), 'ru')
    assert.equal(uz.querySelector('h1').text, 'Buyurtmalar chatda yo‘qolyaptimi?Mijoz o‘zi buyurtma bersin.')
    assert.equal(ruPage.querySelector('h1').text, 'Заказы теряются в переписке?Пусть клиент заказывает сам.')
    assert.equal(ruPage.querySelector('title').text, meta.ru.title)
    assert.equal(ruPage.querySelector('#leadComment').getAttribute('placeholder'), ru.attrs['form.commentPh'])
    assert.equal(i18nOf(uz).lang, 'uz')
    assert.deepEqual(Object.keys(i18nOf(ruPage).strings), ['ru'])
    for (const doc of [uz, ruPage]) {
      assert.doesNotMatch(doc.toString(), /\{\{/)
      assert.equal(doc.querySelectorAll('link[rel="alternate"]').length, 3)
    }
    assert.equal(ruPage.querySelector('link[rel="canonical"]').getAttribute('href'), 'https://sizlarbilan.uz/ru')
  })

  it('opens light, with a light/dark switch whose choice is applied before the first paint', () => {
    assert.equal(uz.querySelector('#themeToggle').getAttribute('aria-label'), 'Tungi rejim')
    assert.equal(ruPage.querySelector('#themeToggle').getAttribute('aria-label'), 'Тёмная тема')
    const head = uz.querySelector('head').toString()
    assert.match(head, /localStorage\.getItem\('dh-theme'\)/)
    assert.ok(head.indexOf('dh-theme') < head.indexOf('</head>'))
    assert.match(head, /var t='light'/)
    assert.equal(uz.querySelectorAll('meta[name="theme-color"]').map((m) => m.getAttribute('content')).join(), '#F6F5F2')
  })

  it('has the two scroll-driven stages, with the order summary after the pinned demo', () => {
    for (const [wrapper, pin] of [['#problemScroll', '#problem'], ['#demoScroll', '#demo']]) {
      assert.ok(uz.querySelector(`${wrapper} > .scrolly-pin${pin}`), wrapper)
    }
    assert.equal(uz.querySelector('#demoScroll #ddone'), null)
    assert.ok(uz.querySelector('#demoScroll + #ddone'))
    assert.equal(ruPage.querySelector('[data-t="demo.leadScroll"]').text, ru.markup['demo.leadScroll'])
    assert.equal(strings.uz.demo.result.length, 8)
  })

  it('links the two languages, and nothing of our panel', () => {
    const hrefs = uz.querySelectorAll('.langs a').map((a) => a.getAttribute('href'))
    assert.deepEqual(hrefs, ['/', '/ru'])
    assert.doesNotMatch(file('dist/index.html'), /\/login|deliveryhub\.sizlarbilan/)
  })

  it('sends the application to the platform API of its own host, and asks it for the sample shop', () => {
    const script = uz.querySelectorAll('script').map((s) => s.text).join('\n')
    assert.match(script, /fetch\('\/api\/v1\/leads'/)
    assert.match(script, /fetch\('\/api\/v1\/landing\/config'/)
    assert.equal(uz.querySelector('#sampleNote').getAttribute('hidden'), '')  // until our panel says which shop
    assert.equal(i18nOf(uz).preview, undefined)
    const form = uz.querySelector('#leadForm')
    assert.deepEqual(form.querySelectorAll('input, textarea').map((el) => el.getAttribute('name')),
      ['name', 'phone', 'business', 'kind', 'kind', 'kind', 'kind', 'comment', 'website'])
  })

  it('serves every file it refers to, under content-hashed names', () => {
    const html = file('dist/index.html') + file('dist/ru/index.html')
    const used = [...new Set(html.match(/(?<!\/api\/v1)\/landing\/[\w.-]+/g))]  // not the API's /landing/config
    assert.ok(used.length >= 8)
    for (const path of used) {
      assert.match(path, /\.[0-9a-f]{10}\.(webp|woff2|svg|png)$/)
      assert.ok(existsSync(join(root, 'dist', path)), path)
    }
    // Browsers that take no SVG icon ask for /favicon.ico; Apple's home screen gets its own PNG.
    assert.match(html, /<link rel="icon" href="\/favicon\.ico" sizes="32x32">/)
    assert.match(html, /<link rel="apple-touch-icon" href="\/landing\/apple-touch-icon\.[0-9a-f]{10}\.png">/)
    assert.ok(existsSync(join(root, 'dist/favicon.ico')))
  })
})

describe('the preview artifact', () => {
  execFileSync(process.execPath, [join(root, 'build.mjs'), '--artifact'])
  const doc = page('dist/artifact.html')

  it('is one file with both languages and a form that sends nothing', () => {
    const data = i18nOf(doc)
    assert.equal(data.preview, true)
    assert.deepEqual(Object.keys(data.strings), ['uz', 'ru'])
    assert.equal(data.markup['hero.q'], ru.markup['hero.q'])
    assert.equal(doc.querySelector('title').text, 'DeliveryHub sayti')
    assert.doesNotMatch(file('dist/artifact.html'), /(?<!\/api\/v1)\/landing\/|<html|<body|\{\{/)
    assert.match(doc.querySelector('.prow, img[src^="data:image/webp"]')?.getAttribute('src') ?? '', /^data:image\/webp;base64,/)
  })
})

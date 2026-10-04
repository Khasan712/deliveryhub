/* In-memory data of the mock Admin API (tests and `npm run dev:mock`). Deterministic: the same seed every time. */
import type {
  Business,
  Category,
  ClientDetail,
  OrderDetail,
  OrderSource,
  OrderStatus,
  Product,
  SaleSummary,
  StaffUser,
  TelegramLink,
  Unit,
  Week,
} from '../api/types'

export type MockClient = Omit<ClientDetail, 'orders' | 'orders_count'>

export interface MockDb {
  business: Business
  /** Working hours (`null`: none set — open at any time). */
  hours: Week | null
  users: StaffUser[]
  passwords: Record<number, string>
  /** Signed-in staff user id (the session cookie of the mock). */
  sessionUserId: number | null
  categories: Category[]
  units: Unit[]
  products: Product[]
  clients: MockClient[]
  orders: OrderDetail[]
  links: TelegramLink[]
  bot: { username: string; alive: boolean } | null
  voice: { gemini: boolean; live: boolean }
  voiceReady: boolean
  nextId: number
}

const DAY = 86_400_000
const FROZEN_INDEX = 12

/** Monday–Thursday 09:00–22:00, Friday and Saturday until 02:00 at night, Sunday 10:00–22:00. */
export function defaultWeek(): Week {
  const day = { open: '09:00', close: '22:00' }
  const late = { open: '09:00', close: '02:00' }
  return [day, day, day, day, late, late, { open: '10:00', close: '22:00' }].map((shift) => ({ ...shift }))
}

/** Small deterministic PRNG (mulberry32). */
function random(seed: number) {
  let value = seed
  return () => {
    value |= 0
    value = (value + 0x6d2b79f5) | 0
    let result = Math.imul(value ^ (value >>> 15), 1 | value)
    result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

export function foodImage(emoji: string, from: string, to: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>` +
    `<rect width="160" height="120" fill="url(#g)"/>` +
    `<text x="80" y="66" font-size="58" text-anchor="middle" dominant-baseline="middle">${emoji}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export const QR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29" shape-rendering="crispEdges"><rect width="29" height="29" fill="#fff"/>' +
  '<path fill="#000" d="M2 2h7v7H2zM3 3v5h5V3zM4 4h3v3H4zM20 2h7v7h-7zM21 3v5h5V3zM22 4h3v3h-3zM2 20h7v7H2zM3 21v5h5v-5zM4 22h3v3H4zM11 2h2v2h-2zM14 3h2v3h-2zM11 6h2v4h-2zM14 8h3v2h-3zM11 11h3v2h-3zM16 11h2v3h-2zM20 11h2v2h-2zM24 11h3v2h-3zM2 11h3v2H2zM7 12h2v3H7zM11 15h2v4h-2zM14 15h4v2h-4zM20 14h3v3h-3zM24 15h2v4h-2zM15 19h2v3h-2zM19 19h4v2h-4zM11 21h3v2h-3zM18 22h2v5h-2zM21 23h3v2h-3zM25 21h2v6h-2zM12 24h4v3h-4z"/></svg>'

export function createDb(): MockDb {
  const now = Date.now()
  const rand = random(42)
  const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)]
  const iso = (time: number) => new Date(time).toISOString()

  const business: Business = {
    name: 'Burger House',
    slug: 'food',
    logo: null,
    brand_color: '#ff6b00',
    shop_url: 'http://food.localhost:5173/',
  }

  const users: StaffUser[] = [
    { id: 1, phone_number: '+998901234567', first_name: 'Aziz', last_name: 'Karimov', role: 'admin', is_active: true, created_at: iso(now - 120 * DAY) },
    { id: 2, phone_number: '+998935557788', first_name: 'Dilnoza', last_name: 'Rahimova', role: 'manager', is_active: true, created_at: iso(now - 60 * DAY) },
    { id: 3, phone_number: '+998977001122', first_name: 'Sardor', last_name: 'Aliyev', role: 'manager', is_active: false, created_at: iso(now - 20 * DAY) },
  ]

  const categories: Category[] = [
    { id: 1, name_uz: 'Burgerlar', name_ru: 'Бургеры', products_count: 0 },
    { id: 2, name_uz: 'Pitsa', name_ru: 'Пицца', products_count: 0 },
    { id: 3, name_uz: 'Ichimliklar', name_ru: 'Напитки', products_count: 0 },
    { id: 4, name_uz: 'Gazaklar', name_ru: 'Закуски', products_count: 0 },
    { id: 5, name_uz: 'Shirinliklar', name_ru: 'Десерты', products_count: 0 },
  ]

  const units: Unit[] = [
    { id: 1, name_uz: 'dona', name_ru: 'шт' },
    { id: 2, name_uz: 'porsiya', name_ru: 'порция' },
    { id: 3, name_uz: 'litr', name_ru: 'литр' },
  ]

  const catalog: Array<[string, string, number, number, number, string, string, string]> = [
    ['Chizburger', 'Чизбургер', 32000, 1, 1, '🍔', '#fde68a', '#fb923c'],
    ['Gamburger', 'Гамбургер', 28000, 1, 1, '🍔', '#fed7aa', '#f97316'],
    ['Dubl burger', 'Двойной бургер', 45000, 1, 1, '🍔', '#fecaca', '#ef4444'],
    ['Tovuq burger', 'Чикенбургер', 30000, 1, 1, '🍔', '#fef3c7', '#f59e0b'],
    ['Pepperoni', 'Пепперони', 79000, 2, 1, '🍕', '#fecaca', '#dc2626'],
    ['Margarita', 'Маргарита', 65000, 2, 1, '🍕', '#fef9c3', '#eab308'],
    ['To\'rt pishloq', 'Четыре сыра', 85000, 2, 1, '🍕', '#fef3c7', '#d97706'],
    ['Coca-Cola 0.5', 'Кока-кола 0,5', 9000, 3, 1, '🥤', '#fecaca', '#b91c1c'],
    ['Fanta 0.5', 'Фанта 0,5', 9000, 3, 1, '🥤', '#fed7aa', '#ea580c'],
    ['Limonad', 'Лимонад', 15000, 3, 3, '🍋', '#fef9c3', '#84cc16'],
    ['Kofe latte', 'Кофе латте', 22000, 3, 1, '☕', '#e7e5e4', '#78716c'],
    ['Kartoshka fri', 'Картофель фри', 16000, 4, 2, '🍟', '#fef08a', '#f59e0b'],
    ['Naggetslar', 'Наггетсы', 24000, 4, 2, '🍗', '#fed7aa', '#c2410c'],
    ['Sezar salati', 'Салат Цезарь', 34000, 4, 2, '🥗', '#d9f99d', '#16a34a'],
    ['Chizkeyk', 'Чизкейк', 27000, 5, 2, '🍰', '#fce7f3', '#db2777'],
    ['Muzqaymoq', 'Мороженое', 14000, 5, 2, '🍨', '#e0e7ff', '#6366f1'],
  ]

  const products: Product[] = catalog.map(([nameUz, nameRu, price, categoryId, unitId, emoji, from, to], index) => ({
    id: index + 1,
    name_uz: nameUz,
    name_ru: nameRu,
    desc_uz: '',
    desc_ru: '',
    price,
    unit: units.find((unit) => unit.id === unitId) ?? null,
    category: (() => {
      const category = categories.find((item) => item.id === categoryId)
      return category ? { id: category.id, name_uz: category.name_uz, name_ru: category.name_ru } : null
    })(),
    image: index === 10 ? null : foodImage(emoji, from, to),
    // «Naggetslar» is sold out for now: frozen (the shop refuses it, the point of sale warns).
    frozen: index === FROZEN_INDEX,
    frozen_at: index === FROZEN_INDEX ? iso(now - 3 * 3_600_000) : null,
    created_at: iso(now - (90 - index * 3) * DAY),
  }))

  const people: Array<[string, string, string, string, 'uz' | 'ru' | '']> = [
    ['Jasur', 'Toshmatov', '+998901112233', 'jasur_t', 'uz'],
    ['Madina', 'Yusupova', '+998935554433', 'madina_yu', 'uz'],
    ['Олег', 'Ким', '+998977778899', 'oleg_kim', 'ru'],
    ['Shahzod', 'Ergashev', '+998998887766', '', 'uz'],
    ['Анна', 'Ли', '+998946665544', 'anna_li', 'ru'],
    ['Bekzod', 'Nazarov', '+998903332211', 'bekzod', 'uz'],
    ['Nilufar', 'Saidova', '+998915559900', '', ''],
    ['Тимур', 'Ахмедов', '+998937771100', 'timur_a', 'ru'],
  ]
  const addresses = ['Chilonzor 9-kvartal, 12-uy', 'Yunusobod 4, 17-uy', 'Mirzo Ulug\'bek, Buyuk Ipak Yo\'li 45', 'Sergeli 7, 3-uy', 'Olmazor, Qorasaroy 102']

  const clients: MockClient[] = people.map(([first, last, phone, nick, lang], index) => ({
    id: index + 1,
    first_name: first,
    last_name: last,
    phone,
    tg_nick: nick,
    telegram: index % 4 !== 3,
    lang,
    created_at: iso(now - (60 - index * 5) * DAY),
    location: addresses[index % addresses.length],
  }))

  const statuses: OrderStatus[] = ['ordered', 'on_the_way', 'completed', 'completed', 'completed', 'rejected']
  const sources: OrderSource[] = ['web', 'miniapp', 'bot', 'admin']
  const orders: OrderDetail[] = []
  for (let index = 0; index < 64; index++) {
    const id = 100 + index
    const created = now - Math.floor((63 - index) * 0.45 * DAY + rand() * 3_600_000)
    const source = pick(sources)
    const client = source === 'admin' && rand() < 0.6 ? null : pick(clients)
    const status: OrderStatus = index >= 61 ? 'ordered' : index === 60 ? 'on_the_way' : pick(statuses)
    const lines = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => pick(products))
    const unique = [...new Map(lines.map((product) => [product.id, product])).values()]
    const items = unique.map((product) => {
      const quantity = 1 + Math.floor(rand() * 3)
      return {
        product_id: product.id,
        name_uz: product.name_uz,
        name_ru: product.name_ru,
        quantity,
        price: product.price,
        total: quantity * product.price,
      }
    })
    const delivery = rand() < 0.6
    const walkIn = client === null
    orders.push({
      id,
      status,
      source,
      created_at: iso(created),
      updated_at: iso(created + 1_800_000),
      customer_name: walkIn ? (rand() < 0.5 ? pick(['Akmal', 'Gulnora', 'Ruslan', 'Kamola']) : '') : client.first_name,
      phone: walkIn ? (rand() < 0.5 ? '+998901110022' : '') : client.phone,
      total: items.reduce((sum, item) => sum + item.total, 0),
      items_count: items.reduce((sum, item) => sum + item.quantity, 0),
      client_id: client?.id ?? null,
      address: delivery ? pick(addresses) : '',
      lat: delivery ? (41.28 + rand() * 0.08).toFixed(6) : '',
      lng: delivery ? (69.2 + rand() * 0.1).toFixed(6) : '',
      delivery_type: delivery ? 'delivery' : 'pickup',
      payment_method: rand() < 0.5 ? 'cash' : 'card',
      comment: rand() < 0.15 ? 'Iltimos, tezroq yetkazing' : '',
      created_by: source === 'admin' ? { id: 1, name: 'Aziz Karimov' } : null,
      client: client
        ? { id: client.id, first_name: client.first_name, last_name: client.last_name, phone: client.phone, tg_nick: client.tg_nick }
        : null,
      items,
    })
  }

  const links: TelegramLink[] = [
    {
      id: 1,
      user: { id: 1, name: 'Aziz Karimov' },
      telegram_id: 501234567,
      first_name: 'Aziz',
      username: 'aziz_k',
      lang: 'uz',
      notify_orders: true,
      blocked: false,
      created_at: iso(now - 30 * DAY),
      last_seen_at: iso(now - 3_600_000),
    },
    {
      id: 2,
      user: { id: 2, name: 'Dilnoza Rahimova' },
      telegram_id: 509876543,
      first_name: 'Dilnoza',
      username: '',
      lang: 'ru',
      notify_orders: false,
      blocked: false,
      created_at: iso(now - 12 * DAY),
      last_seen_at: iso(now - 2 * DAY),
    },
  ]

  return {
    business,
    hours: defaultWeek(),
    users,
    passwords: { 1: 'admin12345', 2: 'manager12345', 3: 'manager12345' },
    sessionUserId: null,
    categories,
    units,
    products,
    clients,
    orders,
    links,
    bot: { username: 'burger_house_staff_bot', alive: true },
    voice: { gemini: false, live: false },
    voiceReady: true,
    nextId: 1000,
  }
}

export const store: { db: MockDb } = { db: createDb() }

export function resetDb(change?: (db: MockDb) => void): MockDb {
  store.db = createDb()
  change?.(store.db)
  return store.db
}

export function saleSummary(order: OrderDetail): SaleSummary {
  return {
    id: order.id,
    name: order.customer_name,
    phone: order.phone,
    status: order.status,
    total: order.total,
    items_count: order.items_count,
    created_at: order.created_at,
  }
}

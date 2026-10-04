/**
 * A richer menu for `npm run dev:mock` (the UI without a backend). Images are served from
 * MOCK_MEDIA_DIR when it is set (see README); without it the shop shows its letter placeholders.
 */
import type { Order, Product } from '../api/types'
import { GEO, type MockData } from './handlers'

const img = (file: string) => `/media/demo/${file}`

const product = (
  id: number,
  category_id: number | null,
  name_uz: string,
  name_ru: string,
  price: number,
  image: string | null,
  desc_uz = '',
  desc_ru = '',
  unit: [string, string] = ['dona', 'шт'],
): Product => ({ id, category_id, name_uz, name_ru, price, image, desc_uz, desc_ru, unit_uz: unit[0], unit_ru: unit[1] })

const products: Product[] = [
  product(1, 1, 'Klassik burger', 'Классический бургер', 35000, img('Klassik_Burger.jpg'), 'Mol go‘shti kotleti, cheddar, pomidor, tuzlangan bodring va maxsus sous.', 'Говяжья котлета, чеддер, томат, маринованный огурец и фирменный соус.'),
  product(2, 1, 'Chizburger', 'Чизбургер', 38000, img('cheddarbaconcheeseburger__FillWzgwMCw4MDBd.jpg'), 'Ikki qavat eritilgan pishloq va shirali kotlet.', 'Двойной расплавленный сыр и сочная котлета.'),
  product(3, 1, 'Dabl burger', 'Дабл бургер', 52000, img('Double_Cheeseburger.jpg'), 'Ikki kotlet, ikki pishloq — haqiqiy ochlar uchun.', 'Две котлеты и два сыра — для настоящего голода.'),
  product(4, 1, 'BBQ burger', 'BBQ бургер', 45000, null, 'Dudlangan BBQ sousi va qarsildoq piyoz halqalari.', 'Копчёный соус BBQ и хрустящие луковые кольца.'),
  product(5, 1, 'Tovuqli burger', 'Бургер с курицей', 36000, img('Chicken_Burger.jpg')),
  product(6, 1, 'Vegetarian burger', 'Вегетарианский бургер', 34000, img('Veggie_Burger.jpg')),
  product(7, 2, 'Margarita', 'Маргарита', 59000, img('Margherita_Pizza.jpg'), 'Pomidor sousi, motsarella, rayhon. 30 sm.', 'Томатный соус, моцарелла, базилик. 30 см.'),
  product(8, 2, 'Pepperoni', 'Пепперони', 69000, img('Pepperoni_Pizza.jpg'), 'Achchiq pepperoni va ko‘p pishloq. 30 sm.', 'Острая пепперони и много сыра. 30 см.'),
  product(9, 2, 'BBQ tovuqli pitsa', 'Пицца BBQ с курицей', 72000, img('BBQ_Tovuqli_Pizza.jpg')),
  product(10, 2, '4 pishloqli pitsa', 'Пицца 4 сыра', 75000, img('4_Pishloqli_Pizza.jpg')),
  product(11, 3, 'Fri kartoshka', 'Картофель фри', 18000, null, '', '', ['porsiya', 'порция']),
  product(12, 3, 'Gril hot-dog', 'Хот-дог гриль', 24000, img('SEA-best-grilled-hot-dogs-recipe-hero-02-9d245c0d43874a3da13a7228682b0dce.jpg')),
  product(13, 3, 'Achchiq qanotchalar', 'Острые крылышки', 32000, img('cr-chipotle-chicken-wings-qhzj-jumbo.jpg'), '8 dona tovuq qanoti, chipotle sousi bilan.', '8 куриных крылышек с соусом чипотле.'),
  product(14, 4, 'Cheesecake', 'Чизкейк', 28000, img('Cheesecake.jpg'), '', '', ['bo‘lak', 'кусок']),
  product(15, 4, 'Tiramisu', 'Тирамису', 30000, img('Tiramisu.jpg'), '', '', ['bo‘lak', 'кусок']),
  product(16, 5, 'Coca-Cola 1 l', 'Coca-Cola 1 л', 12000, null),
  product(17, 5, 'Limonad', 'Лимонад', 15000, null, 'Uy limonadi, yalpiz bilan.', 'Домашний лимонад с мятой.', ['stakan', 'стакан']),
]

const now = Date.now()
const iso = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString()

const orders = (): Order[] => [
  {
    id: 1042,
    status: 'on_the_way',
    source: 'web',
    created_at: iso(25),
    updated_at: iso(5),
    total: 112000,
    items: [
      { product_id: 3, name_uz: 'Dabl burger', name_ru: 'Дабл бургер', image: img('Double_Cheeseburger.jpg'), quantity: 1, price: 52000, total: 52000 },
      { product_id: 8, name_uz: 'Pepperoni', name_ru: 'Пепперони', image: img('Pepperoni_Pizza.jpg'), quantity: 1, price: 60000, total: 60000 },
    ],
    customer_name: 'Aziz',
    phone: '+998901234567',
    address: 'Chilonzor 9-kvartal, 12-uy',
    lat: '41.2856',
    lng: '69.2034',
    delivery_type: 'delivery',
    payment_method: 'cash',
    comment: 'Domofon 25',
  },
  {
    id: 987,
    status: 'completed',
    source: 'miniapp',
    created_at: iso(60 * 26),
    updated_at: iso(60 * 25),
    total: 71000,
    items: [
      { product_id: 1, name_uz: 'Klassik burger', name_ru: 'Классический бургер', image: img('Klassik_Burger.jpg'), quantity: 1, price: 35000, total: 35000 },
      { product_id: 11, name_uz: 'Fri kartoshka', name_ru: 'Картофель фри', image: null, quantity: 2, price: 18000, total: 36000 },
    ],
    customer_name: 'Aziz',
    phone: '+998901234567',
    address: '',
    lat: null,
    lng: null,
    delivery_type: 'pickup',
    payment_method: 'card',
    comment: '',
  },
]

export const demoData: MockData = {
  business: {
    name: 'Burger House',
    tagline: 'Shahardagi eng shirali burgerlar',
    support_phone: '+998712001122',
    address: "Amir Temur ko'chasi, 15, Yunusobod tumani, Toshkent",
    lat: 41.311081,
    lng: 69.279737,
    delivery_time: '30–45',
    min_order: 50000,
    brand_color: '#ff6b00',
    logo: null,
  },
  categories: [
    { id: 1, name_uz: 'Burgerlar', name_ru: 'Бургеры' },
    { id: 2, name_uz: 'Pitsalar', name_ru: 'Пиццы' },
    { id: 3, name_uz: 'Gazaklar', name_ru: 'Закуски' },
    { id: 4, name_uz: 'Desertlar', name_ru: 'Десерты' },
    { id: 5, name_uz: 'Ichimliklar', name_ru: 'Напитки' },
  ],
  products,
  popular: [3, 8, 1, 11, 14],
  client: {
    id: 7,
    first_name: 'Aziz',
    last_name: 'Karimov',
    phone: '+998901234567',
    telegram: true,
    tg_nick: 'aziz',
    lang: '',
    address: 'Chilonzor 9-kvartal, 12-uy',
    lat: null,
    lng: null,
  },
  token: 'demo-token',
  orders,
  geo: GEO,
  demo: true,
}

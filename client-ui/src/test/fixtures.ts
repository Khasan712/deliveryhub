import type { Business, Category, Client, Order, Product } from '../api/types'

export const TOKEN = 'token-aziz'

/** Where the test map lands when it is moved (Chilonzor): src/test/fakeMap.tsx. */
export const MAP_MOVE = { lat: 41.2856, lng: 69.2035 }

export const business: Business = {
  name: 'Burger House',
  tagline: 'Eng mazali burgerlar shaharda',
  support_phone: '+998712001122',
  address: "Amir Temur ko'chasi, 15, Toshkent",
  lat: 41.311081,
  lng: 69.279737,
  working_hours: { week: null, timezone: 'Asia/Tashkent', open: true, opens_at: null, closes_at: null },
  delivery_time: '30–45',
  min_order: 50000,
  brand_color: '#ff6b00',
  logo: null,
}

export const categories: Category[] = [
  { id: 1, name_uz: 'Burgerlar', name_ru: 'Бургеры' },
  { id: 2, name_uz: 'Ichimliklar', name_ru: 'Напитки' },
  { id: 3, name_uz: 'Desertlar', name_ru: 'Десерты' }, // no products → no section
]

export const products: Product[] = [
  {
    id: 1,
    name_uz: 'Klassik burger',
    name_ru: 'Классический бургер',
    desc_uz: 'Mol go‘shti, cheddar pishlog‘i va maxsus sous',
    desc_ru: 'Говядина, чеддер и фирменный соус',
    price: 35000,
    unit_uz: 'dona',
    unit_ru: 'шт',
    category_id: 1,
    image: '/media/burger_house/products/classic.jpg',
    thumb: '/media/burger_house/products/classic.thumb.jpg',
    frozen: false,
  },
  {
    id: 2,
    name_uz: 'Chizburger',
    name_ru: 'Чизбургер',
    desc_uz: 'Ikki qavat pishloq',
    desc_ru: 'Двойной сыр',
    price: 38000,
    unit_uz: 'dona',
    unit_ru: 'шт',
    category_id: 1,
    image: null,
    thumb: null,
    frozen: false,
  },
  {
    id: 3,
    name_uz: 'Kola 0.5 l',
    name_ru: 'Кола 0,5 л',
    desc_uz: '',
    desc_ru: '',
    price: 9000,
    unit_uz: 'dona',
    unit_ru: 'шт',
    category_id: 2,
    image: null,
    thumb: null,
    frozen: false,
  },
  {
    id: 4,
    name_uz: 'Fri kartoshka',
    name_ru: 'Картофель фри',
    desc_uz: 'Qarsildoq kartoshka',
    desc_ru: 'Хрустящий картофель',
    price: 15000,
    unit_uz: '',
    unit_ru: '',
    category_id: null,
    image: null,
    thumb: null,
    frozen: false,
  },
]

export const popular = [2, 1, 3]

export const client: Client = {
  id: 7,
  first_name: 'Aziz',
  last_name: 'Karimov',
  phone: '+998901234567',
  telegram: false,
  tg_nick: '',
  lang: 'uz',
  address: 'Chilonzor 9, 12-uy',
  lat: null,
  lng: null,
}

export function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 131,
    status: 'ordered',
    source: 'web',
    created_at: '2026-10-01T12:30:00+05:00',
    updated_at: '2026-10-01T12:31:00+05:00',
    total: 82000,
    items: [
      {
        product_id: 1,
        name_uz: 'Klassik burger',
        name_ru: 'Классический бургер',
        image: null,
        quantity: 2,
        price: 35000,
        total: 70000,
      },
      { product_id: 3, name_uz: 'Kola 0.5 l', name_ru: 'Кола 0,5 л', image: null, quantity: 1, price: 9000, total: 9000 },
      { product_id: 99, name_uz: 'Eski taom', name_ru: 'Старое блюдо', image: null, quantity: 1, price: 3000, total: 3000 },
    ],
    customer_name: 'Aziz',
    phone: '+998901234567',
    address: 'Chilonzor 9',
    lat: '41.31',
    lng: '69.27',
    delivery_type: 'delivery',
    payment_method: 'card',
    comment: 'Domofon 25',
    ...overrides,
  }
}

/** Types of the Shop API (docs/api.md → "Shop API"). Money is an integer amount in so'm. */

export type Lang = 'uz' | 'ru'

export interface Business {
  name: string
  tagline: string
  support_phone: string
  /** Where pickup orders are collected; '' and null coordinates until the business is put on the map. */
  address: string
  lat: number | null
  lng: number | null
  /** Free text such as "30–45" (minutes). */
  delivery_time: string
  min_order: number
  brand_color: string
  logo: string | null
}

export interface Category {
  id: number
  name_uz: string
  name_ru: string
}

export interface Product {
  id: number
  name_uz: string
  name_ru: string
  desc_uz: string
  desc_ru: string
  price: number
  unit_uz: string
  unit_ru: string
  category_id: number | null
  image: string | null
}

export interface Client {
  id: number
  first_name: string
  last_name: string
  phone: string
  telegram: boolean
  tg_nick: string
  lang: Lang | ''
  /** Last delivery address, to prefill checkout. */
  address: string
  lat: number | string | null
  lng: number | string | null
}

export interface ShopData {
  business: Business
  bot_username: string | null
  categories: Category[]
  products: Product[]
  /** Product ids, most ordered first. */
  popular: number[]
  client: Client | null
}

export type OrderStatus = 'ordered' | 'on_the_way' | 'completed' | 'rejected'
export type DeliveryType = 'delivery' | 'pickup'
export type PaymentMethod = 'cash' | 'card'
export type OrderSource = 'web' | 'miniapp' | 'bot' | 'admin'

export interface OrderItem {
  product_id: number | null
  name_uz: string
  name_ru: string
  image: string | null
  quantity: number
  price: number
  total: number
}

export interface Order {
  id: number
  status: OrderStatus
  source: OrderSource
  created_at: string
  updated_at: string
  total: number
  items: OrderItem[]
  customer_name: string
  phone: string
  address: string
  lat: string | number | null
  lng: string | number | null
  delivery_type: DeliveryType | ''
  payment_method: PaymentMethod | ''
  comment: string
}

export interface AuthResult {
  token: string
  client: Client
  created: boolean
}

export interface PhoneCodeRequested {
  ok: true
  phone: string
  resend_in: number
  ttl: number
  /** Only in local development. */
  debug_code?: string
}

export interface TelegramLoginStarted {
  token: string
  url: string
  expires_in: number
}

export type TelegramLoginCheck =
  | { status: 'pending' }
  | { status: 'expired' }
  | ({ status: 'confirmed' } & AuthResult)

export interface NewOrder {
  items: { product_id: number; quantity: number }[]
  name: string
  phone: string
  delivery_type: DeliveryType
  address: string
  lat: number | null
  lng: number | null
  payment_method: PaymentMethod
  comment: string
  platform: 'web' | 'miniapp'
  lang: Lang
}

export interface ProfilePatch {
  first_name?: string
  last_name?: string
  lang?: Lang
}

/** A place found by the map's search (GET /geo/search). */
export interface Place {
  address: string
  lat: number
  lng: number
}

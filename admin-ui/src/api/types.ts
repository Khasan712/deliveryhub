/* Admin API types — docs/api.md, sections "Conventions" and "Admin API". */

export type Role = 'admin' | 'manager'
export type OrderStatus = 'ordered' | 'on_the_way' | 'completed' | 'rejected'
export type OrderSource = 'web' | 'miniapp' | 'bot' | 'admin'
export type DeliveryType = 'delivery' | 'pickup'
export type PaymentMethod = 'cash' | 'card'
export type ClientLang = 'uz' | 'ru' | ''

export const ORDER_STATUSES: readonly OrderStatus[] = ['ordered', 'on_the_way', 'completed', 'rejected']
export const ORDER_SOURCES: readonly OrderSource[] = ['web', 'miniapp', 'bot', 'admin']

export interface Paginated<T> {
  count: number
  page: number
  pages: number
  results: T[]
}

export interface StaffUser {
  id: number
  phone_number: string
  first_name: string
  last_name: string
  role: Role
  is_active: boolean
  created_at: string
}

export interface Business {
  name: string
  slug: string
  logo: string | null
  brand_color: string
  shop_url: string
}

export interface MeResponse {
  user: StaffUser
  business: Business
}

// ------------------------------------------------------------------ working hours
/** One day's shift, "HH:MM". A `close` not after `open` is on the next day; "00:00"–"24:00" is the whole day. */
export interface Shift {
  open: string
  close: string
}

/** Seven shifts, Monday first; `null` is a day off. */
export type Week = Array<Shift | null>

export interface WorkingHours {
  /** `null` — no hours set: the shop takes orders at any time. */
  week: Week | null
  timezone: string
  /** At the time of the response, in `timezone`. */
  open: boolean
  /** While closed: the next opening (`null`: every day is off). */
  opens_at: string | null
  /** While open: the closing (`null`: never — open around the clock). */
  closes_at: string | null
}

// ------------------------------------------------------------------ dashboard
export interface DashboardData {
  orders: { total: number; new: number; on_the_way: number; completed: number; last_7_days: number }
  clients: { total: number; new_7_days: number }
  products: { total: number }
  categories: { total: number }
  by_status: Array<{ status: OrderStatus | string; count: number }>
  daily: Array<{ date: string; count: number }>
  /** Today, every channel: the orders and their money (rejected orders bring none). */
  today: { orders: number; revenue: number }
  latest_orders: OrderSummary[]
}

// ------------------------------------------------------------------ orders
export interface OrderSummary {
  id: number
  status: OrderStatus
  source: OrderSource
  created_at: string
  customer_name: string
  phone: string
  total: number
  items_count: number
  client_id: number | null
  delivery_type: DeliveryType | ''
  payment_method: PaymentMethod | ''
  address: string
  /** What was ordered (the phone's order cards show it). */
  lines: OrderLinePreview[]
}

export interface OrderLinePreview {
  name_uz: string
  name_ru: string
  quantity: number
}

export interface OrderItem {
  product_id: number | null
  name_uz: string
  name_ru: string
  quantity: number
  price: number
  total: number
}

export interface OrderDetail extends Omit<OrderSummary, 'lines'> {
  updated_at: string
  lat: string | number | null
  lng: string | number | null
  comment: string
  created_by: { id: number; name: string } | null
  client: { id: number; first_name: string; last_name: string; phone: string; tg_nick: string } | null
  items: OrderItem[]
}

export interface OrdersQuery {
  status?: string
  source?: string
  search?: string
  page?: number
  page_size?: number
}

// ------------------------------------------------------------------ clients
export interface ClientSummary {
  id: number
  first_name: string
  last_name: string
  phone: string
  tg_nick: string
  telegram: boolean
  lang: ClientLang
  orders_count: number
  created_at: string
}

export interface ClientDetail extends ClientSummary {
  location: string
  orders: OrderSummary[]
}

export interface ClientUpdate {
  first_name: string
  last_name: string
  phone: string
  location: string
}

// ------------------------------------------------------------------ catalog
export interface Unit {
  id: number
  name_uz: string
  name_ru: string
}

export interface Category {
  id: number
  name_uz: string
  name_ru: string
  products_count?: number
}

export interface Product {
  id: number
  name_uz: string
  name_ru: string
  desc_uz: string
  desc_ru: string
  price: number
  unit: Unit | null
  category: Category | null
  /** Up to 1280 px: the edit form. */
  image: string | null
  /** Up to 512 px (or the image): lists and the point of sale. */
  thumb: string | null
  /** Not available right now: the shop shows it but refuses orders for it; staff may still sell it. */
  frozen: boolean
  frozen_at: string | null
  created_at: string
}

export interface ProductInput {
  name_uz: string
  name_ru: string
  price: number
  desc_uz: string
  desc_ru: string
  unit_id: number | null
  category_id: number | null
  frozen?: boolean
}

export interface ProductsQuery {
  search?: string
  category?: string | number
  /** `true` — only frozen, `false` — only on sale. */
  frozen?: boolean
  page?: number
  page_size?: number
}

export interface NamePair {
  name_uz: string
  name_ru: string
}

// ------------------------------------------------------------------ staff users
export interface StaffUserInput {
  phone_number: string
  first_name: string
  last_name: string
  role: Role
  is_active: boolean
  password?: string
}

// ------------------------------------------------------------------ sales
export type SaleStatus = 'ordered' | 'on_the_way' | 'completed'
export const SALE_STATUSES: readonly SaleStatus[] = ['ordered', 'on_the_way', 'completed']

export interface SalesCategory {
  id: number
  name_uz: string
  name_ru: string
}

export interface SalesProduct {
  id: number
  name_uz: string
  name_ru: string
  price: number
  unit_uz: string
  unit_ru: string
  category_id: number | null
  image: string | null
  /** Up to 512 px (or the image): the tiles and the order panel. */
  thumb: string | null
  /** Frozen: customers cannot order it right now, the point of sale still sells it (with a warning). */
  frozen: boolean
}

export interface SaleSummary {
  id: number
  name: string
  phone: string
  status: OrderStatus
  total: number
  items_count: number
  created_at: string
}

export interface SalesStats {
  count: number
  revenue: number
  average: number
  all_orders_today: number
}

export interface SalesData {
  categories: SalesCategory[]
  products: SalesProduct[]
  recent: SaleSummary[]
  stats: SalesStats
  voice: { gemini: boolean; live: boolean }
}

export interface CartItem {
  product_id: number
  quantity: number
}

export interface SaleForm {
  customer_name: string
  phone: string
  address: string
  delivery_type: DeliveryType
  payment_method: PaymentMethod
  status: SaleStatus
  comment: string
}

export interface SaleCreateResponse {
  order: SaleSummary
  stats: SalesStats
}

// ------------------------------------------------------------------ voice
export interface VoiceToken {
  token: string
  url: string
  setup: unknown
}

/** The form state sent to /voice/parse and returned (updated) in `result`. */
export interface VoiceState extends SaleForm {
  items: CartItem[]
}

export interface VoiceResult extends Partial<Omit<SaleForm, 'delivery_type' | 'payment_method' | 'status'>> {
  delivery_type?: string
  payment_method?: string
  status?: string
  items?: CartItem[]
  unmatched?: string[]
  submit?: boolean
  reply?: string
  transcript?: string
}

export interface VoiceParseResponse {
  result: VoiceResult
  engine: 'gemini' | 'local'
}

// ------------------------------------------------------------------ telegram
export interface TelegramLink {
  id: number
  user: { id: number; name: string }
  telegram_id: number
  first_name: string
  username: string
  lang: string
  notify_orders: boolean
  blocked: boolean
  created_at: string
  last_seen_at: string | null
}

export interface TelegramData {
  bot: { username: string; alive: boolean } | null
  voice_ready: boolean
  my_links: TelegramLink[]
  team_links: TelegramLink[]
  users: Array<{ id: number; name: string }>
}

export interface TelegramInvite {
  url: string
  qr_svg: string
  user: string
  expires_at: string
}

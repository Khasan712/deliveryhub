/* Admin API types — docs/api.md, sections "Conventions" and "Admin API". */

/** `admin` and `manager` are the head office; `branch` — the staff of one branch (with branches off: a manager). */
export type Role = 'admin' | 'manager' | 'branch'
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
  /** The branch of a `branch` user (`null` for the head office). */
  branch: BranchRef | null
  is_active: boolean
  created_at: string
}

export interface Business {
  name: string
  slug: string
  logo: string | null
  brand_color: string
  shop_url: string
  /** Our panel lets this business have branches (off: everything works as without them). */
  branches_enabled: boolean
  /** Branches on and 2+ active ones: a delivery order waits for the head office to send it to a branch. */
  dispatch: boolean
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

// ------------------------------------------------------------------ branches
export interface BranchRef {
  id: number
  name: string
}

export interface Branch {
  id: number
  name: string
  address: string
  lat: number | null
  lng: number | null
  phone: string
  /** An inactive branch gets no new orders and is not offered to customers; its history stays. */
  is_active: boolean
  created_at: string
  /** Its active staff users. */
  staff_count: number
  /** The same users, by first name. */
  staff: BranchStaff[]
  /** Its orders today (rejected ones not counted) and their money. */
  today: { orders: number; revenue: number }
}

export interface BranchStaff {
  id: number
  name: string
  phone_number: string
}

/** Create / update (admin). `lat` and `lng` always together: the point is how the nearest branch is found. */
export interface BranchInput {
  name: string
  address: string
  lat: number
  lng: number
  phone?: string
  is_active?: boolean
}

/** A branch the head office may send an order to (OrderDetail), nearest first. */
export interface BranchOption {
  id: number
  name: string
  address: string
  lat: number | null
  lng: number | null
  /** Straight line from the order's point; `null` when the order (or the branch) has no point. */
  distance_km: number | null
  /** The first one, when distances are known. */
  nearest: boolean
}

/** A geocoder result (GET /geo/search). */
export interface Place {
  address: string
  lat: number
  lng: number
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
  /** The head office with branches on: today per branch (the active ones and any with orders today); `[]` otherwise. */
  branches: Array<{ id: number; name: string; orders: number; revenue: number }>
  /** The head office: new orders waiting to be sent to a branch (0 for branch staff / branches off). */
  unassigned: number
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
  branch: BranchRef | null
  /** The head office in dispatch mode, an order without a branch: the nearest active branch to its point (`null`
   *  otherwise, also for an order with a typed address only). */
  suggested_branch: SuggestedBranch | null
}

export interface SuggestedBranch extends BranchRef {
  /** Straight line, rounded to 0.1. */
  distance_km: number
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

export interface OrderDetail extends Omit<OrderSummary, 'lines' | 'suggested_branch'> {
  updated_at: string
  lat: string | number | null
  lng: string | number | null
  comment: string
  created_by: { id: number; name: string } | null
  client: { id: number; first_name: string; last_name: string; phone: string; tg_nick: string } | null
  items: OrderItem[]
  /** When it got its branch. */
  assigned_at: string | null
  /** Who sent it there; `null` — it got it by itself (the only branch, the customer's pickup choice, a branch's sale). */
  assigned_by: { id: number; name: string } | null
  /** The head office with branches on: every active branch, nearest first; `[]` for branch staff / branches off. */
  branch_options: BranchOption[]
}

export interface OrdersQuery {
  status?: string
  source?: string
  /** The head office: a branch id, or `none` — orders without a branch. */
  branch?: string
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
  /** Required for the role `branch` (an active branch); the head office has none. */
  branch_id?: number | null
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
  /** The head office with branches on: the active branches a sale can be for (`[]` otherwise). */
  branches: BranchRef[]
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

/** `POST /sales`. Branch staff always sell for their own branch (`branch_id` is ignored for them). */
export interface SaleCreate extends SaleForm {
  items: CartItem[]
  /** The head office in dispatch mode (2+ active branches): the branch the sale is for — required (`fields.branch_id:
   *  ["required"]`). With one active branch the sale gets it by itself. */
  branch_id?: number | null
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

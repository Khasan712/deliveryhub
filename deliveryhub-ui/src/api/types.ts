// Platform API types — docs/api.md, section "Platform API".

export interface PlatformUser {
  id: number
  phone_number: string
  first_name: string
}

export type BusinessStatus = 'active' | 'suspended'
export type BotRole = 'client' | 'admin'

export interface Bot {
  username: string
  /** The bot service polls this bot right now. */
  alive: boolean
  created_via: 'managed' | 'token'
}

export interface BusinessStats {
  orders_today: number
  revenue_today: number
  orders_total: number
  customers: number
}

export interface BusinessCard {
  slug: string
  name: string
  status: BusinessStatus
  logo: string | null
  brand_color: string
  tagline: string
  created_at: string
  links: { shop: string; admin: string }
  stats: BusinessStats
  bots: Record<BotRole, Bot | null>
}

/** One shift, "HH:MM"; a close that is not after the open is on the next day. */
export interface Shift {
  open: string
  close: string
}

/** docs/api.md → "Working hours" (set by the business in its admin panel; read-only here). */
export interface WorkingHours {
  /** Monday first, null for a day off; null: no hours — the shop takes orders at any time. */
  week: (Shift | null)[] | null
  timezone: string
  open: boolean
  opens_at: string | null
  closes_at: string | null
}

export interface BusinessDetail extends BusinessCard {
  support_phone: string
  /** Where customers pick up their orders; '' and null coordinates until the business is put on the map. */
  address: string
  lat: number | null
  lng: number | null
  working_hours: WorkingHours
  delivery_time: string
  min_order: number
  owner: { name: string; phone: string } | null
  platform_bot: { username: string } | null
  missing_roles: BotRole[]
}

export interface BusinessTotals {
  businesses: number
  active: number
  orders_today: number
  revenue_today: number
}

export interface BusinessList {
  /** PLATFORM_DOMAIN: businesses live at `<slug>.<domain>`. */
  domain?: string
  totals: BusinessTotals
  results: BusinessCard[]
}

export type SlugError = 'slug_invalid' | 'slug_reserved' | 'slug_taken'

export type SlugCheck = { available: true } | { available: false; error: SlugError }

export interface Credentials {
  phone: string
  password: string
}

/** Editable profile fields of a business (create and PATCH). */
export interface BusinessProfileInput {
  name: string
  tagline: string
  support_phone: string
  delivery_time: string
  min_order: number
  brand_color: string
}

/** The place on the map: the shop's pickup address. `lat` and `lng` always go together. */
export interface BusinessLocation {
  address: string
  lat: number
  lng: number
}

/** PATCH body: any profile fields; `logo: null` removes the logo (a new logo goes as a file, multipart). */
export type BusinessProfilePatch = Partial<BusinessProfileInput & BusinessLocation> & { logo?: null }

export interface BusinessCreateInput extends BusinessProfileInput, BusinessLocation {
  slug: string
  owner_name: string
  owner_phone: string
  owner_password: string
}

export interface BusinessCreated {
  business: BusinessDetail
  credentials: Credentials
}

/** A geocoder result (GET /geo/search). */
export interface Place {
  address: string
  lat: number
  lng: number
}

export interface SetupLink {
  url: string
  qr_svg: string
  expires_at: string
}

/** docs/api.md → "Mobile app": the shop our Android/iOS app opens (addresses are absolute). */
export interface AppShop {
  slug: string
  name: string
  tagline: string
  logo: string | null
  brand_color: string
  url: string
}

export interface AppConfig {
  /** null: no business chosen, or it is suspended — the app says the shop is not available. */
  shop: AppShop | null
  /** An installed app older than this asks to be updated from the store. */
  min_version: string
  store: { android: string | null; ios: string | null }
}

export interface MobileApp {
  business: BusinessCard | null
  updated_at: string
  /** Exactly what the app receives now. */
  config: AppConfig
}

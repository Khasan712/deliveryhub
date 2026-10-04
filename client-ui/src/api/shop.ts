/** Shop API endpoints (docs/api.md → "Shop API"). */
import { api } from './client'
import type {
  AuthResult,
  Client,
  NewOrder,
  Order,
  PhoneCodeRequested,
  Place,
  ProfilePatch,
  ShopData,
  TelegramLoginCheck,
  TelegramLoginStarted,
} from './types'

export const getShop = (token: string | null, signal?: AbortSignal) => api<ShopData>('shop', { token, signal })

// --- sign-in ---------------------------------------------------------------------------------
export const signInWithWebApp = (initData: string) =>
  api<AuthResult>('auth/telegram/webapp', { method: 'POST', body: { init_data: initData } })

export const startTelegramLogin = () => api<TelegramLoginStarted>('auth/telegram/start', { method: 'POST' })

export const checkTelegramLogin = (token: string, signal?: AbortSignal) =>
  api<TelegramLoginCheck>('auth/telegram/check', { query: { token }, signal })

export const requestPhoneCode = (phone: string) =>
  api<PhoneCodeRequested>('auth/phone/request', { method: 'POST', body: { phone } })

export const verifyPhoneCode = (phone: string, code: string, lang: string) =>
  api<AuthResult>('auth/phone/verify', { method: 'POST', body: { phone, code, lang } })

// --- profile ---------------------------------------------------------------------------------
export const getMe = (token: string, signal?: AbortSignal) => api<{ client: Client }>('me', { token, signal })

export const updateMe = (token: string, patch: ProfilePatch) =>
  api<{ client: Client }>('me', { method: 'PATCH', token, body: patch })

// --- orders ----------------------------------------------------------------------------------
export const getOrders = (token: string, signal?: AbortSignal) => api<{ orders: Order[] }>('orders', { token, signal })

export const getOrder = (token: string, id: number, signal?: AbortSignal) =>
  api<{ order: Order }>(`orders/${id}`, { token, signal })

export const createOrder = (token: string, body: NewOrder) =>
  api<{ order: Order }>('orders', { method: 'POST', token, body })

// --- map -------------------------------------------------------------------------------------
export const reverseGeocode = (lat: number, lng: number, lang: string, signal?: AbortSignal) =>
  api<{ address: string }>('geo/reverse', { query: { lat, lng, lang }, signal })

export const searchPlaces = (query: string, lang: string, signal?: AbortSignal) =>
  api<{ results: Place[] }>('geo/search', { query: { q: query, lang }, signal })

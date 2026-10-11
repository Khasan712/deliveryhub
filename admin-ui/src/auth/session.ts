import { createContext, use } from 'react'
import { ApiError } from '../api/client'
import { authApi } from '../api/endpoints'
import type { BranchRef, Business, MeResponse, StaffUser } from '../api/types'
import { STORAGE_KEYS, storage } from '../lib/storage'

export type SessionStatus = 'loading' | 'authenticated' | 'anonymous' | 'error'

/** What branches mean for the signed-in staff member (docs/api.md → Branches). */
export interface BranchAccess {
  /** Our panel lets the business have branches. Off: everything as before (branch data is kept but ignored). */
  branchesOn: boolean
  /** The staff of one branch (the role `branch` with branches on): its orders only, the menu read only, no customers. */
  branchStaff: boolean
  /** The head office of a business with branches on (staff without a branch): every order, sends them to branches. */
  headOffice: boolean
  /** The head office while 2+ branches are active: delivery orders wait for it to pick their branch. */
  dispatch: boolean
  /** The branch of a branch staff member (`null` for everyone else). */
  branch: BranchRef | null
}

export function branchAccess(user: StaffUser | null | undefined, business: Business | null | undefined): BranchAccess {
  const branchesOn = !!business?.branches_enabled
  // With branches off a `branch` user acts like a manager.
  const branchStaff = branchesOn && user?.role === 'branch'
  return {
    branchesOn,
    branchStaff,
    headOffice: branchesOn && !branchStaff,
    dispatch: branchesOn && !branchStaff && !!business?.dispatch,
    branch: branchStaff ? (user?.branch ?? null) : null,
  }
}

export interface SessionValue extends BranchAccess {
  status: SessionStatus
  user: StaffUser | null
  business: Business | null
  isAdmin: boolean
  error: unknown
  /** Why the user is signed out: the session expired (a 401 while signed in) or they logged out. */
  signedOut: 'expired' | 'logout' | null
  retry: () => void
  /** Stores the session returned by login / Telegram sign-in (same body as `/auth/me`). */
  signIn: (data: MeResponse) => void
  /** Reloads `/auth/me`. */
  refresh: () => Promise<MeResponse | null>
  logout: () => Promise<void>
}

export const SessionContext = createContext<SessionValue | null>(null)

export function useSession(): SessionValue {
  const value = use(SessionContext)
  if (!value) throw new Error('useSession must be used inside <SessionProvider>')
  return value
}

/** Signed-in user and business (inside protected routes), with what branches mean for them. */
export function useAuthed(): BranchAccess & { user: StaffUser; business: Business; isAdmin: boolean } {
  const { user, business, isAdmin, branchesOn, branchStaff, headOffice, dispatch, branch } = useSession()
  if (!user || !business) throw new Error('useAuthed must be used inside protected routes')
  return { user, business, isAdmin, branchesOn, branchStaff, headOffice, dispatch, branch }
}

/** `GET /auth/me`; `null` when not signed in. */
export async function fetchSession(): Promise<MeResponse | null> {
  try {
    const data = await authApi.me()
    rememberBusiness(data.business)
    return data
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

export type RememberedBusiness = Pick<Business, 'name' | 'logo' | 'brand_color'>

/** The business is remembered so the login page of this host can show its name and logo. */
export function rememberBusiness(business: Business) {
  storage.setJSON(STORAGE_KEYS.business, { name: business.name, logo: business.logo, brand_color: business.brand_color })
}

export function rememberedBusiness(): RememberedBusiness | null {
  const value = storage.getJSON<RememberedBusiness>(STORAGE_KEYS.business)
  return value && typeof value.name === 'string' ? value : null
}

/** Only same-app paths are accepted as a return address (no open redirects). */
export function safeNext(value: string | null | undefined, fallback = '/'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback
  if (value.startsWith('/login') || value.startsWith('/tg')) return fallback
  return value
}

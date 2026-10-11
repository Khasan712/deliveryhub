import type { Branch, Client, DeliveryType, Lang, NewOrder, PaymentMethod } from '../../api/types'
import type { MessageKey } from '../../i18n/messages'
import { isCompleteLocalPhone, localDigits, toE164, toNumber } from '../../lib/format'
import { distanceKm, type Coordinates } from '../../lib/geo'
import { readSession, readStorage, removeSession, writeSession, writeStorage } from '../../lib/storage'
import type { CartLine } from '../../state/cart'

export interface CheckoutForm {
  name: string
  /** Local digits without +998. */
  phone: string
  delivery_type: DeliveryType
  address: string
  lat: number | null
  lng: number | null
  payment_method: PaymentMethod
  comment: string
  /** The branch chosen for pickup (a business with 2+ branches); remembered with the rest of the form. */
  branch_id: number | null
}

export type CheckoutField = 'name' | 'phone' | 'address' | 'branch_id'
export type CheckoutErrors = Partial<Record<CheckoutField, MessageKey>>

export const EMPTY_FORM: CheckoutForm = {
  name: '',
  phone: '',
  delivery_type: 'delivery',
  address: '',
  lat: null,
  lng: null,
  payment_method: 'cash',
  comment: '',
  branch_id: null,
}

const DRAFT_KEY = 'checkout-draft'

function sanitize(raw: unknown): Partial<CheckoutForm> {
  if (!raw || typeof raw !== 'object') return {}
  const value = raw as Record<string, unknown>
  const form: Partial<CheckoutForm> = {}
  if (typeof value.name === 'string') form.name = value.name
  if (typeof value.phone === 'string') form.phone = localDigits(value.phone)
  if (value.delivery_type === 'delivery' || value.delivery_type === 'pickup') form.delivery_type = value.delivery_type
  if (typeof value.address === 'string') form.address = value.address
  if (value.lat !== undefined) form.lat = toNumber(value.lat as string | number | null)
  if (value.lng !== undefined) form.lng = toNumber(value.lng as string | number | null)
  if (value.payment_method === 'cash' || value.payment_method === 'card') form.payment_method = value.payment_method
  if (typeof value.comment === 'string') form.comment = value.comment
  if (value.branch_id === null || (typeof value.branch_id === 'number' && Number.isInteger(value.branch_id))) {
    form.branch_id = value.branch_id
  }
  if ((form.lat !== undefined || form.lng !== undefined) && (form.lat == null || form.lng == null)) {
    form.lat = null
    form.lng = null
  }
  return form
}

/** The draft of this tab, else the contact details of the last order on this device. */
export function initialForm(): CheckoutForm {
  return { ...EMPTY_FORM, ...sanitize(readStorage<unknown>('contact', null)), ...sanitize(readSession<unknown>(DRAFT_KEY, null)) }
}

export function saveDraft(form: CheckoutForm): void {
  writeSession(DRAFT_KEY, form)
}

/** After an order: remember the contact details (not the comment) and forget the draft. */
export function rememberContact(form: CheckoutForm): void {
  const { comment: _comment, ...contact } = form
  writeStorage('contact', contact)
  removeSession(DRAFT_KEY)
}

/**
 * Fills empty fields from the customer's account (name, phone, last delivery address); fields the customer
 * already edited are left alone.
 */
export function fillFromClient(
  form: CheckoutForm,
  client: Client,
  fullName: string,
  touched: ReadonlySet<keyof CheckoutForm> = new Set(),
): CheckoutForm {
  const next = { ...form }
  if (!touched.has('name') && !next.name.trim() && fullName) next.name = fullName
  if (!touched.has('phone') && !next.phone) {
    const digits = localDigits(client.phone)
    if (isCompleteLocalPhone(digits)) next.phone = digits
  }
  if (!touched.has('address') && !touched.has('lat') && !next.address.trim() && next.lat === null) {
    const lat = toNumber(client.lat)
    const lng = toNumber(client.lng)
    if (client.address) next.address = client.address
    if (lat !== null && lng !== null) {
      next.lat = lat
      next.lng = lng
    }
  }
  return next
}

/** A branch to collect a pickup order at, with its straight-line distance from the customer. */
export interface BranchChoice {
  branch: Branch
  /** km from the customer's last known point; null when either point is unknown. */
  km: number | null
  /** The nearest one (marked only when the distances are known). */
  nearest: boolean
}

/** The branches to choose from: the nearest first when the customer's point is known, the others in their order. */
export function branchChoices(branches: readonly Branch[], from: Coordinates | null): BranchChoice[] {
  const measured = branches.map((branch, index) => ({
    branch,
    index,
    km: from && branch.lat !== null && branch.lng !== null ? distanceKm(from, { lat: branch.lat, lng: branch.lng }) : null,
  }))
  measured.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity) || a.index - b.index)
  return measured.map(({ branch, km }, position) => ({
    branch,
    km,
    nearest: position === 0 && km !== null && measured.length > 1,
  }))
}

/**
 * Where a pickup order is collected: the only branch, or the one chosen among 2+ (null until chosen — a choice
 * remembered from before that is no longer among them does not count). Null without branches.
 */
export function pickupBranch(form: CheckoutForm, branches: readonly Branch[]): Branch | null {
  if (branches.length === 1) return branches[0]!
  return branches.find((branch) => branch.id === form.branch_id) ?? null
}

export function validate(form: CheckoutForm, branches: readonly Branch[] = []): CheckoutErrors {
  const errors: CheckoutErrors = {}
  if (!form.name.trim()) errors.name = 'required'
  if (!form.phone) errors.phone = 'required'
  else if (!isCompleteLocalPhone(form.phone)) errors.phone = 'invalidPhone'
  if (form.delivery_type === 'delivery' && !form.address.trim() && form.lat === null) errors.address = 'addressOrLocation'
  if (form.delivery_type === 'pickup' && branches.length > 1 && !pickupBranch(form, branches)) {
    errors.branch_id = 'branchRequired'
  }
  return errors
}

export function orderBody(
  form: CheckoutForm,
  lines: CartLine[],
  lang: Lang,
  platform: NewOrder['platform'],
  branches: readonly Branch[] = [],
): NewOrder {
  const delivery = form.delivery_type === 'delivery'
  // Pickup names its branch — the only one too: should a second one open meanwhile, the order still goes where the
  // customer was told to come. Delivery never does (the business sends it to a branch).
  const branch = delivery ? null : pickupBranch(form, branches)
  return {
    items: lines.map((line) => ({ product_id: line.product.id, quantity: line.qty })),
    name: form.name.trim(),
    phone: toE164(form.phone),
    delivery_type: form.delivery_type,
    address: delivery ? form.address.trim() : '',
    lat: delivery ? form.lat : null,
    lng: delivery ? form.lng : null,
    payment_method: form.payment_method,
    comment: form.comment.trim(),
    platform,
    lang,
    ...(branch ? { branch_id: branch.id } : {}),
  }
}

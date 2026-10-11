/* Branches of the mock API — the rules of the backend (apps/core/branches.py, docs/api.md "Branches"): the nearest
   branch is a straight line on a sphere of 6371 km, rounded to 0.1 km; branches without a distance come after the
   others, by name. Also the mock geocoder of GET /geo/* (a handful of places in Tashkent). */
import type { BranchOption, Place, StaffUser } from '../api/types'
import type { MockBranch, MockOrder } from './data'
import { store } from './data'

const EARTH_RADIUS_KM = 6371

export interface LatLng {
  lat: number
  lng: number
}

export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = (value: number) => (value * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, h)))
}

/** The order's point (the map pick); `null` for a typed address only or a pickup without one. */
export function orderPoint(order: Pick<MockOrder, 'lat' | 'lng'>): LatLng | null {
  if (order.lat === null || order.lng === null || order.lat === '' || order.lng === '') return null
  const point = { lat: Number(order.lat), lng: Number(order.lng) }
  return Number.isFinite(point.lat) && Number.isFinite(point.lng) ? point : null
}

function branchPoint(branch: MockBranch): LatLng | null {
  return branch.lat === null || branch.lng === null ? null : { lat: branch.lat, lng: branch.lng }
}

/** Nearest first; without a distance (no point on either side) after them, by name. */
export function byDistance(point: LatLng | null, branches: MockBranch[]): Array<{ branch: MockBranch; km: number | null }> {
  return branches
    .map((branch) => {
      const where = branchPoint(branch)
      return { branch, km: point && where ? Math.round(distanceKm(point, where) * 10) / 10 : null }
    })
    .sort(
      (a, b) =>
        Number(a.km === null) - Number(b.km === null) ||
        (a.km ?? 0) - (b.km ?? 0) ||
        a.branch.name.localeCompare(b.branch.name) ||
        a.branch.id - b.branch.id,
    )
}

export function nearestBranch(point: LatLng | null, branches: MockBranch[]): { branch: MockBranch; km: number } | null {
  const first = point ? byDistance(point, branches)[0] : undefined
  return first && first.km !== null ? { branch: first.branch, km: first.km } : null
}

// ------------------------------------------------------------------ who sees what
export const branchesOn = () => store.db.business.branches_enabled

/** Active branches, by name. */
export const activeBranches = () =>
  store.db.branches.filter((branch) => branch.is_active).sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id)

/** Two or more active branches: a delivery order waits for the head office. */
export const dispatching = () => branchesOn() && activeBranches().length >= 2

/** With branches off a `branch` user acts like a manager. */
export const isBranchStaff = (user: Pick<StaffUser, 'role'>) => branchesOn() && user.role === 'branch'

export function branchRef(id: number | null): { id: number; name: string } | null {
  const branch = id === null ? undefined : store.db.branches.find((item) => item.id === id)
  return branch ? { id: branch.id, name: branch.name } : null
}

/** OrderDetail.branch_options: the head office with branches on — every active branch, nearest first. */
export function branchOptions(order: MockOrder): BranchOption[] {
  const rows = byDistance(orderPoint(order), activeBranches())
  return rows.map(({ branch, km }, index) => ({
    id: branch.id,
    name: branch.name,
    address: branch.address,
    lat: branch.lat,
    lng: branch.lng,
    distance_km: km,
    nearest: index === 0 && km !== null,
  }))
}

// ------------------------------------------------------------------ the geocoder
export const PLACES: Place[] = [
  { address: "Bunyodkor shoh ko'chasi, 42, Chilonzor tumani, Toshkent", lat: 41.275457, lng: 69.203812 },
  { address: "Chilonzor 9-kvartal, 12-uy, Chilonzor tumani, Toshkent", lat: 41.293, lng: 69.214 },
  { address: "Amir Temur shoh ko'chasi, 107, Yunusobod tumani, Toshkent", lat: 41.36479, lng: 69.28853 },
  { address: "Buyuk Ipak Yo'li ko'chasi, 45, Mirzo Ulug'bek tumani, Toshkent", lat: 41.32623, lng: 69.33487 },
  { address: 'Chorsu bozori, Shayxontohur tumani, Toshkent', lat: 41.3266, lng: 69.2353 },
  { address: 'Mustaqillik maydoni, Toshkent', lat: 41.311081, lng: 69.279737 },
  { address: "Qorasaroy ko'chasi, 102, Olmazor tumani, Toshkent", lat: 41.348, lng: 69.221 },
  { address: "Shota Rustaveli ko'chasi, 12, Yakkasaroy tumani, Toshkent", lat: 41.293, lng: 69.26 },
  { address: 'Sergeli 7-mavze, 3-uy, Sergeli tumani, Toshkent', lat: 41.2264, lng: 69.2197 },
]

/** The address of the nearest known place (within 3 km), or the city. */
export function reverseGeocode(point: LatLng): string {
  const near = PLACES.map((place) => ({ place, km: distanceKm(point, place) })).sort((a, b) => a.km - b.km)[0]
  return near && near.km < 3 ? near.place.address : 'Toshkent'
}

export function searchPlaces(query: string): Place[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return PLACES.filter((place) => words.every((word) => place.address.toLowerCase().includes(word))).slice(0, 5)
}

// ------------------------------------------------------------------ the demo
export const BRANCH_USER_ID = 4
const DAY = 86_400_000
const MINUTE = 60_000

/**
 * Switches branches on in the mock business (dev:mock does it; so do the tests of branches): three branches in
 * Tashkent and a stopped one, Bobur and Jahongir run Chilonzor and Malika Yunusobod, the older orders went to their
 * branches, today's orders fill the branches' «today», and the three newest delivery orders wait for the head office —
 * one with a typed address only.
 */
export function withBranches(db: typeof store.db): typeof store.db {
  const now = Date.now()
  const iso = (time: number) => new Date(Math.min(time, now)).toISOString()
  db.business.branches_enabled = true
  db.branches = [
    {
      id: 1,
      name: 'Chilonzor',
      address: "Bunyodkor shoh ko'chasi, 42, Chilonzor tumani",
      lat: 41.275457,
      lng: 69.203812,
      phone: '+998712001101',
      is_active: true,
      created_at: iso(now - 90 * DAY),
    },
    {
      id: 2,
      name: 'Yunusobod',
      address: "Amir Temur shoh ko'chasi, 107, Yunusobod tumani",
      lat: 41.36479,
      lng: 69.28853,
      phone: '+998712001102',
      is_active: true,
      created_at: iso(now - 80 * DAY),
    },
    {
      id: 3,
      name: "Mirzo Ulug'bek",
      address: "Buyuk Ipak Yo'li ko'chasi, 45, Mirzo Ulug'bek tumani",
      lat: 41.32623,
      lng: 69.33487,
      phone: '',
      is_active: true,
      created_at: iso(now - 40 * DAY),
    },
    {
      id: 4,
      name: 'Sergeli',
      address: 'Sergeli 7-mavze, 3-uy, Sergeli tumani',
      lat: 41.2264,
      lng: 69.2197,
      phone: '+998712001104',
      is_active: false,
      created_at: iso(now - 70 * DAY),
    },
  ]
  const staff = (id: number, phone: string, first: string, last: string, branchId: number, days: number) => ({
    id,
    phone_number: phone,
    first_name: first,
    last_name: last,
    role: 'branch' as const,
    branch_id: branchId,
    is_active: true,
    created_at: iso(now - days * DAY),
  })
  db.users.push(
    staff(BRANCH_USER_ID, '+998901112244', 'Bobur', 'Xolmatov', 1, 25),
    staff(5, '+998935553311', 'Malika', 'Tursunova', 2, 24),
    staff(6, '+998977004455', 'Jahongir', 'Qodirov', 1, 10),
  )
  for (const id of [BRANCH_USER_ID, 5, 6]) db.passwords[id] = 'branch12345'

  const aziz = { id: 1, name: 'Aziz Karimov' }
  const dilnoza = { id: 2, name: 'Dilnoza Rahimova' }
  const active = db.branches.filter((branch) => branch.is_active)

  // The newest eight orders are today's, spread over the hours since midnight.
  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  const span = Math.max(30 * MINUTE, now - midnight.getTime() - MINUTE)
  const today = db.orders.slice(-8)
  today.forEach((order, index) => {
    const created = now - span + Math.round((span * (index + 1)) / 9)
    order.created_at = iso(created)
    order.updated_at = iso(created + 12 * MINUTE)
  })

  const deliver = (order: MockOrder, address: string, lat: number | '', lng: number | '') => {
    Object.assign(order, { delivery_type: 'delivery', address, lat: lat === '' ? '' : lat.toFixed(6), lng: lng === '' ? '' : lng.toFixed(6) })
  }
  const send = (order: MockOrder, branchId: number, by: { id: number; name: string } | null) => {
    order.branch_id = branchId
    order.assigned_at = iso(new Date(order.created_at).getTime() + 4 * MINUTE)
    order.assigned_by = by
  }

  // Older orders: deliveries went to the branch nearest to them, pickups where the customer chose, the oldest ones
  // to Sergeli (stopped since — its history stays).
  db.orders.slice(0, -8).forEach((order, index) => {
    if (index < 6) return send(order, 4, aziz)
    const point = orderPoint(order)
    if (order.delivery_type === 'delivery') {
      return send(order, nearestBranch(point, active)?.branch.id ?? active[order.id % active.length].id, index % 4 ? aziz : dilnoza)
    }
    const chosen = active[order.id % active.length].id
    return send(order, chosen, order.source === 'admin' ? order.created_by : null)
  })

  // Today's: done, on the way, one new for Bobur's Chilonzor, and three waiting to be sent.
  const [a, b, c, d, e, f, g, h] = today
  Object.assign(a, { status: 'completed', delivery_type: 'pickup', address: '', lat: '', lng: '' })
  send(a, 2, null)
  Object.assign(b, { status: 'completed' })
  deliver(b, "Buyuk Ipak Yo'li ko'chasi, 61", 41.3301, 69.3271)
  send(b, 3, aziz)
  Object.assign(c, { status: 'completed' })
  deliver(c, 'Chilonzor 19-kvartal, 7-uy', 41.2712, 69.1932)
  send(c, 1, dilnoza)
  Object.assign(d, { status: 'ordered' })
  deliver(d, "Bunyodkor shoh ko'chasi, 18, 34-xonadon", 41.2833, 69.2087)
  send(d, 1, aziz)
  Object.assign(e, { status: 'on_the_way' })
  deliver(e, "Yunusobod 11-mavze, 5-uy", 41.3712, 69.2954)
  send(e, 2, aziz)
  for (const order of [f, g, h]) {
    Object.assign(order, { status: 'ordered', branch_id: null, assigned_at: null, assigned_by: null })
  }
  deliver(f, 'Yunusobod 4-mavze, 17-uy', 41.3541, 69.2861)
  deliver(g, "Olmazor tumani, Qorasaroy ko'chasi, 102 (mo'ljal: maktab)", '', '')
  deliver(h, 'Chilonzor 9-kvartal, 12-uy', 41.293, 69.214)
  return db
}

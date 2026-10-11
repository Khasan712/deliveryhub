// Maps of the branches: OpenFreeMap tiles (OpenStreetMap data; no key, free for any use), addresses through our API
// (GET /geo/reverse, /geo/search → a Nominatim server). The same as the platform panel's (deliveryhub-ui).

export interface Point {
  lat: number
  lng: number
}

/** A place with a name tag on a map: a branch, or the customer of an order. */
export interface MapPin {
  id: string
  point: Point
  /** The name tag («Chilonzor»). */
  label: string
  /** A second line of the tag («2,1 km»). */
  detail?: string
  /** `nearest` — the suggested branch, `selected` — the chosen one, `muted` — an inactive branch. */
  tone: 'branch' | 'nearest' | 'selected' | 'muted' | 'customer'
  /** The tag hangs below the dot (to keep clear of a tag right above it). */
  tagBelow?: boolean
}

export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
/** Tashkent: where the map opens before a place is chosen. */
export const DEFAULT_CENTER: Point = { lat: 41.311081, lng: 69.279737 }

/** Six decimals: about 10 cm — what the API stores. */
export const round6 = (value: number) => Math.round(value * 1e6) / 1e6

export const formatPoint = ({ lat, lng }: Point) => `${lat.toFixed(6)}, ${lng.toFixed(6)}`

export const yandexMapUrl = ({ lat, lng }: Point) => `https://yandex.uz/maps/?pt=${lng},${lat}&z=17&l=map`

function point(lat: number, lng: number): Point | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  if (lat === 0 && lng === 0) return null
  return { lat: round6(lat), lng: round6(lng) }
}

/** A point from the API (numbers, or the strings of an order's `lat` / `lng`); `null` when there is none. */
export function toPoint(lat: string | number | null | undefined, lng: string | number | null | undefined): Point | null {
  if (lat === null || lat === undefined || lng === null || lng === undefined || lat === '' || lng === '') return null
  return point(Number(lat), Number(lng))
}

/**
 * A point typed or pasted into the search: "41.311081, 69.279737" (latitude first, as Google shows it), or a link
 * of Google Maps (`@41.31,69.27`, `q=41.31,69.27`) or Yandex Maps (`ll=` / `pt=` — longitude first). Null for an
 * address, which goes to the geocoder.
 */
export function parsePoint(text: string): Point | null {
  let value = text.trim()
  try {
    value = decodeURIComponent(value)
  } catch {
    /* not encoded */
  }
  const NUMBER = '(-?\\d{1,3}(?:\\.\\d+)?)'
  const yandex = new RegExp(`[?&](?:ll|pt|whatshere\\[point\\])=${NUMBER},${NUMBER}`).exec(value)
  if (yandex) return point(Number(yandex[2]), Number(yandex[1]))
  const google = new RegExp(`(?:@|[?&](?:q|query|ll)=)${NUMBER},\\s*${NUMBER}`).exec(value)
  if (google) return point(Number(google[1]), Number(google[2]))
  const pair = new RegExp(`^${NUMBER}\\s*[,;\\s]\\s*${NUMBER}$`).exec(value)
  if (pair && pair[1]?.includes('.') && pair[2]?.includes('.')) return point(Number(pair[1]), Number(pair[2]))
  return null
}

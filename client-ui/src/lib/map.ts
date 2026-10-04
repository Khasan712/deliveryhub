// The checkout's map: OpenFreeMap tiles (OpenStreetMap data; no key, free for any use), addresses through
// the Shop API (GET /geo/reverse, /geo/search → a Nominatim server).
import type { ResolvedTheme } from '../state/theme'
import type { Coordinates } from './geo'

export const MAP_STYLES: Record<ResolvedTheme, string> = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
}

/** Tashkent: where the map opens when neither the customer nor the business has a point. */
export const DEFAULT_CENTER: Coordinates = { lat: 41.311081, lng: 69.279737 }

/** Six decimals: about 10 cm — what the API stores. */
export const round6 = (value: number) => Math.round(value * 1e6) / 1e6

export const samePoint = (a: Coordinates | null, b: Coordinates | null) =>
  a !== null && b !== null && a.lat === b.lat && a.lng === b.lng

import { telegram } from './telegram'

export interface Coordinates {
  lat: number
  lng: number
}

const EARTH_RADIUS_KM = 6371

/** The straight-line distance in km (haversine on a sphere of 6371 km — the backend's formula). */
export function distanceKm(a: Coordinates, b: Coordinates): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** 2.14 → "2,1" (tenths with a decimal comma, as both languages write it; never "0,0"). */
export function formatKm(km: number): string {
  return Math.max(0.1, Math.round(km * 10) / 10)
    .toFixed(1)
    .replace('.', ',')
}

export type LocationErrorCode = 'unsupported' | 'denied' | 'unavailable'

export class LocationError extends Error {
  readonly code: LocationErrorCode
  /** Telegram already asked once and the user said no — only the settings screen can help now. */
  readonly canOpenSettings: boolean

  constructor(code: LocationErrorCode, canOpenSettings = false) {
    super(code)
    this.code = code
    this.canOpenSettings = canOpenSettings
  }
}

function browserLocation(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new LocationError('unsupported'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      (error) => reject(new LocationError(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable')),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    )
  })
}

/**
 * The customer's location: Telegram's LocationManager inside Telegram (Bot API 8.0+), the browser's
 * geolocation everywhere else (and in older Telegram clients).
 */
export function currentLocation(): Promise<Coordinates> {
  const webApp = telegram()
  let manager = webApp?.LocationManager
  try {
    if (manager && !webApp?.isVersionAtLeast('8.0')) manager = undefined
  } catch {
    manager = undefined
  }
  if (!manager) return browserLocation()
  const locationManager = manager

  return new Promise((resolve, reject) => {
    const ask = () => {
      if (!locationManager.isLocationAvailable) {
        browserLocation().then(resolve, reject)
        return
      }
      locationManager.getLocation((data) => {
        if (data) resolve({ lat: data.latitude, lng: data.longitude })
        else reject(new LocationError('denied', locationManager.isAccessRequested && !locationManager.isAccessGranted))
      })
    }
    if (locationManager.isInited) ask()
    else locationManager.init(ask)
  })
}

export function openLocationSettings(): void {
  try {
    telegram()?.LocationManager?.openSettings()
  } catch {
    /* unsupported */
  }
}

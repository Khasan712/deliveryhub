import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import type { Coordinates } from '../../lib/geo'
import { MAP_STYLES, round6 } from '../../lib/map'
import type { ResolvedTheme } from '../../state/theme'

// The map itself (MapLibre GL, WebGL2): its own chunk, loaded when the map sheet opens (React.lazy).
// Tests replace this module (jsdom has no WebGL).

// MapLibre reads the tiles in a worker of its own; inside a bundle it cannot find the worker's file by itself.
maplibregl.setWorkerUrl(workerUrl)

/** The map, or null on a device without WebGL2 (an old browser, a blocked GPU). */
function createMap(options: maplibregl.MapOptions): maplibregl.Map | null {
  try {
    return new maplibregl.Map(options)
  } catch (error) {
    if (error instanceof maplibregl.GPUInitializationError) return null
    throw error
  }
}

export interface MapCanvasProps {
  /** Where the map opens. */
  center: Coordinates
  zoom: number
  theme: ResolvedTheme
  /** The map's own controls in the customer's language (MapLibre locale keys). */
  locale: Record<string, string>
  label: string
  /** The map started moving (the pin lifts). */
  onMoveStart: () => void
  /** The map stopped: its centre is the chosen point. */
  onMoveEnd: (center: Coordinates) => void
  /** Fly here — a search result, the customer's location; a new key starts a new flight. */
  target: { point: Coordinates; key: number } | null
  /** No WebGL2 on this device: the sheet says so. */
  unsupported: ReactNode
}

export default function MapCanvas({ center, zoom, theme, locale, label, onMoveStart, onMoveEnd, target, unsupported }: MapCanvasProps) {
  const container = useRef<HTMLElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [supported, setSupported] = useState(true)
  const start = useRef({ center, zoom, locale })
  const appliedTheme = useRef(theme)

  const moveStart = useEffectEvent(() => onMoveStart())
  const moveEnd = useEffectEvent((instance: maplibregl.Map) => {
    const { lat, lng } = instance.getCenter()
    onMoveEnd({ lat: round6(lat), lng: round6(lng) })
  })

  useEffect(() => {
    if (!supported || !container.current) return undefined
    const { center: first, zoom: firstZoom, locale: firstLocale } = start.current
    const instance = createMap({
      container: container.current,
      style: MAP_STYLES[appliedTheme.current],
      center: [first.lng, first.lat],
      zoom: firstZoom,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: false,
      locale: firstLocale,
    })
    if (!instance) {
      setSupported(false)
      return undefined
    }
    instance.touchZoomRotate.disableRotation()
    instance.keyboard.disableRotation()
    instance.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left')
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    instance.on('movestart', () => moveStart())
    instance.on('moveend', () => moveEnd(instance))
    map.current = instance
    return () => {
      instance.remove()
      map.current = null
    }
  }, [supported])

  // The theme follows the app (and Telegram) while the sheet is open.
  useEffect(() => {
    if (theme === appliedTheme.current) return
    appliedTheme.current = theme
    map.current?.setStyle(MAP_STYLES[theme])
  }, [theme])

  useEffect(() => {
    const instance = map.current
    if (!target || !instance) return
    instance.flyTo({ center: [target.point.lng, target.point.lat], zoom: Math.max(instance.getZoom(), 16.5), essential: true })
  }, [target])

  if (!supported) return <>{unsupported}</>
  return <section ref={container} aria-label={label} className="size-full" />
}

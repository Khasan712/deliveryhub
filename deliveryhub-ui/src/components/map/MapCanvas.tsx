import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { DEFAULT_CENTER, MAP_STYLE, round6, type Point } from '../../lib/map'

// The map itself (MapLibre GL, WebGL): loaded only where a map is shown (React.lazy). Tests replace this module.

/** The map's own controls, in Uzbek. */
const LOCALE = {
  'Map.Title': 'Xarita',
  'Marker.Title': 'Biznes joyi',
  'NavigationControl.ZoomIn': 'Yaqinlashtirish',
  'NavigationControl.ZoomOut': 'Uzoqlashtirish',
  'NavigationControl.ResetBearing': 'Shimolga qaratish',
  'AttributionControl.ToggleAttribution': 'Xarita manbalari',
  'CooperativeGesturesHandler.WindowsHelpText': 'Kattalashtirish: Ctrl + sichqoncha g‘ildiragi',
  'CooperativeGesturesHandler.MacHelpText': 'Kattalashtirish: ⌘ + sichqoncha g‘ildiragi',
  'CooperativeGesturesHandler.MobileHelpText': 'Xaritani ikki barmoq bilan suring',
}
const PIN_COLOR = '#4f46e5'

function webglSupported() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

export interface MapCanvasProps {
  point: Point | null
  /** A click on the map or a dragged pin. */
  onPick: (point: Point) => void
  /** Changes when the map should fly to `point` (a search result, a pasted point). */
  focusKey: number
  label: string
}

export default function MapCanvas({ point, onPick, focusKey, label }: MapCanvasProps) {
  const container = useRef<HTMLElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const pin = useRef<maplibregl.Marker | null>(null)
  const [supported] = useState(webglSupported)
  const start = useRef(point)

  const pick = useEffectEvent((lngLat: maplibregl.LngLat) => onPick({ lat: round6(lngLat.lat), lng: round6(lngLat.lng) }))
  const flyToPoint = useEffectEvent(() => {
    if (point && map.current) map.current.flyTo({ center: [point.lng, point.lat], zoom: Math.max(map.current.getZoom(), 16) })
  })

  useEffect(() => {
    if (!supported || !container.current) return undefined
    const center = start.current ?? DEFAULT_CENTER
    const instance = new maplibregl.Map({
      container: container.current,
      style: MAP_STYLE,
      center: [center.lng, center.lat],
      zoom: start.current ? 16 : 11,
      // The page scrolls past the map; Ctrl/⌘ + wheel (two fingers on a phone) moves it.
      cooperativeGestures: true,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: { compact: true },
      locale: LOCALE,
    })
    instance.touchZoomRotate.disableRotation()
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    instance.on('click', (event) => pick(event.lngLat))
    map.current = instance
    return () => {
      instance.remove()
      map.current = null
      pin.current = null
    }
  }, [supported])

  useEffect(() => {
    const instance = map.current
    if (!instance) return
    if (!point) {
      pin.current?.remove()
      pin.current = null
      return
    }
    if (!pin.current) {
      const marker = new maplibregl.Marker({ color: PIN_COLOR, draggable: true })
      marker.on('dragend', () => pick(marker.getLngLat()))
      pin.current = marker
    }
    pin.current.setLngLat([point.lng, point.lat]).addTo(instance)
  }, [point])

  useEffect(() => {
    if (focusKey) flyToPoint()
  }, [focusKey])

  if (!supported) {
    return (
      <div className="grid size-full place-items-center bg-slate-100 p-6 text-center text-sm text-slate-500">
        Bu brauzerda xarita ochilmadi. Manzilni qidiring yoki koordinatalarni kiriting.
      </div>
    )
  }
  return <section ref={container} aria-label={label} className="size-full" />
}

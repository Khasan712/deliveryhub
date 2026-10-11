import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { DictKey } from '../../i18n/dict'
import { translate, type Lang } from '../../i18n/translate'
import { DEFAULT_CENTER, MAP_STYLE, round6, type MapPin, type Point } from '../../lib/map'
import './map.css'

// The map itself (MapLibre GL, WebGL2): loaded only where a map is shown (React.lazy, see MapView). Tests replace this
// module (src/test/fakeMap.tsx).

// MapLibre reads the tiles in a worker of its own; inside a bundle it cannot find the worker's file by itself.
maplibregl.setWorkerUrl(workerUrl)

/** The map's own controls in the interface language. */
const LOCALE: Record<string, DictKey> = {
  'Map.Title': 'map_title',
  'Marker.Title': 'map_marker',
  'NavigationControl.ZoomIn': 'map_zoom_in',
  'NavigationControl.ZoomOut': 'map_zoom_out',
  'AttributionControl.ToggleAttribution': 'map_sources',
  'CooperativeGesturesHandler.WindowsHelpText': 'map_gesture_windows',
  'CooperativeGesturesHandler.MacHelpText': 'map_gesture_mac',
  'CooperativeGesturesHandler.MobileHelpText': 'map_gesture_mobile',
}
const PIN_COLOR = '#ec5b0b'
const LINE_SOURCE = 'dh-line'

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
  /** The map's accessible name. */
  label: string
  lang: Lang
  /** Places with a name tag: the branches, the customer of an order. */
  pins?: MapPin[]
  /** Picking a place: the chosen point (a pin that can be dragged). */
  point?: Point | null
  /** Picking a place: a click on the map or a dragged pin. */
  onPick?: (point: Point) => void
  /** A click on one of `pins` (choosing a branch). */
  onPinClick?: (id: string) => void
  /** A dashed straight line: the customer → the chosen branch. */
  line?: [Point, Point] | null
  /** Changes when the map should fly to `point` (a search result, a pasted point). */
  focusKey?: number
}

function pinElement(pin: MapPin, onClick?: (id: string) => void): HTMLElement {
  const clickable = !!onClick && pin.tone !== 'customer'
  const root = document.createElement('div')
  root.className = ['dh-pin', `dh-pin--${pin.tone}`, pin.tagBelow && 'dh-pin--below', clickable && 'dh-pin--clickable']
    .filter(Boolean)
    .join(' ')
  // A picture with its name for screen readers (MapLibre leaves the role and the name of a custom marker to us);
  // choosing a branch by keyboard is the list next to the map.
  root.setAttribute('role', 'img')
  root.setAttribute('aria-label', pin.detail ? `${pin.label}, ${pin.detail}` : pin.label)
  const tag = document.createElement('div')
  tag.className = 'dh-pin__tag'
  const name = document.createElement('span')
  name.className = 'dh-pin__name'
  name.textContent = pin.label
  tag.append(name)
  if (pin.detail) {
    const detail = document.createElement('span')
    detail.className = 'dh-pin__detail'
    detail.textContent = pin.detail
    tag.append(detail)
  }
  const dot = document.createElement('div')
  dot.className = 'dh-pin__dot'
  root.append(tag, dot)
  if (onClick && clickable) {
    root.addEventListener('click', (event) => {
      event.stopPropagation()
      onClick(pin.id)
    })
  }
  return root
}

/** The places to keep in view: changes only when a place moves or comes and goes (not when one is chosen). */
function placesKey(pins: MapPin[]): string {
  return pins.map((pin) => `${pin.id}:${pin.point.lat},${pin.point.lng}`).join('|')
}

export default function MapCanvas({
  label,
  lang,
  pins = [],
  point = null,
  onPick,
  onPinClick,
  line = null,
  focusKey = 0,
}: MapCanvasProps) {
  const container = useRef<HTMLElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const pin = useRef<maplibregl.Marker | null>(null)
  const markers = useRef<maplibregl.Marker[]>([])
  const [loaded, setLoaded] = useState(false)
  const [supported, setSupported] = useState(true)
  // Where the map opens and the language of its controls (it is not rebuilt when they change).
  const start = useRef({ point, pins, lang })
  // A place has been picked on this map (a click or a dragged pin).
  const touched = useRef(false)
  const picking = Boolean(onPick)
  const clickable = Boolean(onPinClick)

  const pick = useEffectEvent((lngLat: maplibregl.LngLat) => {
    touched.current = true
    onPick?.({ lat: round6(lngLat.lat), lng: round6(lngLat.lng) })
  })
  const clickPin = useEffectEvent((id: string) => onPinClick?.(id))
  const flyToPoint = useEffectEvent(() => {
    if (!point || !map.current) return
    map.current.flyTo({ center: [point.lng, point.lat], zoom: Math.max(map.current.getZoom(), 16) })
  })
  // A form may give its point a moment after the map opened (its data is copied in after the first render): the map
  // then shows it as if it had opened there — not when the place was picked on the map or a search flies to it.
  const showLatePoint = useEffectEvent((late: Point) => {
    if (start.current.point || touched.current || focusKey || !map.current) return
    start.current.point = late
    map.current.jumpTo({ center: [late.lng, late.lat], zoom: 16 })
  })
  const fitPlaces = useEffectEvent(() => {
    const instance = map.current
    if (!instance) return
    const places = pins.map((item) => item.point)
    if (places.length === 0) return
    if (places.length === 1) {
      instance.jumpTo({ center: [places[0].lng, places[0].lat], zoom: 13 })
      return
    }
    const bounds = new maplibregl.LngLatBounds()
    for (const place of places) bounds.extend([place.lng, place.lat])
    // Room for the name tags around the pins (a tag hanging below needs it at the bottom too) and the attribution.
    const bottom = pins.some((item) => item.tagBelow) ? 96 : 48
    instance.fitBounds(bounds, { padding: { top: 60, bottom, left: 56, right: 56 }, maxZoom: 15, duration: 0 })
  })

  useEffect(() => {
    if (!supported || !container.current) return undefined
    const center = start.current.point ?? start.current.pins[0]?.point ?? DEFAULT_CENTER
    const instance = createMap({
      container: container.current,
      style: MAP_STYLE,
      center: [center.lng, center.lat],
      zoom: start.current.point ? 16 : 11,
      // The page scrolls past the map; Ctrl/⌘ + wheel (two fingers on a phone) moves it.
      cooperativeGestures: true,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: { compact: true },
      locale: Object.fromEntries(Object.entries(LOCALE).map(([key, text]) => [key, translate(start.current.lang, text)])),
    })
    if (!instance) {
      setSupported(false)
      return undefined
    }
    instance.touchZoomRotate.disableRotation()
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    instance.on('click', (event) => pick(event.lngLat))
    instance.on('load', () => setLoaded(true))
    map.current = instance
    return () => {
      instance.remove()
      map.current = null
      pin.current = null
      markers.current = []
    }
  }, [supported])

  // The chosen point of a picker: one pin that can be dragged.
  useEffect(() => {
    const instance = map.current
    if (!instance || !picking) return
    if (!point) {
      pin.current?.remove()
      pin.current = null
      return
    }
    // On the map once: adding it again takes it out of the page, and a pin moved with the arrow keys loses the focus.
    if (pin.current) {
      pin.current.setLngLat([point.lng, point.lat])
      return
    }
    const marker = new maplibregl.Marker({ color: PIN_COLOR, draggable: true })
    marker.on('dragend', () => pick(marker.getLngLat()))
    pin.current = marker.setLngLat([point.lng, point.lat]).addTo(instance)
    showLatePoint(point)
  }, [point, picking, supported])

  // The places with a name tag; the chosen / nearest ones are drawn above the others.
  useEffect(() => {
    const instance = map.current
    if (!instance) return
    for (const marker of markers.current) marker.remove()
    const order = { muted: 0, branch: 1, customer: 2, nearest: 3, selected: 4 }
    markers.current = [...pins]
      .sort((a, b) => order[a.tone] - order[b.tone])
      .map((item) => {
        // The dot's centre on the place itself (map.css: the dots are 14, 16 and 18 px).
        const radius = item.tone === 'selected' ? 9 : item.tone === 'customer' ? 8 : 7
        return new maplibregl.Marker({
          element: pinElement(item, clickable ? clickPin : undefined),
          anchor: item.tagBelow ? 'top' : 'bottom',
          offset: [0, item.tagBelow ? -radius : radius],
        })
          .setLngLat([item.point.lng, item.point.lat])
          .addTo(instance)
      })
  }, [pins, clickable, supported])

  const places = placesKey(pins)
  useEffect(() => {
    if (!picking) fitPlaces()
  }, [places, picking, supported])

  // The straight line from the customer to the chosen branch.
  useEffect(() => {
    const instance = map.current
    if (!instance || !loaded) return
    const data: Parameters<maplibregl.GeoJSONSource['setData']>[0] = {
      type: 'FeatureCollection',
      features: line
        ? [
            {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: line.map((place) => [place.lng, place.lat]) },
            },
          ]
        : [],
    }
    const source = instance.getSource(LINE_SOURCE) as maplibregl.GeoJSONSource | undefined
    if (source) {
      source.setData(data)
      return
    }
    instance.addSource(LINE_SOURCE, { type: 'geojson', data })
    instance.addLayer({
      id: LINE_SOURCE,
      type: 'line',
      source: LINE_SOURCE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#d2450d', 'line-width': 3, 'line-dasharray': [1.5, 1.5], 'line-opacity': 0.85 },
    })
  }, [line, loaded])

  useEffect(() => {
    if (focusKey) flyToPoint()
  }, [focusKey])

  if (!supported) {
    return <div className="grid size-full place-items-center bg-subtle p-6 text-center text-sm text-muted">{translate(lang, 'map_unsupported')}</div>
  }
  return <section ref={container} aria-label={label} className="size-full" />
}

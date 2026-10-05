import { lazy, Suspense, useEffect, useEffectEvent, useRef, useState, type FormEvent } from 'react'
import { reverseGeocode, searchPlaces } from '../../api/shop'
import type { Place } from '../../api/types'
import { Button } from '../../components/Button'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { Icon } from '../../components/Icon'
import { Sheet, SheetGrabber, SheetHeader } from '../../components/Sheet'
import { useI18n } from '../../i18n/i18n'
import { cn } from '../../lib/cn'
import { currentLocation, LocationError, openLocationSettings, type Coordinates } from '../../lib/geo'
import { DEFAULT_CENTER, round6, samePoint } from '../../lib/map'
import { haptic, isTelegram } from '../../lib/telegram'
import { MAIN_BUTTON_SHEET, useMainButton } from '../../lib/useTelegram'
import { useCatalog } from '../../state/catalog'
import { useTheme } from '../../state/theme'
import { useToast } from '../../state/toast'

const MapCanvas = lazy(() => import('../../components/map/MapCanvas'))

/** The address is asked for once the map has been still for a moment (a burst of small moves asks once). */
const LOOKUP_DELAY_MS = 400

type Lookup = { status: 'loading' } | { status: 'done'; address: string } | { status: 'failed' }
type Search = { status: 'idle' } | { status: 'searching' } | { status: 'done'; results: Place[] } | { status: 'failed' }

interface MapSheetProps {
  open: boolean
  /** The point chosen before, if any: the map opens there. */
  value: Coordinates | null
  onClose: () => void
  /** The centre of the map and its address ('' when the map knows none). */
  onPick: (point: Coordinates, address: string) => void
}

/** Full screen on phones: the pin stays in the middle and the map moves under it, like in taxi apps. */
export function MapSheet({ open, value, onClose, onPick }: MapSheetProps) {
  const { t } = useI18n()
  return (
    <Sheet open={open} onClose={onClose} wide className="sheet-map">
      <SheetGrabber />
      <SheetHeader title={t('mapTitle')} className="pb-3" />
      {open && <MapPicker value={value} onPick={onPick} />}
    </Sheet>
  )
}

function MapPicker({ value, onPick }: Pick<MapSheetProps, 'value' | 'onPick'>) {
  const { t, lang } = useI18n()
  const { business } = useCatalog()
  const { resolved: theme } = useTheme()
  const toast = useToast()
  const inTelegram = isTelegram()

  const [start] = useState(() => {
    if (value) return { center: value, zoom: 17 }
    if (business?.lat != null && business.lng != null) return { center: { lat: business.lat, lng: business.lng }, zoom: 13 }
    return { center: DEFAULT_CENTER, zoom: 12 }
  })
  const [center, setCenter] = useState(start.center)
  const [moving, setMoving] = useState(false)
  const [lookup, setLookup] = useState<Lookup>({ status: 'loading' })
  const [target, setTarget] = useState<{ point: Coordinates; key: number } | null>(null)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState<Search>({ status: 'idle' })
  const [locating, setLocating] = useState(false)
  const searchInput = useRef<HTMLInputElement>(null)
  // A search result names its own address: no need to ask for it when the map lands there.
  const known = useRef<Place | null>(null)
  const pending = useRef<{ timer: number; controller: AbortController } | null>(null)

  const cancelLookup = () => {
    if (!pending.current) return
    window.clearTimeout(pending.current.timer)
    pending.current.controller.abort()
    pending.current = null
  }

  const describe = (point: Coordinates) => {
    cancelLookup()
    if (known.current && samePoint(known.current, point)) {
      setLookup({ status: 'done', address: known.current.address })
      return
    }
    setLookup({ status: 'loading' })
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      reverseGeocode(point.lat, point.lng, lang, controller.signal)
        .then(({ address }) => setLookup({ status: 'done', address }))
        .catch(() => {
          if (!controller.signal.aborted) setLookup({ status: 'failed' })
        })
    }, LOOKUP_DELAY_MS)
    pending.current = { timer, controller }
  }

  // The address of the opening point; nothing left running once the sheet closes.
  const describeStart = useEffectEvent(() => describe(start.center))
  const stopLookup = useEffectEvent(() => cancelLookup())
  useEffect(() => {
    describeStart()
    return () => stopLookup()
  }, [])

  const flyTo = (point: Coordinates) => setTarget((current) => ({ point, key: (current?.key ?? 0) + 1 }))

  const confirm = () => {
    if (moving) return
    haptic('success')
    onPick(center, lookup.status === 'done' ? lookup.address : '')
  }

  useMainButton({ text: t('pickThisPlace'), onClick: confirm, disabled: moving }, MAIN_BUTTON_SHEET)

  const locate = async () => {
    setLocating(true)
    try {
      const { lat, lng } = await currentLocation()
      known.current = null
      flyTo({ lat: round6(lat), lng: round6(lng) })
      haptic('light')
    } catch (caught) {
      const denied = caught instanceof LocationError && caught.code === 'denied'
      haptic('error')
      toast(t(denied ? 'locationDenied' : 'locationFailed'), {
        type: 'error',
        action:
          caught instanceof LocationError && caught.canOpenSettings
            ? { label: t('openSettings'), onClick: openLocationSettings }
            : undefined,
      })
    } finally {
      setLocating(false)
    }
  }

  const runSearch = async (event: FormEvent) => {
    event.preventDefault()
    const text = query.trim()
    if (text.length < 2) return
    setSearch({ status: 'searching' })
    try {
      const { results } = await searchPlaces(text, lang)
      setSearch({ status: 'done', results })
    } catch {
      setSearch({ status: 'failed' })
    }
  }

  const choose = (place: Place) => {
    known.current = place
    setSearch({ status: 'idle' })
    searchInput.current?.blur() // phones: the keyboard goes away and the map shows whole
    flyTo({ lat: place.lat, lng: place.lng })
  }

  const locale = {
    'Map.Title': t('mapLabel'),
    'NavigationControl.ZoomIn': t('mapZoomIn'),
    'NavigationControl.ZoomOut': t('mapZoomOut'),
    'AttributionControl.ToggleAttribution': t('mapSources'),
  }

  return (
    <>
      <div className="relative z-[2] shrink-0 px-4 pb-3 sm:px-5">
        <form role="search" onSubmit={runSearch} className="flex gap-2">
          <label htmlFor="map-search" className="sr-only">
            {t('mapSearch')}
          </label>
          <input
            ref={searchInput}
            id="map-search"
            type="search"
            enterKeyHint="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              if (search.status !== 'searching') setSearch({ status: 'idle' })
            }}
            placeholder={t('mapSearch')}
            autoComplete="off"
            className="h-11 min-w-0 flex-1 rounded-[14px] border border-line bg-surface-2 px-3.5 text-[15px] font-semibold outline-none placeholder:font-medium placeholder:text-muted focus:border-brand-text"
          />
          <button
            type="submit"
            aria-label={t('mapSearchButton')}
            disabled={search.status === 'searching'}
            className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-surface-2 text-ink-2 transition-colors hover:bg-surface-3 disabled:opacity-60"
          >
            {search.status === 'searching' ? (
              <span className="spinner size-4! border-2!" aria-hidden="true" />
            ) : (
              <Icon name="search" className="size-5" />
            )}
          </button>
        </form>
        {search.status === 'done' && search.results.length > 0 && (
          <ul
            aria-label={t('mapSearchResults')}
            className="absolute inset-x-4 top-[calc(100%-4px)] max-h-[50vh] animate-pop-in overflow-y-auto rounded-2xl border border-line bg-surface py-1 shadow-card sm:inset-x-5"
          >
            {search.results.map((place) => (
              <li key={`${place.lat},${place.lng}`}>
                <button
                  type="button"
                  onClick={() => choose(place)}
                  className="flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left text-[14px] font-bold hover:bg-surface-2"
                >
                  <Icon name="pin" className="mt-0.5 size-4 shrink-0 text-muted" />
                  {place.address}
                </button>
              </li>
            ))}
          </ul>
        )}
        {(search.status === 'failed' || (search.status === 'done' && search.results.length === 0)) && (
          <p role="status" className="mt-2 text-[13px] font-bold text-muted">
            {t(search.status === 'failed' ? 'mapSearchFailed' : 'mapNothingFound')}
          </p>
        )}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-surface-2">
        <ErrorBoundary
          fallback={
            <div className="grid size-full place-items-center p-8 text-center">
              <div>
                <p className="text-[15px] font-bold text-muted">{t('mapLoadFailed')}</p>
                <Button variant="dark" size="md" icon="refresh" className="mt-4" onClick={() => window.location.reload()}>
                  {t('retry')}
                </Button>
              </div>
            </div>
          }
        >
        <Suspense
          fallback={
            <div className="grid size-full place-items-center">
              <span className="spinner size-7!" aria-hidden="true" />
            </div>
          }
        >
          <MapCanvas
            center={start.center}
            zoom={start.zoom}
            theme={theme}
            locale={locale}
            label={t('mapLabel')}
            target={target}
            onMoveStart={() => setMoving(true)}
            onMoveEnd={(point) => {
              setMoving(false)
              // A resize (the keyboard, a rotated phone) ends a "move" at the same centre: its address is known.
              if (samePoint(point, center) && lookup.status !== 'loading') return
              setCenter(point)
              describe(point)
            }}
            unsupported={
              <p className="grid size-full place-items-center p-8 text-center text-[15px] font-bold text-muted">
                {t('mapUnavailable')}
              </p>
            }
          />
        </Suspense>
        </ErrorBoundary>
        <CenterPin lifted={moving} />
        <button
          type="button"
          onClick={locate}
          disabled={locating}
          aria-label={t('myLocation')}
          title={t('myLocation')}
          className="absolute right-3 bottom-10 z-[1] grid size-12 place-items-center rounded-full bg-surface text-brand-text shadow-card transition-transform active:scale-95 disabled:opacity-70"
        >
          {locating ? <span className="spinner size-5! border-2!" aria-hidden="true" /> : <Icon name="locate" className="size-[22px]" />}
        </button>
      </div>

      <div className="shrink-0 border-t border-line bg-surface px-4 pt-3 pb-4 sm:px-5">
        <p aria-live="polite" className="flex min-h-11 items-start gap-2.5 text-[15px] leading-snug font-extrabold">
          <Icon name="pin" className="mt-0.5 size-5 shrink-0 text-brand-text" />
          <span className={cn('min-w-0', (moving || lookup.status !== 'done' || !lookup.address) && 'font-bold text-muted')}>
            {moving
              ? t('mapMoveHint')
              : lookup.status === 'loading'
                ? t('findingAddress')
                : lookup.status === 'done' && lookup.address
                  ? lookup.address
                  : t('noAddressHere')}
          </span>
        </p>
        {!inTelegram && (
          <Button block onClick={confirm} disabled={moving} className="mt-3">
            {t('pickThisPlace')}
          </Button>
        )}
      </div>
    </>
  )
}

/** The pin in the middle of the map; it lifts while the map moves under it. */
function CenterPin({ lifted }: { lifted: boolean }) {
  return (
    <div className="pointer-events-none absolute top-1/2 left-1/2 z-[1]" aria-hidden="true">
      <span
        className={cn(
          'absolute h-1.5 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/35 transition-[scale,opacity] duration-200',
          lifted && 'scale-75 opacity-50',
        )}
      />
      <svg
        viewBox="0 0 32 44"
        className={cn(
          'absolute h-11 w-8 -translate-x-1/2 drop-shadow-md transition-transform duration-200 ease-out',
          lifted ? '-translate-y-[calc(100%+12px)]' : '-translate-y-full',
        )}
      >
        <path
          d="M16 1C7.7 1 1 7.6 1 15.8 1 26.9 16 43 16 43s15-16.1 15-27.2C31 7.6 24.3 1 16 1z"
          fill="var(--brand-fill)"
          stroke="var(--surface)"
          strokeWidth="2"
        />
        <circle cx="16" cy="15.5" r="5.5" fill="var(--surface)" />
      </svg>
    </div>
  )
}

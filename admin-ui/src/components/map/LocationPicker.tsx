import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { isApiError } from '../../api/client'
import { geoApi } from '../../api/endpoints'
import { errorMessage } from '../../api/errors'
import type { Place } from '../../api/types'
import { useI18n } from '../../i18n/context'
import { formatPoint, parsePoint, yandexMapUrl, type MapPin, type Point } from '../../lib/map'
import { IconAlert, IconExternal, IconMapPin, IconSearch } from '../icons'
import { Button } from '../ui/Button'
import { Input } from '../ui/Form'
import { Spinner } from '../ui/Spinner'
import { MapView } from './MapView'

type Search =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'done'; results: Place[] }
  | { status: 'failed'; message: string }

export interface LocationPickerProps {
  /** Id of the search box (the form focuses it when the point is missing). */
  id: string
  point: Point | null
  onPointChange: (point: Point) => void
  /** The address field of the form: a chosen point fills it in, unless it was typed by hand. */
  address: string
  onAddressChange: (address: string) => void
  /** Other places to show for orientation (the other branches). */
  pins?: MapPin[]
  error?: string
}

/**
 * A place on the map — the platform panel's picker (deliveryhub-ui) in this panel's look: a search (an address,
 * coordinates or a Yandex / Google Maps link), the map — a click or a dragged pin — and a line saying what is chosen.
 */
export function LocationPicker({ id, point, onPointChange, address, onAddressChange, pins, error }: LocationPickerProps) {
  const { t, lang } = useI18n()
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState<Search>({ status: 'idle' })
  const [focusKey, setFocusKey] = useState(0)
  const [lookingUp, setLookingUp] = useState(false)
  const lookup = useRef<AbortController | null>(null)
  // The address as it is now (answers arrive later) and the last one filled in for the user.
  const current = useRef(address)
  const filled = useRef('')
  useEffect(() => {
    current.current = address
  }, [address])
  useEffect(() => () => lookup.current?.abort(), [])

  const suggest = (text: string) => {
    if (!text || (current.current.trim() !== '' && current.current !== filled.current)) return
    filled.current = text
    onAddressChange(text)
  }

  const choose = (next: Point, { known, fly = false }: { known?: string; fly?: boolean } = {}) => {
    onPointChange(next)
    if (fly) setFocusKey((key) => key + 1)
    lookup.current?.abort()
    lookup.current = null
    if (known !== undefined) {
      setLookingUp(false)
      suggest(known)
      return
    }
    const controller = new AbortController()
    lookup.current = controller
    setLookingUp(true)
    geoApi
      .reverse(next.lat, next.lng, lang, controller.signal)
      .then((found) => suggest(found.address))
      .catch(() => undefined) // no address: it is typed by hand
      .finally(() => {
        if (lookup.current !== controller) return
        lookup.current = null
        setLookingUp(false)
      })
  }

  const runSearch = async () => {
    const text = query.trim()
    if (text.length < 2) return
    const pasted = parsePoint(text)
    if (pasted) {
      setSearch({ status: 'idle' })
      choose(pasted, { fly: true })
      return
    }
    setSearch({ status: 'searching' })
    try {
      const { results } = await geoApi.search(text, lang)
      setSearch({ status: 'done', results })
    } catch (caught) {
      const message = isApiError(caught, 'geocoder_unavailable') ? t('map_geocoder_off') : errorMessage(caught, t)
      setSearch({ status: 'failed', message })
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault() // the picker lives inside a form: Enter searches, it does not submit
    void runSearch()
  }

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-fg-soft">
          {t('map_search')}
        </label>
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <Input
              id={id}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t('map_search_placeholder')}
              autoComplete="off"
              aria-describedby={error ? `${id}-hint ${id}-error` : `${id}-hint`}
              aria-invalid={error ? true : undefined}
              leading={<IconSearch size={18} />}
            />
          </div>
          <Button variant="secondary" onClick={() => void runSearch()} loading={search.status === 'searching'}>
            {t('map_find')}
          </Button>
        </div>
        <p id={`${id}-hint`} className="mt-1.5 text-xs leading-relaxed text-muted">
          {t('map_search_hint')}
        </p>
        {search.status === 'done' &&
          (search.results.length > 0 ? (
            <ul aria-label={t('map_results')} className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
              {search.results.map((place) => (
                <li key={`${place.lat},${place.lng}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setSearch({ status: 'idle' })
                      choose({ lat: place.lat, lng: place.lng }, { known: place.address, fly: true })
                    }}
                    className="flex min-h-11 w-full items-start gap-2.5 px-3.5 py-2.5 text-left text-sm font-medium text-fg transition-colors hover:bg-hover"
                  >
                    <IconMapPin size={16} className="mt-0.5 shrink-0 text-faint" />
                    {place.address}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">{t('map_nothing_found')}</p>
          ))}
        {search.status === 'failed' && (
          <p role="alert" className="mt-2 text-sm font-medium text-amber-700 dark:text-amber-300">
            {search.message}
          </p>
        )}
      </div>

      <div>
        <MapView
          className="h-72 sm:h-80"
          label={t('map_pick_label')}
          lang={lang}
          point={point}
          pins={pins}
          onPick={(next) => choose(next)}
          focusKey={focusKey}
        />
        <div aria-live="polite" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          {point ? (
            <>
              <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300">
                <IconMapPin size={15} />
                {t('map_picked')}: <span className="font-mono tabular">{formatPoint(point)}</span>
              </span>
              <a
                href={yandexMapUrl(point)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-primary-700 hover:underline dark:text-primary-300"
              >
                {t('map_check_yandex')}
                <IconExternal size={13} />
                <span className="sr-only">{t('map_new_tab')}</span>
              </a>
              {lookingUp && (
                <span className="inline-flex items-center gap-1.5 text-muted">
                  <Spinner size={13} />
                  {t('map_looking_up')}
                </span>
              )}
            </>
          ) : (
            <span className="text-muted">{t('map_pick_hint')}</span>
          )}
        </div>
        {error && (
          <p id={`${id}-error`} className="mt-1.5 flex items-center gap-1 text-[13px] font-medium text-rose-600 dark:text-rose-400">
            <IconAlert size={14} className="shrink-0" />
            {error}
          </p>
        )}
      </div>
    </div>
  )
}

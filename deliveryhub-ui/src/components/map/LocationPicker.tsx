import { lazy, Suspense, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { geoApi } from '../../api/endpoints'
import type { Place } from '../../api/types'
import { cx } from '../../lib/cx'
import { errorMessage } from '../../lib/errors'
import { formatPoint, parsePoint, yandexMapUrl, type Point } from '../../lib/map'
import { ExternalIcon, MapPinIcon, SearchIcon } from '../icons'
import { Button } from '../ui/Button'
import { Field, FieldError } from '../ui/Field'
import { Spinner } from '../ui/Spinner'
import { inputClass } from '../ui/styles'

const MapCanvas = lazy(() => import('./MapCanvas'))

type Search =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'done'; results: Place[] }
  | { status: 'failed'; message: string }

export interface LocationPickerProps {
  /** Ids of the search box and of the address field (focus on errors). */
  id: string
  addressId: string
  point: Point | null
  address: string
  onPointChange: (point: Point) => void
  onAddressChange: (address: string) => void
  locationError?: string
  addressError?: string
}

/**
 * The place of a business: a search (an address, coordinates or a Yandex/Google Maps link), the map — a click or a
 * dragged pin — and the address customers read. A chosen point fills the address in, unless it was typed by hand.
 */
export function LocationPicker({
  id,
  addressId,
  point,
  address,
  onPointChange,
  onAddressChange,
  locationError,
  addressError,
}: LocationPickerProps) {
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
      .reverse(next.lat, next.lng, controller.signal)
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
      const { results } = await geoApi.search(text)
      setSearch({ status: 'done', results })
    } catch (error) {
      setSearch({ status: 'failed', message: errorMessage(error) })
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault() // the picker lives inside a form: Enter searches, it does not submit
    void runSearch()
  }

  return (
    <div className="grid gap-3">
      <div>
        <label htmlFor={id} className="block text-sm font-semibold text-slate-700">
          Xaritadan qidirish
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            id={id}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ko'cha, mahalla, mo'ljal yoki koordinata"
            autoComplete="off"
            aria-describedby={cx(`${id}-hint`, locationError && `${id}-error`)}
            aria-invalid={locationError ? true : undefined}
            className={inputClass(Boolean(locationError))}
          />
          <Button variant="secondary" onClick={() => void runSearch()} loading={search.status === 'searching'}>
            {search.status !== 'searching' && <SearchIcon size={17} />}
            Topish
          </Button>
        </div>
        <p id={`${id}-hint`} className="mt-1.5 text-xs leading-relaxed text-slate-500">
          Yandex yoki Google xaritadan havola yoki koordinatani (41.311081, 69.279737) ham qo'yish mumkin.
        </p>
        {search.status === 'done' &&
          (search.results.length > 0 ? (
            <ul aria-label="Topilgan joylar" className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-xl ring-1 ring-slate-200">
              {search.results.map((place) => (
                <li key={`${place.lat},${place.lng}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setSearch({ status: 'idle' })
                      choose({ lat: place.lat, lng: place.lng }, { known: place.address, fly: true })
                    }}
                    className="flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                  >
                    <MapPinIcon size={16} className="mt-0.5 shrink-0 text-slate-400" />
                    {place.address}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Hech narsa topilmadi. Boshqacha yozing yoki joyni xaritada bosing.</p>
          ))}
        {search.status === 'failed' && (
          <p role="alert" className="mt-2 text-sm font-semibold text-amber-700">
            {search.message}
          </p>
        )}
      </div>

      <div>
        <div className="h-72 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
          <Suspense
            fallback={
              <div className="grid size-full place-items-center text-slate-400">
                <Spinner size={22} />
              </div>
            }
          >
            <MapCanvas
              point={point}
              onPick={(next) => choose(next)}
              focusKey={focusKey}
              label="Xarita: biznes joyini belgilash uchun bosing"
            />
          </Suspense>
        </div>
        <div aria-live="polite" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          {point ? (
            <>
              <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                <MapPinIcon size={15} />
                Belgilandi: <span className="font-mono">{formatPoint(point)}</span>
              </span>
              <a
                href={yandexMapUrl(point)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-800"
              >
                Yandex Kartada tekshirish
                <ExternalIcon size={13} />
                <span className="sr-only">(yangi oynada)</span>
              </a>
              {lookingUp && (
                <span className="inline-flex items-center gap-1.5 text-slate-500">
                  <Spinner size={13} />
                  Manzil aniqlanmoqda…
                </span>
              )}
            </>
          ) : (
            <span className="text-slate-500">Biznes joyini xaritada bosing yoki yuqorida qidiring. Belgini surib aniqlashtirasiz.</span>
          )}
        </div>
        {locationError && <FieldError id={`${id}-error`}>{locationError}</FieldError>}
      </div>

      <Field
        id={addressId}
        label="Biznes manzili"
        hint="Mijozlar «Olib ketish»da shu manzilni ko'radi. Xaritadan to'ldiriladi — mo'ljal bilan aniqlashtirib yozing."
        error={addressError}
      >
        {(control) => (
          <input
            {...control}
            value={address}
            onChange={(event) => onAddressChange(event.target.value)}
            maxLength={255}
            placeholder="Amir Temur ko'chasi, 15, Yunusobod tumani"
            autoComplete="off"
            className={inputClass(Boolean(addressError))}
          />
        )}
      </Field>
    </div>
  )
}

import { useId, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { OrderDetail } from '../../api/types'
import { useAuthed } from '../../auth/session'
import { IconArrowRight, IconInfo, IconSend, IconStore, IconX } from '../../components/icons'
import { MapView } from '../../components/map/MapView'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { useI18n } from '../../i18n/context'
import type { Lang } from '../../i18n/translate'
import { branchVars, formatDistance } from '../../lib/branches'
import { cn } from '../../lib/cn'
import { formatDate, formatTime } from '../../lib/format'
import { toPoint, type MapPin, type Point } from '../../lib/map'
import type { BranchChoice } from './dispatch'

type T = ReturnType<typeof useI18n>['t']

/** «Malika yubordi, 15:43» · «Mijoz o'zi tanladi, 15:40» · «Avtomatik biriktirildi, 9 okt 18:40». */
function assignedText(order: OrderDetail, t: T, lang: Lang): string {
  const who = order.assigned_by
    ? t('dispatch_sent_by', { name: order.assigned_by.name })
    : order.delivery_type === 'pickup' && order.source !== 'admin'
      ? t('dispatch_customer')
      : t('dispatch_auto')
  if (!order.assigned_at) return who
  const today = new Date(order.assigned_at).toDateString() === new Date().toDateString()
  const day = today ? '' : `${formatDate(order.assigned_at, lang, { short: true })} `
  return `${who}, ${day}${formatTime(order.assigned_at)}`
}

interface BranchDispatchProps {
  order: OrderDetail
  choice: BranchChoice
  /** `wide` — a wide screen's full-width section under the page header, the map beside the branches; `stacked` — a
   *  phone's card, the map above them. */
  layout: 'wide' | 'stacked'
  /** `false` — the phone's bottom bar sends a waiting order instead. */
  showSend?: boolean
}

/**
 * The order's branch (the head office). Without one: the customer and every branch on a big map, the branches nearest
 * first, and sending the order to the one chosen. With one: a strip — the branch, who sent it there and when — that
 * opens the same map and list to move it to another (which asks first). Keyed by the order's branch, it closes again
 * once the order has moved.
 */
export function BranchDispatch({ order, choice, layout, showSend = true }: BranchDispatchProps) {
  const [open, setOpen] = useState(false)
  if (order.branch && !open) {
    const movable = choice.options.some((option) => option.id !== choice.current)
    return <BranchStrip order={order} layout={layout} onMove={movable ? () => setOpen(true) : undefined} />
  }
  const onClose = order.branch ? () => setOpen(false) : undefined
  return layout === 'wide' ? (
    <WideDispatch order={order} choice={choice} onClose={onClose} />
  ) : (
    <StackedDispatch order={order} choice={choice} onClose={onClose} showSend={showSend} />
  )
}

/** «🏪 Filial: Chilonzor · Malika yubordi, 15:43» and «Boshqa filialga o'tkazish». */
function BranchStrip({ order, layout, onMove }: { order: OrderDetail; layout: 'wide' | 'stacked'; onMove?: () => void }) {
  const { t, lang } = useI18n()
  return (
    <section
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-line bg-card px-4 py-3 shadow-card sm:px-5',
        layout === 'wide' && 'mb-6',
      )}
    >
      <BranchIcon />
      <h2 className="min-w-0 flex-1 text-[15px] leading-snug text-muted sm:truncate">
        <span className="font-semibold text-fg">{t('dispatch_strip', { name: order.branch?.name ?? '' })}</span>
        {' · '}
        {assignedText(order, t, lang)}
      </h2>
      {onMove && (
        <Button variant="secondary" icon={<IconArrowRight size={16} />} onClick={onMove} className="max-sm:w-full">
          {t('dispatch_move')}
        </Button>
      )}
    </section>
  )
}

function BranchIcon() {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600 ring-1 ring-teal-100 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-500/20">
      <IconStore size={20} />
    </span>
  )
}

/** The map's places: the branches (the chosen one and the nearest marked) and the customer; a line between them. */
function useDispatchMap(order: OrderDetail, choice: BranchChoice) {
  const { t, lang } = useI18n()
  const { options, selected, target } = choice
  const customer = useMemo(() => toPoint(order.lat, order.lng), [order.lat, order.lng])

  const pins = useMemo<MapPin[]>(() => {
    const places: MapPin[] = []
    for (const option of options) {
      const point = toPoint(option.lat, option.lng)
      if (!point) continue
      const tone = option.id === selected ? 'selected' : option.nearest ? 'nearest' : 'branch'
      places.push({
        id: String(option.id),
        point,
        label: option.name,
        detail: option.distance_km !== null ? formatDistance(option.distance_km, lang) : undefined,
        tone,
        // The tags of the customer and of a branch near them point away from each other: the northern one's up.
        tagBelow: tone !== 'branch' && !!customer && point.lat < customer.lat,
      })
    }
    if (customer) {
      const chosen = places.find((place) => place.tone === 'selected')
      const tagBelow = !!chosen && chosen.point.lat > customer.lat
      places.push({ id: 'customer', point: customer, label: t('customer'), tone: 'customer', tagBelow })
    }
    return places
  }, [options, selected, customer, lang, t])

  // The straight line from the customer to the chosen branch.
  const targetLat = target?.lat ?? null
  const targetLng = target?.lng ?? null
  const line = useMemo<[Point, Point] | null>(() => {
    const to = toPoint(targetLat, targetLng)
    return customer && to ? [customer, to] : null
  }, [customer, targetLat, targetLng])

  return { pins, line }
}

function DispatchMap({
  pins,
  line,
  choice,
  className,
}: {
  pins: MapPin[]
  line: [Point, Point] | null
  choice: BranchChoice
  className: string
}) {
  const { t, lang } = useI18n()
  if (!pins.length) return null
  return (
    <MapView
      className={className}
      label={t('dispatch_map')}
      lang={lang}
      pins={pins}
      line={line}
      onPinClick={(id) => choice.select(Number(id))}
    />
  )
}

/** What the head office is to do: send the order (no branch yet), or where it is now (moving it). */
function DispatchNote({ order }: { order: OrderDetail }) {
  const { t, lang } = useI18n()
  return order.branch ? (
    <p className="rounded-xl bg-teal-50/70 px-3.5 py-2.5 text-[13px] text-fg-soft ring-1 ring-teal-100 dark:bg-teal-500/10 dark:ring-teal-500/20">
      <span className="font-semibold text-fg">{t('dispatch_strip', { name: order.branch.name })}</span>
      {' · '}
      {assignedText(order, t, lang)}
    </p>
  ) : (
    <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
      {t('dispatch_waiting')}
    </p>
  )
}

/** No branch is active: nothing to send the order to. */
function NoBranches() {
  const { t } = useI18n()
  const { isAdmin } = useAuthed()
  return (
    <p className="flex items-start gap-2 text-sm text-muted">
      <IconInfo size={16} className="mt-0.5 shrink-0 text-faint" />
      <span>
        {t('dispatch_no_branches')}
        {isAdmin && (
          <>
            {' '}
            <Link to="/branches" className="font-semibold text-primary-700 hover:underline dark:text-primary-300">
              {t('nav_branches')}
            </Link>
          </>
        )}
      </span>
    </p>
  )
}

/** The order's point is unknown (a typed address only): no distances. */
function NoPoint() {
  const { t } = useI18n()
  return (
    <p className="flex items-start gap-2 rounded-xl bg-subtle px-3 py-2.5 text-[13px] text-fg-soft">
      <IconInfo size={16} className="mt-0.5 shrink-0 text-faint" />
      {t('dispatch_no_point')}
    </p>
  )
}

/** The active branches, nearest first: one to choose (a radio group); «Eng yaqin», «Hozirgi» and the distance. */
function BranchOptions({ order, choice, className }: { order: OrderDetail; choice: BranchChoice; className?: string }) {
  const { t, lang } = useI18n()
  const distances = choice.options.some((option) => option.distance_km !== null)
  return (
    <fieldset className={cn('min-w-0', className)} disabled={choice.busy}>
      <legend className="mb-2 text-[13px] font-medium text-fg-soft">{t('dispatch_options')}</legend>
      <div className="space-y-1.5">
        {choice.options.map((option) => {
          const on = option.id === choice.selected
          return (
            <label
              key={option.id}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-all',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary-500',
                on
                  ? 'border-transparent bg-primary-50 ring-2 ring-primary-500 dark:bg-primary-500/10'
                  : 'border-line hover:border-line-strong hover:bg-hover',
              )}
            >
              <input
                type="radio"
                name={`order-${order.id}-branch`}
                value={option.id}
                checked={on}
                onChange={() => choice.select(option.id)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-[18px] shrink-0 items-center justify-center rounded-full border-2',
                  on ? 'border-primary-600 dark:border-primary-400' : 'border-line-strong',
                )}
              >
                {on && <span className="size-2 rounded-full bg-primary-600 dark:bg-primary-400" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span className="truncate text-sm font-semibold text-fg">{option.name}</span>
                  {option.nearest && (
                    <Badge tone="green" size="xs">
                      {t('branch_nearest')}
                    </Badge>
                  )}
                  {option.id === choice.current && (
                    <Badge tone="teal" size="xs">
                      {t('dispatch_current')}
                    </Badge>
                  )}
                </span>
                {option.address && <span className="block truncate text-xs text-muted">{option.address}</span>}
              </span>
              {option.distance_km !== null && (
                <span className="shrink-0 text-sm font-semibold text-fg-soft tabular">{formatDistance(option.distance_km, lang)}</span>
              )}
            </label>
          )
        })}
      </div>
      {distances && <p className="mt-2 text-xs text-muted">{t('dispatch_distance_note')}</p>}
    </fieldset>
  )
}

/**
 * «Chilonzorga yuborish» for an order without a branch; for one with it, «Yunusobodga o'tkazish» once another branch
 * is chosen (asks first) — «Boshqa filialga o'tkazish» until then.
 */
export function SendChoice({ order, choice, className }: { order: OrderDetail; choice: BranchChoice; className?: string }) {
  const { t } = useI18n()
  const { target } = choice
  const label = order.branch
    ? choice.ready && target
      ? t('dispatch_move_to', branchVars(target.name))
      : t('dispatch_move')
    : target
      ? t('send_to_branch', branchVars(target.name))
      : t('dispatch_move')
  return (
    <Button
      size="lg"
      className={cn('w-full', className)}
      icon={order.branch ? <IconArrowRight size={18} /> : <IconSend size={18} />}
      loading={choice.busy}
      disabled={!choice.ready}
      onClick={() => void choice.send()}
    >
      <span className="truncate">{label}</span>
    </Button>
  )
}

function CloseButton({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  return (
    <Button variant="ghost" size="sm" icon={<IconX size={16} />} onClick={onClose} className="ml-auto">
      {t('close')}
    </Button>
  )
}

function Heading({ id, order, actions }: { id: string; order: OrderDetail; actions?: ReactNode }) {
  const { t } = useI18n()
  return (
    <header className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
      <BranchIcon />
      <h2 id={id} className="text-[15px] font-semibold text-fg">
        {t('branch')}
      </h2>
      {!order.branch && (
        <Badge tone="amber" dot>
          {t('branch_none')}
        </Badge>
      )}
      {actions}
    </header>
  )
}

/** A wide screen: the big map on the left, the branches and the button on the right, under the page header. */
function WideDispatch({ order, choice, onClose }: { order: OrderDetail; choice: BranchChoice; onClose?: () => void }) {
  const titleId = useId()
  const distances = choice.options.some((option) => option.distance_km !== null)
  const { pins, line } = useDispatchMap(order, choice)
  return (
    <section aria-labelledby={titleId} className="mb-6 overflow-hidden rounded-2xl border border-line bg-card shadow-card">
      <Heading id={titleId} order={order} actions={onClose && <CloseButton onClose={onClose} />} />
      <div className="flex h-[460px]">
        <div className="min-w-0 flex-1 p-3">
          {pins.length ? (
            <DispatchMap pins={pins} line={line} choice={choice} className="h-full" />
          ) : (
            <div className="grid h-full place-items-center rounded-xl bg-subtle p-6 text-center text-sm text-muted">
              {choice.options.length ? <NoPoint /> : <NoBranches />}
            </div>
          )}
        </div>
        <div className="flex w-[340px] shrink-0 flex-col border-l border-line xl:w-[380px] 2xl:w-[400px]">
          <div className="space-y-3 p-4 pb-3">
            <DispatchNote order={order} />
            {choice.options.length > 0 && !distances && pins.length > 0 && <NoPoint />}
          </div>
          {choice.options.length > 0 ? (
            <>
              <BranchOptions order={order} choice={choice} className="min-h-0 flex-1 overflow-y-auto px-4 pb-3" />
              <div className="border-t border-line p-4">
                <SendChoice order={order} choice={choice} />
              </div>
            </>
          ) : (
            <div className="px-4">
              <NoBranches />
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

/** A phone: the map (taller than a list row would want, so the places can be told apart), the branches below it. */
function StackedDispatch({
  order,
  choice,
  onClose,
  showSend,
}: {
  order: OrderDetail
  choice: BranchChoice
  onClose?: () => void
  showSend: boolean
}) {
  const titleId = useId()
  const distances = choice.options.some((option) => option.distance_km !== null)
  const { pins, line } = useDispatchMap(order, choice)
  return (
    <section aria-labelledby={titleId} className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
      <Heading id={titleId} order={order} actions={onClose && <CloseButton onClose={onClose} />} />
      <div className="space-y-4 p-4">
        <DispatchNote order={order} />
        {choice.options.length === 0 ? (
          <NoBranches />
        ) : (
          <>
            <DispatchMap pins={pins} line={line} choice={choice} className="h-[300px]" />
            {!distances && <NoPoint />}
            <BranchOptions order={order} choice={choice} />
            {showSend && <SendChoice order={order} choice={choice} />}
          </>
        )}
      </div>
    </section>
  )
}

import type { ReactNode } from 'react'
import { useParams } from 'react-router'
import { isApiError } from '../../api/client'
import type { Order } from '../../api/types'
import { Button, IconButton } from '../../components/Button'
import { Card } from '../../components/Card'
import { EmptyState, Skeleton } from '../../components/EmptyState'
import { ExternalLink } from '../../components/ExternalLink'
import { Icon, type IconName } from '../../components/Icon'
import { OrderTracker } from '../../components/OrderStatus'
import { ProductImage } from '../../components/ProductImage'
import { useI18n } from '../../i18n/i18n'
import { cn } from '../../lib/cn'
import { errorMessageKey } from '../../lib/errors'
import { displayPhone, mapUrl, toNumber } from '../../lib/format'
import { isTelegram } from '../../lib/telegram'
import { useMainButton } from '../../lib/useTelegram'
import { useAuth } from '../../state/auth'
import { useCatalog } from '../../state/catalog'
import { useDocumentTitle, useReorder } from '../../state/hooks'
import { useTabBar } from '../../state/phoneNav'
import { useNav, useNavState } from '../../state/nav'
import { statusIcon, statusLabel, statusText } from '../../state/orderStatus'
import { isActiveOrder, useOrder } from '../../state/orders'

export function OrderScreen() {
  const { t } = useI18n()
  const params = useParams()
  const id = Number(params.id)
  useDocumentTitle(t('orderNo', { id: params.id ?? '' }))
  const { token, status } = useAuth()
  const { openSheet, go } = useNav()
  const query = useOrder(id)
  const order = query.data

  if (!token && status === 'ready') {
    return (
      <EmptyState
        icon="lock"
        tone="brand"
        title={t('ordersSignIn')}
        text={t('loginPrompt')}
        className="py-16"
        action={
          <Button size="md" iconRight="arrow-right" onClick={() => openSheet({ type: 'auth' })}>
            {t('login')}
          </Button>
        }
      />
    )
  }

  if (!order) {
    if (query.isError || !Number.isInteger(id)) {
      const notFound = !Number.isInteger(id) || (isApiError(query.error) && query.error.status === 404)
      return (
        <EmptyState
          icon={notFound ? 'compass' : 'wifi-off'}
          title={notFound ? t('orderNotFound') : t('ordersError')}
          text={notFound ? t('orderNotFoundText') : t(errorMessageKey(query.error))}
          className="py-16"
          action={
            notFound ? (
              <Button size="md" variant="soft" onClick={() => go('/orders', { replace: true })}>
                {t('backToOrders')}
              </Button>
            ) : (
              <Button size="md" variant="dark" icon="refresh" onClick={() => void query.refetch()}>
                {t('retry')}
              </Button>
            )
          }
        />
      )
    }
    return <OrderSkeleton />
  }

  return <OrderView order={order} refreshing={query.isFetching} onRefresh={() => void query.refetch()} />
}

function OrderSkeleton() {
  return (
    <div className="mx-auto max-w-[720px] space-y-4 pt-[18px] pb-12" aria-busy="true">
      <Skeleton className="h-9 w-52" />
      <Skeleton className="h-48 rounded-[22px]" />
      <Skeleton className="h-40 rounded-[22px]" />
      <Skeleton className="h-32 rounded-[22px]" />
    </div>
  )
}

const STATUS_TONE: Record<Order['status'], string> = {
  ordered: 'bg-blue-soft text-blue',
  on_the_way: 'bg-amber-soft text-amber',
  completed: 'bg-green-soft text-green',
  rejected: 'bg-red-soft text-red',
}

function OrderView({ order, refreshing, onRefresh }: { order: Order; refreshing: boolean; onRefresh: () => void }) {
  const { t, name, money, date } = useI18n()
  const { business } = useCatalog()
  const { go } = useNav()
  const { placed } = useNavState()
  const inTelegram = isTelegram()
  const active = isActiveOrder(order)
  const pickup = order.delivery_type === 'pickup'
  const lat = toNumber(order.lat)
  const lng = toNumber(order.lng)

  const repeat = useReorder()
  const reorder = () => repeat(order)

  // A finished order is repeated with one tap (Telegram: the MainButton — but not under a phone's menu bar, where the
  // page's own button does it); an active one keeps it secondary.
  const tabBar = useTabBar()
  const pageButtons = !inTelegram || tabBar
  useMainButton(active || pageButtons ? null : { text: t('reorder'), onClick: reorder })

  // Pickup: where to come (the business's place); delivery: where the order goes.
  const place = pickup
    ? { address: business?.address ?? '', lat: business?.lat ?? null, lng: business?.lng ?? null }
    : { address: order.address, lat, lng }
  const details: { icon: IconName; label: string; value: ReactNode }[] = [
    {
      icon: pickup ? 'store' : 'pin',
      label: pickup ? t('pickup') : t('delivery'),
      value:
        pickup && !place.address ? null : (
          <>
            {place.address || (place.lat !== null ? t('locationSet') : '—')}
            {place.lat !== null && place.lng !== null && (
              <ExternalLink
                href={mapUrl(place.lat, place.lng)}
                className="ml-1.5 inline-flex items-center gap-1 font-bold text-brand-text hover:underline"
              >
                <Icon name="map" className="size-3.5" />
                {t('onMap')}
              </ExternalLink>
            )}
          </>
        ),
    },
  ]
  if (order.phone) details.push({ icon: 'phone', label: t('phone'), value: displayPhone(order.phone) })
  if (order.payment_method) {
    details.push({
      icon: order.payment_method === 'card' ? 'card' : 'cash',
      label: t('payment'),
      value: order.payment_method === 'card' ? t('card') : t('cash'),
    })
  }
  if (order.comment) details.push({ icon: 'message', label: t('comment'), value: order.comment })

  return (
    <div className="mx-auto max-w-[720px] pb-12 tg:pb-8">
      {placed && (
        <div className="pt-6 pb-2 text-center" role="status">
          <div className="mx-auto grid size-24 animate-pop-in place-items-center rounded-full bg-green shadow-[0_0_0_12px_var(--green-soft)]">
            <svg viewBox="0 0 24 24" aria-hidden="true" className="check-draw size-12" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
          <h2 className="mt-6 text-[23px] font-extrabold tracking-[-0.025em]">{t('orderPlaced')}</h2>
          <p className="mx-auto mt-1.5 max-w-[340px] text-[14.5px] font-medium text-muted">{t('orderPlacedText')}</p>
        </div>
      )}

      <div className="mt-[18px] mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.03em]">{t('orderNo', { id: order.id })}</h1>
          <p className="mt-0.5 text-[13px] font-semibold text-muted">{date(order.created_at)}</p>
        </div>
        <IconButton icon="refresh" label={t('refresh')} onClick={onRefresh} iconClassName={cn(refreshing && 'animate-spin')} />
      </div>

      <div className="space-y-4">
        <Card>
          <div className="flex items-start gap-3.5">
            <span className={cn('grid size-12 shrink-0 place-items-center rounded-2xl', STATUS_TONE[order.status])}>
              <Icon name={statusIcon(order)} className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-extrabold tracking-[-0.02em]">{statusLabel(order, t)}</h2>
              <p className="mt-0.5 text-sm text-muted">{statusText(order, t)}</p>
              {active && !pickup && business?.delivery_time && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[13px] font-bold text-ink-2">
                  <Icon name="clock" className="size-3.5" />
                  {t('eta', { time: business.delivery_time })}
                </p>
              )}
            </div>
          </div>

          {order.status === 'rejected' ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[14px] bg-red-soft px-3.5 py-3 text-sm font-bold text-red" role="alert">
              <Icon name="alert" />
              <span className="min-w-0 flex-1">{t('rejectedText')}</span>
              {business?.support_phone && (
                <a href={`tel:${business.support_phone}`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-red px-3.5 text-[13px] font-extrabold text-white">
                  <Icon name="phone" className="size-4" />
                  {t('callUs')}
                </a>
              )}
            </div>
          ) : (
            <OrderTracker order={order} className="mt-5" />
          )}

          {active && (
            <p className="mt-4 flex items-center gap-2 text-xs font-semibold text-muted">
              <span className="live-dot size-2 rounded-full bg-green" aria-hidden="true" />
              {t('liveStatus')}
            </p>
          )}
        </Card>

        <Card title={t('products')} titleId="order-items">
          <ul className="space-y-1">
            {order.items.map((item, index) => (
              <li key={`${item.product_id}-${index}`} className="flex items-center gap-3 py-1.5">
                <ProductImage src={item.image} name={name(item)} className="size-[52px] shrink-0 rounded-[14px]" letterClassName="text-lg" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14.5px] font-bold">{name(item)}</div>
                  <div className="tabular mt-0.5 text-[13px] font-semibold text-muted">
                    {item.quantity} × {money(item.price)}
                  </div>
                </div>
                <b className="tabular text-sm">{money(item.total)}</b>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3 text-xl font-extrabold tracking-[-0.02em]">
            <span>{t('total')}</span>
            <span className="tabular">{money(order.total)}</span>
          </div>
        </Card>

        <Card title={t('orderDetails')} titleId="order-details">
          <ul className="grid gap-3">
            {details.map((row) => (
              <li key={row.label} className="flex items-start gap-3 text-sm">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2">
                  <Icon name={row.icon} className="size-[18px]" />
                </span>
                <div className="min-w-0 pt-px">
                  <div className="text-xs font-bold text-muted">{row.label}</div>
                  {row.value && <div className="mt-0.5 font-semibold break-words">{row.value}</div>}
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <div className="flex flex-col gap-2 sm:flex-row">
          {active ? (
            <>
              <Button variant="primary" className="sm:flex-1" block onClick={() => go('/')}>
                {t('backToMenu')}
              </Button>
              <Button variant="soft" icon="refresh" className="sm:flex-1" block onClick={reorder}>
                {t('reorder')}
              </Button>
            </>
          ) : (
            <>
              {pageButtons && (
                <Button variant="primary" icon="refresh" className="sm:flex-1" block onClick={reorder}>
                  {t('reorder')}
                </Button>
              )}
              <Button variant="soft" className="sm:flex-1" block onClick={() => go('/')}>
                {t('backToMenu')}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

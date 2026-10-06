import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { isApiError } from '../../api/client'
import { errorMessage } from '../../api/errors'
import { useOrder, useUpdateOrderStatus } from '../../api/queries'
import { ORDER_STATUSES, type OrderDetail, type OrderStatus } from '../../api/types'
import { Money, SourceBadge, StatusBadge } from '../../components/badges'
import { useConfirm, useToast } from '../../components/feedback/feedback'
import {
  IconBag,
  IconCalendar,
  IconCard,
  IconCash,
  IconCheck,
  IconClock,
  IconExternal,
  IconMapPin,
  IconMessage,
  IconPhone,
  IconTruck,
  IconUser,
  IconXCircle,
} from '../../components/icons'
import { STATUS_KEYS, STATUS_TONES } from '../../components/statusMeta'
import { Avatar } from '../../components/ui/Avatar'
import { ButtonLink } from '../../components/ui/Button'
import { Card, CardHeader, InfoRow } from '../../components/ui/Card'
import { PageHeader } from '../../components/ui/PageHeader'
import { Skeleton, SkeletonText } from '../../components/ui/Skeleton'
import { Spinner } from '../../components/ui/Spinner'
import { ErrorState } from '../../components/ui/States'
import { TONES } from '../../components/ui/styles'
import { NotFound } from '../../auth/SystemScreens'
import { useI18n } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { formatFullDateTime, formatPhone, fullName, mapLinks, phoneHref } from '../../lib/format'

export function OrderDetailPage() {
  const { id = '' } = useParams()
  const { t, lang } = useI18n()
  const { data: order, isLoading, error, refetch } = useOrder(id)

  if (isApiError(error) && error.status === 404) return <NotFound />

  const back = { to: '/orders', label: t('back_to_orders') }

  if (isLoading || !order) {
    return (
      <>
        <PageHeader back={back} title={`${t('order')} #${id}`} />
        {error ? (
          <Card>
            <ErrorState error={error} onRetry={() => void refetch()} />
          </Card>
        ) : (
          <OrderSkeleton />
        )}
      </>
    )
  }

  return (
    <>
      <PageHeader
        back={back}
        documentTitle={`${t('order')} #${order.id}`}
        title={
          <>
            {t('order')} <span className="tabular">#{order.id}</span>
          </>
        }
        meta={
          <div className="flex items-center gap-2">
            <StatusBadge status={order.status} size="md" />
            <SourceBadge source={order.source} size="sm" />
          </div>
        }
        description={formatFullDateTime(order.created_at, lang)}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <ItemsCard order={order} />
          <DeliveryCard order={order} />
        </div>
        <div className="space-y-6">
          <StatusCard order={order} />
          <CustomerCard order={order} />
          <ExtraCard order={order} />
        </div>
      </div>
    </>
  )
}

function OrderSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3" aria-busy="true">
      <div className="space-y-6 lg:col-span-2">
        <Card className="p-5">
          <Skeleton className="mb-5 h-5 w-48" />
          <div className="space-y-4">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="flex items-center gap-4">
                <Skeleton className="size-12 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <SkeletonText lines={4} />
        </Card>
      </div>
      <div className="space-y-6">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-44 rounded-2xl" />
      </div>
    </div>
  )
}

function ItemsCard({ order }: { order: OrderDetail }) {
  const { t, tn, name } = useI18n()
  const count = order.items.reduce((sum, item) => sum + item.quantity, 0)
  return (
    <Card>
      <CardHeader title={t('order_items')} actions={<span className="text-[13px] text-muted">{tn('pieces', count)}</span>} />
      {order.items.length ? (
        <ul className="divide-y divide-line">
          {order.items.map((item, index) => {
            const title = name(item) || t('product_not_available')
            return (
              <li key={`${item.product_id ?? 'x'}-${index}`} className="flex items-center gap-4 px-5 py-3.5">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-subtle text-sm font-bold text-muted ring-1 ring-line">
                  {item.quantity}×
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate font-medium', item.product_id ? 'text-fg' : 'text-muted italic')}>{title}</p>
                  <p className="mt-0.5 text-[13px] text-muted tabular">
                    {item.quantity} × <Money value={item.price} />
                  </p>
                </div>
                <Money value={item.total} className="shrink-0 font-semibold text-fg" />
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="px-5 py-10 text-center text-sm text-muted">{t('no_items')}</p>
      )}
      <div className="flex items-center justify-between rounded-b-2xl border-t border-line bg-subtle/50 px-5 py-4">
        <span className="text-[15px] font-semibold text-fg">{t('total')}</span>
        <Money value={order.total} className="text-xl font-bold text-primary-600 dark:text-primary-400" />
      </div>
    </Card>
  )
}

function DeliveryCard({ order }: { order: OrderDetail }) {
  const { t } = useI18n()
  const links = mapLinks(order.lat, order.lng)
  const isPickup = order.delivery_type === 'pickup'

  return (
    <Card>
      <CardHeader title={t('delivery_info')} />
      <dl className="grid grid-cols-1 gap-x-6 gap-y-5 p-5 sm:grid-cols-2">
        {order.delivery_type && (
          <InfoRow label={t('receive_method')} icon={isPickup ? <IconBag size={18} /> : <IconTruck size={18} />}>
            {isPickup ? t('pickup') : t('delivery')}
          </InfoRow>
        )}
        {order.payment_method && (
          <InfoRow
            label={t('payment_method')}
            icon={order.payment_method === 'card' ? <IconCard size={18} /> : <IconCash size={18} />}
          >
            {order.payment_method === 'card' ? t('card') : t('cash')}
          </InfoRow>
        )}
        <InfoRow label={t('phone')} icon={<IconPhone size={18} />}>
          {order.phone ? (
            <a href={phoneHref(order.phone)} className="font-medium text-primary-600 tabular hover:underline dark:text-primary-400">
              {formatPhone(order.phone)}
            </a>
          ) : (
            '—'
          )}
        </InfoRow>
        {!isPickup && (
          <InfoRow label={t('address')} icon={<IconMapPin size={18} />}>
            <span className="whitespace-pre-line">{order.address || '—'}</span>
            {links && (
              <span className="mt-2 flex flex-wrap gap-2">
                <a
                  href={links.google}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary-50 px-2.5 py-1 text-[13px] font-semibold text-primary-700 transition-colors hover:bg-primary-100 dark:bg-primary-500/10 dark:text-primary-300 dark:hover:bg-primary-500/20"
                >
                  <IconMapPin size={14} />
                  {t('view_on_map')}
                </a>
                <a
                  href={links.yandex}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-subtle px-2.5 py-1 text-[13px] font-semibold text-fg-soft transition-colors hover:bg-line hover:text-fg"
                >
                  {t('yandex_maps')}
                  <IconExternal size={13} />
                </a>
              </span>
            )}
          </InfoRow>
        )}
        {order.comment && (
          <div className="sm:col-span-2">
            <InfoRow label={t('comment')} icon={<IconMessage size={18} />}>
              <span className="whitespace-pre-line">{order.comment}</span>
            </InfoRow>
          </div>
        )}
      </dl>
    </Card>
  )
}

function StatusCard({ order }: { order: OrderDetail }) {
  const { t } = useI18n()
  const toast = useToast()
  const confirm = useConfirm()
  const update = useUpdateOrderStatus(order.id)
  const [pending, setPending] = useState<OrderStatus | null>(null)

  const change = async (status: OrderStatus) => {
    if (status === order.status || update.isPending) return
    if (status === 'rejected') {
      const ok = await confirm({
        title: t('reject_confirm_title'),
        message: t('reject_confirm_text'),
        confirmLabel: t('reject_confirm'),
        cancelLabel: t('back'),
      })
      if (!ok) return
    }
    setPending(status)
    update.mutate(status, {
      onSuccess: () =>
        toast.success(t('status_updated'), {
          description: order.client ? t('customer_notified') : undefined,
        }),
      onError: (error) => toast.error(errorMessage(error, t)),
      onSettled: () => setPending(null),
    })
  }

  const icons: Record<OrderStatus, ReactNode> = {
    ordered: <IconClock size={18} />,
    on_the_way: <IconTruck size={18} />,
    completed: <IconCheck size={18} />,
    rejected: <IconXCircle size={18} />,
  }

  return (
    <Card>
      <CardHeader title={t('order_status')} description={t('change_status')} />
      <fieldset className="space-y-2 p-4" disabled={update.isPending}>
        <legend className="sr-only">{t('order_status')}</legend>
        {ORDER_STATUSES.map((status) => {
          const current = order.status === status
          const tone = TONES[STATUS_TONES[status]]
          return (
            <label
              key={status}
              className={cn(
                'relative flex w-full cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm font-semibold transition-all',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary-500',
                'has-[:disabled]:cursor-progress',
                current
                  ? 'border-transparent bg-primary-50 text-fg ring-2 ring-primary-500 dark:bg-primary-500/10'
                  : 'border-line text-fg-soft hover:border-line-strong hover:bg-hover hover:text-fg has-[:disabled]:opacity-60',
              )}
            >
              <input
                type="radio"
                name="order-status"
                value={status}
                checked={current}
                onChange={() => void change(status)}
                className="sr-only"
              />
              <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', tone.soft)}>
                {pending === status ? <Spinner size={16} /> : icons[status]}
              </span>
              <span className="flex-1">{t(STATUS_KEYS[status])}</span>
              {current && (
                <span className="flex size-5 items-center justify-center rounded-full bg-primary-600 text-white dark:bg-primary-500">
                  <IconCheck size={13} strokeWidth={3} />
                </span>
              )}
            </label>
          )
        })}
      </fieldset>
    </Card>
  )
}

function CustomerCard({ order }: { order: OrderDetail }) {
  const { t } = useI18n()
  const client = order.client

  return (
    <Card>
      <CardHeader title={t('client_info')} />
      <div className="p-5">
        {client ? (
          <>
            <div className="flex items-center gap-3.5">
              <Avatar name={client.first_name || '?'} secondary={client.last_name} size="lg" />
              <div className="min-w-0">
                <p className="truncate font-semibold text-fg">{fullName(client.first_name, client.last_name) || '—'}</p>
                {client.tg_nick && <p className="truncate text-[13px] text-primary-600 dark:text-primary-400">@{client.tg_nick}</p>}
              </div>
            </div>
            <dl className="mt-5 space-y-4">
              <InfoRow label={t('phone')}>
                {client.phone ? (
                  <a href={phoneHref(client.phone)} className="tabular hover:underline">
                    {formatPhone(client.phone)}
                  </a>
                ) : (
                  '—'
                )}
              </InfoRow>
            </dl>
            <ButtonLink to={`/clients/${client.id}`} size="sm" variant="secondary" className="mt-5 w-full" icon={<IconUser size={16} />}>
              {t('view_client_profile')}
            </ButtonLink>
          </>
        ) : order.customer_name || order.phone ? (
          <>
            <div className="flex items-center gap-3.5">
              <Avatar
                name={order.customer_name || '?'}
                size="lg"
                colorClass="bg-primary-100 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300"
              />
              <div className="min-w-0">
                <p className="truncate font-semibold text-fg">{order.customer_name || '—'}</p>
                {order.phone && <p className="text-[13px] text-muted tabular">{formatPhone(order.phone)}</p>}
              </div>
            </div>
            <p className="mt-4 rounded-xl bg-subtle px-3 py-2 text-xs text-muted">{t('walk_in_customer')}</p>
          </>
        ) : (
          <p className="text-sm text-muted">{t('no_client_info')}</p>
        )}
      </div>
    </Card>
  )
}

function ExtraCard({ order }: { order: OrderDetail }) {
  const { t, lang } = useI18n()
  return (
    <Card>
      <CardHeader title={t('order_extra')} />
      <dl className="space-y-4 p-5">
        <InfoRow label={t('source')}>
          <SourceBadge source={order.source} size="sm" />
        </InfoRow>
        {order.created_by && (
          <InfoRow label={t('created_by')}>
            <span className="font-medium">{order.created_by.name}</span>
          </InfoRow>
        )}
        <InfoRow label={t('created')} icon={<IconCalendar size={16} />}>
          <time dateTime={order.created_at} className="tabular">
            {formatFullDateTime(order.created_at, lang)}
          </time>
        </InfoRow>
        {order.updated_at && (
          <InfoRow label={t('last_updated')} icon={<IconClock size={16} />}>
            <time dateTime={order.updated_at} className="tabular">
              {formatFullDateTime(order.updated_at, lang)}
            </time>
          </InfoRow>
        )}
        {order.client_id && !order.client && (
          <Link to={`/clients/${order.client_id}`} className="text-[13px] font-semibold text-primary-600 hover:underline">
            {t('view_client_profile')}
          </Link>
        )}
      </dl>
    </Card>
  )
}

import { useParams } from 'react-router'
import { isApiError } from '../../api/client'
import { useClient } from '../../api/queries'
import { NotFound } from '../../auth/SystemScreens'
import { Money } from '../../components/badges'
import { IconCalendar, IconGlobe, IconMapPin, IconOrders, IconPencil, IconPhone, IconTelegram } from '../../components/icons'
import { Avatar } from '../../components/ui/Avatar'
import { Badge } from '../../components/ui/Badge'
import { ButtonLink } from '../../components/ui/Button'
import { Card, CardHeader, InfoRow } from '../../components/ui/Card'
import { PageHeader } from '../../components/ui/PageHeader'
import { Skeleton, SkeletonText } from '../../components/ui/Skeleton'
import { EmptyState, ErrorState } from '../../components/ui/States'
import { useI18n } from '../../i18n/context'
import { formatFullDateTime, formatPhone, fullName, phoneHref } from '../../lib/format'
import { OrdersTable } from '../orders/OrdersTable'

export function ClientDetailPage() {
  const { id = '' } = useParams()
  const { t, tn, lang } = useI18n()
  const { data: client, isLoading, error, refetch } = useClient(id)

  if (isApiError(error) && error.status === 404) return <NotFound />
  const back = { to: '/clients', label: t('back_to_clients') }

  if (!client) {
    return (
      <>
        <PageHeader back={back} title={t('client_details')} />
        {error ? (
          <Card>
            <ErrorState error={error} onRetry={() => void refetch()} />
          </Card>
        ) : isLoading ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3" aria-busy="true">
            <Card className="p-6">
              <Skeleton className="mx-auto size-20 rounded-full" />
              <Skeleton className="mx-auto mt-4 h-5 w-40" />
              <SkeletonText className="mt-8" lines={5} />
            </Card>
            <Skeleton className="h-96 rounded-2xl lg:col-span-2" />
          </div>
        ) : null}
      </>
    )
  }

  const name = fullName(client.first_name, client.last_name)
  const revenue = client.orders.filter((order) => order.status !== 'rejected').reduce((sum, order) => sum + order.total, 0)

  return (
    <>
      <PageHeader
        back={back}
        title={name || t('client_details')}
        description={tn('orders', client.orders_count)}
        actions={
          <ButtonLink to={`/clients/${client.id}/edit`} variant="primary" icon={<IconPencil size={16} />}>
            {t('edit_client')}
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="self-start">
          <div className="flex flex-col items-center border-b border-line px-6 pb-6 pt-7 text-center">
            <Avatar name={client.first_name || client.phone || '?'} secondary={client.last_name} size="xl" />
            <h2 className="mt-4 text-lg font-semibold text-fg">{name || '—'}</h2>
            {client.tg_nick && (
              <p className="mt-0.5 inline-flex items-center gap-1.5 text-sm text-primary-600 dark:text-primary-400">
                <IconTelegram size={14} className="-rotate-12" />@{client.tg_nick}
              </p>
            )}
            <div className="mt-4 grid w-full grid-cols-2 gap-3">
              <div className="rounded-xl bg-subtle px-3 py-2.5">
                <p className="text-lg font-bold text-fg tabular">{client.orders_count}</p>
                <p className="text-xs text-muted">{t('nav_orders')}</p>
              </div>
              <div className="rounded-xl bg-subtle px-3 py-2.5">
                <Money value={revenue} className="block truncate text-lg font-bold text-fg" />
                <p className="text-xs text-muted">{t('total')}</p>
              </div>
            </div>
          </div>
          <dl className="space-y-5 p-6">
            <InfoRow label={t('phone')} icon={<IconPhone size={16} />}>
              {client.phone ? (
                <a href={phoneHref(client.phone)} className="font-medium tabular hover:underline">
                  {formatPhone(client.phone)}
                </a>
              ) : (
                '—'
              )}
            </InfoRow>
            <InfoRow label={t('telegram')} icon={<IconTelegram size={16} className="-rotate-12" />}>
              {client.telegram ? (
                <Badge tone="sky" size="xs">
                  {t('telegram_linked')}
                </Badge>
              ) : (
                <span className="text-muted">{t('telegram_not_linked')}</span>
              )}
            </InfoRow>
            <InfoRow label={t('language')} icon={<IconGlobe size={16} />}>
              {client.lang === 'uz' ? t('uzbek') : client.lang === 'ru' ? t('russian') : <span className="text-muted">{t('not_set')}</span>}
            </InfoRow>
            <InfoRow label={t('location')} icon={<IconMapPin size={16} />}>
              {client.location || <span className="text-muted">—</span>}
            </InfoRow>
            <InfoRow label={t('joined')} icon={<IconCalendar size={16} />}>
              <time dateTime={client.created_at}>{formatFullDateTime(client.created_at, lang)}</time>
            </InfoRow>
          </dl>
        </Card>

        <Card className="self-start lg:col-span-2">
          <CardHeader title={t('order_history')} />
          <OrdersTable
            caption={t('order_history')}
            orders={client.orders}
            hide={['customer', 'phone']}
            empty={<EmptyState icon={<IconOrders size={26} />} title={t('no_orders_yet')} compact />}
            mobileListClassName="space-y-3 p-3"
          />
        </Card>
      </div>
    </>
  )
}

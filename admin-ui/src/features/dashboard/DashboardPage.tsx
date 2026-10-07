import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useDashboard } from '../../api/queries'
import { useAuthed } from '../../auth/session'
import {
  IconArrowRight,
  IconCheckCircle,
  IconClients,
  IconClock,
  IconNavigation,
  IconOrders,
  IconProducts,
  IconTag,
} from '../../components/icons'
import { ButtonLink } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { PageHeader } from '../../components/ui/PageHeader'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState, ErrorState } from '../../components/ui/States'
import { useI18n } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { formatNumber } from '../../lib/format'
import { SIDEBAR_QUERY, useMediaQuery } from '../../lib/useMediaQuery'
import { OrdersTable } from '../orders/OrdersTable'
import { DailyBars, StatusDonut } from './DashboardCharts'
import { MobileHome } from './MobileHome'

export function DashboardPage() {
  return useMediaQuery(SIDEBAR_QUERY) ? <DesktopDashboard /> : <MobileHome />
}

function DesktopDashboard() {
  const { t, tn } = useI18n()
  const { user } = useAuthed()
  const { data, isLoading, error, refetch } = useDashboard()

  return (
    <>
      <PageHeader
        title={user.first_name ? t('welcome', { name: user.first_name }) : t('dashboard_title')}
        description={t('dashboard_subtitle')}
      />

      {error && !data ? (
        <Card>
          <ErrorState error={error} onRetry={() => void refetch()} />
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <KpiCard
              loading={isLoading}
              to="/orders"
              label={t('total_orders')}
              value={data?.orders.total}
              icon={<IconOrders size={22} />}
              iconClass="bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300"
              sub={
                <>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    +{formatNumber(data?.orders.last_7_days)}
                  </span>{' '}
                  {t('this_week')}
                </>
              }
            />
            <KpiCard
              loading={isLoading}
              to="/orders?status=ordered"
              label={t('new_orders')}
              value={data?.orders.new}
              icon={<IconClock size={22} />}
              iconClass="bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300"
              sub={t('awaiting_processing')}
              highlight={!!data?.orders.new}
            />
            <KpiCard
              loading={isLoading}
              to="/clients"
              label={t('total_clients')}
              value={data?.clients.total}
              icon={<IconClients size={22} />}
              iconClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300"
              sub={
                <>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    +{formatNumber(data?.clients.new_7_days)}
                  </span>{' '}
                  {t('this_week')}
                </>
              }
            />
            <KpiCard
              loading={isLoading}
              to="/products"
              label={t('total_products')}
              value={data?.products.total}
              icon={<IconProducts size={22} />}
              iconClass="bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-300"
              sub={t('in_categories', { count: formatNumber(data?.categories.total) })}
            />
          </div>

          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            <GradientStat
              loading={isLoading}
              to="/orders?status=on_the_way"
              label={t('status_on_the_way')}
              value={data?.orders.on_the_way}
              icon={<IconNavigation size={26} />}
              className="from-orange-500 to-amber-500 shadow-orange-500/25"
            />
            <GradientStat
              loading={isLoading}
              to="/orders?status=completed"
              label={t('status_completed')}
              value={data?.orders.completed}
              icon={<IconCheckCircle size={26} />}
              className="from-emerald-500 to-teal-500 shadow-emerald-500/25"
            />
            <GradientStat
              loading={isLoading}
              to="/categories"
              label={t('nav_categories')}
              value={data?.categories.total}
              icon={<IconTag size={26} />}
              className="from-sky-500 to-blue-600 shadow-sky-500/25"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title={t('orders_by_status')} />
              <div className="p-5">
                {isLoading ? (
                  <div className="flex items-center gap-6">
                    <Skeleton className="size-52 rounded-full" />
                    <div className="flex-1 space-y-3">
                      {Array.from({ length: 4 }, (_, index) => (
                        <Skeleton key={index} className="h-4" />
                      ))}
                    </div>
                  </div>
                ) : data && data.by_status.some((row) => row.count > 0) ? (
                  <StatusDonut data={data.by_status} />
                ) : (
                  <EmptyState compact title={t('no_data')} />
                )}
              </div>
            </Card>
            <Card>
              <CardHeader
                title={t('orders_last_7_days')}
                actions={
                  data ? (
                    <span className="text-[13px] font-medium text-muted">{tn('orders', data.orders.last_7_days)}</span>
                  ) : null
                }
              />
              <div className="p-5 pb-3">
                {isLoading ? <Skeleton className="h-64 rounded-xl" /> : data ? <DailyBars data={data.daily} /> : null}
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader
              title={t('recent_orders')}
              actions={
                <ButtonLink to="/orders" size="sm" variant="secondary" iconRight={<IconArrowRight size={16} />}>
                  {t('view_all')}
                </ButtonLink>
              }
            />
            <OrdersTable
              caption={t('recent_orders')}
              orders={data?.latest_orders}
              loading={isLoading}
              hide={['items']}
              skeletonRows={5}
            />
          </Card>
        </div>
      )}
    </>
  )
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  iconClass,
  loading,
  to,
  highlight,
}: {
  label: string
  value: number | undefined
  sub: ReactNode
  icon: ReactNode
  iconClass: string
  loading: boolean
  to: string
  highlight?: boolean
}) {
  return (
    <Link
      to={to}
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-line bg-card p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-900/5 sm:p-5',
        highlight && 'ring-1 ring-amber-400/40',
      )}
    >
      <div className="flex flex-col-reverse items-start gap-3 sm:flex-row sm:justify-between sm:gap-4">
        <div className="w-full min-w-0">
          <p className="truncate text-[13px] font-medium text-muted">{label}</p>
          {loading ? (
            <Skeleton className="mt-2 h-8 w-20" />
          ) : (
            <p className="mt-1 text-2xl font-bold tracking-tight text-fg tabular sm:text-3xl">{formatNumber(value)}</p>
          )}
        </div>
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-xl sm:size-12 sm:rounded-2xl [&_svg]:size-5 sm:[&_svg]:size-[22px]',
            iconClass,
          )}
        >
          {icon}
        </span>
      </div>
      <div className="mt-2 text-xs text-muted sm:mt-3 sm:truncate sm:text-[13px]">{loading ? <Skeleton className="h-3.5 w-24 sm:w-32" /> : sub}</div>
      {highlight && (
        <span className="absolute right-4 top-4 flex size-2.5" aria-hidden="true">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex size-2.5 rounded-full bg-amber-500" />
        </span>
      )}
    </Link>
  )
}

function GradientStat({
  label,
  value,
  icon,
  className,
  loading,
  to,
}: {
  label: string
  value: number | undefined
  icon: ReactNode
  className: string
  loading: boolean
  to: string
}) {
  return (
    <Link
      to={to}
      className={cn(
        'group relative overflow-hidden rounded-2xl bg-linear-to-br p-3.5 text-white shadow-lg transition-transform duration-200 hover:-translate-y-0.5 sm:p-5',
        className,
      )}
    >
      <div aria-hidden="true" className="absolute -right-6 -top-10 size-32 rounded-full bg-white/10" />
      <div className="relative flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-white/80 sm:text-[13px]">{label}</p>
          {loading ? (
            <Skeleton className="mt-2 h-8 w-12 bg-none! bg-white/25! sm:h-9 sm:w-16" />
          ) : (
            <p className="mt-1 text-2xl font-bold tracking-tight tabular sm:text-4xl">{formatNumber(value)}</p>
          )}
        </div>
        <span className="hidden size-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20 sm:flex">
          {icon}
        </span>
      </div>
    </Link>
  )
}

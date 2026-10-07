import { Link } from 'react-router'
import { useDashboard, useOrders, useWorkingHours } from '../../api/queries'
import type { DashboardData, OrderStatus } from '../../api/types'
import { useAuthed } from '../../auth/session'
import { BusinessLogo } from '../../components/BusinessLogo'
import { Money } from '../../components/badges'
import { IconCheckCircle, IconExternal } from '../../components/icons'
import { STATUS_KEYS, STATUS_TONES } from '../../components/statusMeta'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState, ErrorState } from '../../components/ui/States'
import { TONES } from '../../components/ui/styles'
import { useI18n } from '../../i18n/context'
import type { DictKey } from '../../i18n/dict'
import { cn } from '../../lib/cn'
import { formatNumber, weekdayShort } from '../../lib/format'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { statusDetail } from '../hours/hours'
import { OrderCard } from '../orders/OrderCard'

const TILES: Array<{ status: OrderStatus; label: DictKey; count: (data: DashboardData) => number }> = [
  { status: 'ordered', label: 'status_new_short', count: (data) => data.orders.new },
  { status: 'on_the_way', label: STATUS_KEYS.on_the_way, count: (data) => data.orders.on_the_way },
  { status: 'completed', label: STATUS_KEYS.completed, count: (data) => data.orders.completed },
]

/**
 * The home page on a phone: the business and whether it is open, today's money, how many orders are where, and the
 * new orders themselves — each with its next step one tap away.
 */
export function MobileHome() {
  const { t, tn, lang } = useI18n()
  const { business } = useAuthed()
  const dashboard = useDashboard()
  const hours = useWorkingHours().data
  const fresh = useOrders({ status: 'ordered', page: 1, page_size: 5 })
  useDocumentTitle(t('nav_home'), business.name)
  const data = dashboard.data
  // An order sent on from its card leaves the list at once (the cached list already has its new status).
  const waiting = fresh.data?.results.filter((order) => order.status === 'ordered')

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <BusinessLogo name={business.name} logo={business.logo} brandColor={business.brand_color} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold text-fg">{business.name}</h1>
          {hours && (
            <p
              className={cn(
                'flex items-center gap-1.5 text-[13px] font-medium',
                hours.open ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300',
              )}
            >
              <span className={cn('size-2 shrink-0 rounded-full', hours.open ? 'bg-emerald-500' : 'bg-rose-500')} />
              <span className="truncate">
                {hours.open ? t('hours_open_now') : t('hours_closed_now')}
                {hours.week && ` · ${statusDetail(hours, lang)}`}
              </span>
            </p>
          )}
        </div>
        {business.shop_url && (
          <a
            href={business.shop_url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('open_shop')}
            className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-card text-fg-soft transition-colors active:bg-subtle"
          >
            <IconExternal size={19} />
          </a>
        )}
      </header>

      {dashboard.error && !data ? (
        <Card>
          <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />
        </Card>
      ) : (
        <>
          <Card className="flex items-end justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-muted">{t('sales_revenue')}</p>
              {data ? (
                <Money value={data.today.revenue} className="mt-1 block truncate text-[28px] font-extrabold leading-tight tracking-tight text-fg" />
              ) : (
                <Skeleton className="mt-2 h-8 w-36" />
              )}
              <div className="mt-1.5 text-[13px] text-muted">
                {data ? `${t('today')} · ${tn('orders', data.today.orders)}` : <Skeleton className="h-3.5 w-28" />}
              </div>
            </div>
            {data && <WeekBars daily={data.daily} />}
          </Card>

          <div className="grid grid-cols-3 gap-2.5">
            {TILES.map((tile) => (
              <Link
                key={tile.status}
                to={`/orders?status=${tile.status}`}
                className="rounded-2xl border border-line bg-card p-3.5 shadow-card transition-colors active:bg-subtle"
              >
                <span className="flex items-center gap-1.5 text-[13px] font-semibold text-fg-soft">
                  <span className={cn('size-2 shrink-0 rounded-full', TONES[STATUS_TONES[tile.status]].dot)} />
                  <span className="truncate">{t(tile.label)}</span>
                </span>
                {data ? (
                  <span className="mt-2 block text-2xl font-extrabold text-fg tabular">{formatNumber(tile.count(data))}</span>
                ) : (
                  <Skeleton className="mt-2 h-7 w-10" />
                )}
              </Link>
            ))}
          </div>
        </>
      )}

      <section className="space-y-3" aria-labelledby="home-new-orders">
        <div className="flex items-center justify-between gap-3">
          <h2 id="home-new-orders" className="text-lg font-bold text-fg">
            {t('new_orders')}
          </h2>
          <Link to="/orders?status=ordered" className="py-2 text-sm font-semibold text-primary-700 dark:text-primary-300">
            {t('view_all')}
          </Link>
        </div>
        {waiting ? (
          waiting.length ? (
            waiting.map((order) => <OrderCard key={order.id} order={order} />)
          ) : (
            <Card>
              <EmptyState compact icon={<IconCheckCircle size={26} />} title={t('no_new_orders')} />
            </Card>
          )
        ) : fresh.error ? (
          <Card>
            <ErrorState error={fresh.error} onRetry={() => void fresh.refetch()} />
          </Card>
        ) : (
          Array.from({ length: 2 }, (_, index) => <Skeleton key={index} className="h-40 rounded-2xl" />)
        )}
      </section>
    </div>
  )
}

/** The last seven days' orders as little bars, today in the brand colour. */
function WeekBars({ daily }: { daily: DashboardData['daily'] }) {
  const { t, lang } = useI18n()
  const top = Math.max(1, ...daily.map((day) => day.count))
  return (
    <div className="flex shrink-0 items-end gap-1.5">
      <span className="sr-only">{`${t('orders_last_7_days')}: ${daily.map((day) => day.count).join(', ')}`}</span>
      {daily.map((day, index) => {
        const today = index === daily.length - 1
        return (
          <div key={day.date} className="flex flex-col items-center gap-1" aria-hidden="true">
            <div
              className={cn('w-3 rounded', today ? 'bg-primary-500' : 'bg-primary-200 dark:bg-primary-500/30')}
              style={{ height: `${Math.max(4, Math.round((day.count / top) * 44))}px` }}
            />
            <span className={cn('text-[10px] font-semibold', today ? 'text-primary-700 dark:text-primary-300' : 'text-faint')}>
              {weekdayShort(day.date, lang)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

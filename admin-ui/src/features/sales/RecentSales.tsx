import { Link } from 'react-router'
import type { SaleSummary } from '../../api/types'
import { Money, StatusBadge } from '../../components/badges'
import { IconArrowRight, IconReceipt } from '../../components/icons'
import { useI18n } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { formatDateTime, formatPhone } from '../../lib/format'

export function RecentSales({ sales, isFlashed }: { sales: SaleSummary[]; isFlashed: (key: string) => boolean }) {
  const { t, tn, lang } = useI18n()
  return (
    <section className="mt-6 rounded-3xl border border-line bg-card shadow-card" aria-labelledby="recent-title">
      <header className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 id="recent-title" className="text-[15px] font-semibold text-fg">
          {t('recent_sales')}
        </h2>
        <Link
          to="/orders?source=admin"
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary-600 hover:underline dark:text-primary-400"
        >
          {t('view_all')}
          <IconArrowRight size={14} />
        </Link>
      </header>
      {sales.length === 0 ? (
        <div className="flex flex-col items-center px-5 py-10 text-center">
          <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-subtle text-faint">
            <IconReceipt size={22} />
          </span>
          <p className="text-sm text-muted">{t('no_sales')}</p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {sales.map((sale) => (
            <li key={sale.id}>
              <Link
                to={`/orders/${sale.id}`}
                className={cn(
                  'flex items-center gap-4 px-5 py-3 transition-colors hover:bg-hover',
                  isFlashed(`sale-${sale.id}`) && 'line-flash',
                )}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-primary-500 to-primary-700 text-sm font-semibold text-white">
                  {(sale.name || '#').trim().charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">
                    <span className="tabular">#{sale.id}</span>
                    <span className="mx-1.5 text-faint">·</span>
                    {sale.name || '—'}
                  </p>
                  <p className="text-xs text-muted tabular">
                    {tn('items', sale.items_count)} · {formatPhone(sale.phone) || '—'}
                  </p>
                </div>
                <span className="hidden sm:inline-flex">
                  <StatusBadge status={sale.status} />
                </span>
                <div className="text-right">
                  <Money value={sale.total} className="block text-sm font-semibold text-fg" />
                  <p className="text-xs text-muted tabular">{formatDateTime(sale.created_at, lang)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

import { Link } from 'react-router'
import type { DashboardData } from '../../api/types'
import { Money } from '../../components/badges'
import { IconArrowRight, IconStore } from '../../components/icons'
import { Card, CardHeader } from '../../components/ui/Card'
import { useI18n } from '../../i18n/context'
import { cn } from '../../lib/cn'

/** The orders waiting for the head office to send them to a branch (dispatch mode), a tap away. */
export function UnassignedBanner({ count, className }: { count: number; className?: string }) {
  const { t, tn } = useI18n()
  return (
    <Link
      to="/orders?branch=none&status=ordered"
      className={cn(
        'flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3.5 shadow-card transition-colors hover:bg-amber-100 active:bg-amber-100',
        'dark:border-amber-500/40 dark:bg-amber-500/10 dark:hover:bg-amber-500/15',
        className,
      )}
    >
      <span className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
        <IconStore size={20} />
        <span className="absolute -right-1 -top-1 flex size-3" aria-hidden="true">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex size-3 rounded-full bg-amber-500 ring-2 ring-amber-50 dark:ring-slate-900" />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-amber-950 dark:text-amber-50">{tn('waiting_branch', count)}</span>
        <span className="block text-[13px] text-amber-800 dark:text-amber-200">{t('unassigned_cta')}</span>
      </span>
      <IconArrowRight size={18} className="shrink-0 text-amber-700 dark:text-amber-300" />
    </Link>
  )
}

/** Today per branch (the head office): its orders and money, the money as a bar; a row opens its orders. */
export function BranchesToday({ rows, className }: { rows: DashboardData['branches']; className?: string }) {
  const { t, tn } = useI18n()
  const top = Math.max(1, ...rows.map((row) => row.revenue))
  return (
    <Card className={className}>
      <CardHeader title={t('branches_today')} />
      <ul className="divide-y divide-line">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              to={`/orders?branch=${row.id}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-hover active:bg-subtle sm:px-5"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-300">
                <IconStore size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-fg">{row.name}</span>
                <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-subtle" aria-hidden="true">
                  <span
                    className="block h-full rounded-full bg-teal-500"
                    style={{ width: `${row.revenue > 0 ? Math.max(3, Math.round((row.revenue / top) * 100)) : 0}%` }}
                  />
                </span>
              </span>
              <span className="shrink-0 text-right leading-tight">
                <Money value={row.revenue} className="block font-semibold text-fg" />
                <span className="text-xs text-muted">{tn('orders', row.orders)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}

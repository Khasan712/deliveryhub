import type { ReactNode } from 'react'
import type { SalesStats } from '../../api/types'
import { IconBag, IconOrders, IconReceipt, IconWallet } from '../../components/icons'
import { useI18n } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { formatMoney, formatNumber } from '../../lib/format'

export function SalesKpis({ stats }: { stats: SalesStats }) {
  const { t, lang } = useI18n()
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <Kpi
        icon={<IconBag size={20} />}
        iconClass="bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-300"
        label={t('sales_today')}
        value={formatNumber(stats.count)}
        sub={t('sales_via_admin')}
      />
      <Kpi
        icon={<IconWallet size={20} />}
        iconClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300"
        label={t('sales_revenue')}
        value={formatMoney(stats.revenue, lang)}
        sub={t('sales_via_admin')}
      />
      <Kpi
        icon={<IconReceipt size={20} />}
        iconClass="bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300"
        label={t('sales_average')}
        value={formatMoney(stats.average, lang)}
        sub={t('sales_via_admin')}
      />
      <Kpi
        icon={<IconOrders size={20} />}
        iconClass="bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300"
        label={t('sales_all_orders')}
        value={formatNumber(stats.all_orders_today)}
        sub={t('sales_all_channels')}
      />
    </div>
  )
}

function Kpi({ icon, iconClass, label, value, sub }: { icon: ReactNode; iconClass: string; label: string; value: string; sub: string }) {
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-line bg-card p-4 shadow-card sm:px-5">
      <span className={cn('hidden size-11 shrink-0 items-center justify-center rounded-xl sm:flex', iconClass)}>{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-[12.5px] font-medium text-muted">{label}</p>
        <p className="truncate text-lg font-bold tracking-tight text-fg tabular sm:text-[22px]">{value}</p>
        <p className="truncate text-[11.5px] text-faint">{sub}</p>
      </div>
    </div>
  )
}

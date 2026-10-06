import type { BusinessDetail } from '../../api/types'
import { DashboardIcon, ExternalIcon, GlobeIcon, StoreIcon } from '../../components/icons'
import { Card } from '../../components/ui/Card'
import { CopyButton } from '../../components/ui/CopyButton'
import { hostOf } from '../../lib/format'

export function AddressesCard({ business }: { business: BusinessDetail }) {
  const rows = [
    { label: "Do'kon va Mini App", url: business.links.shop, icon: <StoreIcon size={18} /> },
    { label: 'Admin panel', url: business.links.admin, icon: <DashboardIcon size={18} /> },
  ]
  return (
    <Card title="Manzillar" titleId="business-addresses" icon={<GlobeIcon size={18} />}>
      <ul className="divide-y divide-slate-100">
        {rows.map((row) => (
          <li key={row.label} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
            <span className="flex items-center gap-2.5 font-semibold text-slate-800">
              <span className="text-slate-400">{row.icon}</span>
              {row.label}
            </span>
            <span className="flex min-w-0 items-center gap-1">
              <a
                href={row.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-w-0 items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1.5 font-mono text-[13px] font-semibold text-brand-700 transition hover:bg-brand-100"
              >
                <span className="truncate">{hostOf(row.url)}</span>
                <ExternalIcon size={13} className="shrink-0" />
                <span className="sr-only">(yangi oynada)</span>
              </a>
              <CopyButton text={row.url} iconOnly label={`${row.label} manzilini nusxalash`} variant="ghost" />
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

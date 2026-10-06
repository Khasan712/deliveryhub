import type { ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DashboardData, OrderStatus } from '../../api/types'
import { STATUS_COLORS, STATUS_KEYS } from '../../components/statusMeta'
import { useI18n } from '../../i18n/context'
import { formatDateLong, formatNumber, weekdayLong, weekdayShort } from '../../lib/format'

interface TooltipPayload {
  payload?: Record<string, unknown>
  value?: number
}

function ChartTooltip({
  active,
  payload,
  render,
}: {
  active?: boolean
  payload?: TooltipPayload[]
  render: (item: TooltipPayload) => ReactNode
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-line bg-card px-3 py-2 text-[13px] shadow-pop">{render(payload[0])}</div>
  )
}

export function StatusDonut({ data }: { data: DashboardData['by_status'] }) {
  const { t, tn } = useI18n()
  const rows = data.filter((row) => row.count > 0)
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  const label = (status: string) => {
    const key = STATUS_KEYS[status as OrderStatus]
    return key ? t(key) : status
  }

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
      <figure className="relative m-0 size-52 shrink-0">
        <figcaption className="sr-only">
          {t('orders_by_status')}: {rows.map((row) => `${label(row.status)} ${row.count}`).join(', ')}
        </figcaption>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 208, height: 208 }}>
          <PieChart>
            <Pie
              data={rows}
              dataKey="count"
              nameKey="status"
              innerRadius="68%"
              outerRadius="100%"
              paddingAngle={rows.length > 1 ? 2.5 : 0}
              cornerRadius={6}
              stroke="none"
              isAnimationActive
              animationDuration={700}
            >
              {rows.map((row) => (
                <Cell key={row.status} fill={STATUS_COLORS[row.status] ?? '#94a3b8'} />
              ))}
            </Pie>
            <Tooltip
              cursor={false}
              content={
                <ChartTooltip
                  render={(item) => (
                    <span className="font-medium text-fg">
                      {label(String(item.payload?.status))}: <b className="tabular">{formatNumber(item.value)}</b>
                    </span>
                  )}
                />
              }
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
          <span className="text-3xl font-bold tracking-tight text-fg tabular">{formatNumber(total)}</span>
          <span className="text-xs font-medium text-muted">{t('chart_total')}</span>
        </div>
      </figure>

      <ul className="w-full min-w-0 flex-1 space-y-2.5">
        {data.map((row) => {
          const share = total ? Math.round((row.count / total) * 100) : 0
          return (
            <li key={row.status} className="flex items-center gap-3 text-sm">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: STATUS_COLORS[row.status] ?? '#94a3b8' }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-fg-soft">{label(row.status)}</span>
              <span className="font-semibold text-fg tabular" title={tn('orders', row.count)}>
                {formatNumber(row.count)}
              </span>
              <span className="w-10 text-right text-xs text-muted tabular">{share}%</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function DailyBars({ data }: { data: DashboardData['daily'] }) {
  const { lang, tn } = useI18n()
  const max = Math.max(...data.map((row) => row.count), 0)

  return (
    <figure className="m-0 h-64 text-muted">
      <figcaption className="sr-only">
        {data.map((row) => `${formatDateLong(row.date, lang)}: ${row.count}`).join(', ')}
      </figcaption>
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 520, height: 256 }}>
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="dailyBar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fb923c" />
              <stop offset="100%" stopColor="#ea580c" />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.12} strokeDasharray="4 4" />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            tick={{ fill: 'currentColor', fontSize: 12 }}
            tickFormatter={(value: string) => weekdayShort(value, lang)}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            width={44}
            tick={{ fill: 'currentColor', fontSize: 12 }}
            domain={[0, Math.max(4, max)]}
          />
          <Tooltip
            cursor={{ fill: 'currentColor', fillOpacity: 0.06, radius: 10 } as object}
            content={
              <ChartTooltip
                render={(item) => {
                  const date = String(item.payload?.date ?? '')
                  return (
                    <>
                      <p className="text-xs text-muted">
                        {weekdayLong(date, lang)}, {formatDateLong(date, lang)}
                      </p>
                      <p className="mt-0.5 font-semibold text-fg">{tn('orders', Number(item.value ?? 0))}</p>
                    </>
                  )
                }}
              />
            }
          />
          <Bar dataKey="count" fill="url(#dailyBar)" radius={[8, 8, 3, 3]} maxBarSize={44} animationDuration={700} />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  )
}

import { Link } from 'react-router'
import type { OrderSummary } from '../../api/types'
import { Money, StatusBadge } from '../../components/badges'
import { IconBag, IconMapPin, IconPhone } from '../../components/icons'
import { SOURCE_KEYS } from '../../components/statusMeta'
import { Spinner } from '../../components/ui/Spinner'
import { buttonClass } from '../../components/ui/styles'
import { useI18n } from '../../i18n/context'
import { formatDateTime, formatPhone, phoneHref } from '../../lib/format'
import { nextStatus, nextStatusLabel, useStatusChange } from './orderFlow'

/**
 * An order on a phone: who, what, where and how much at a glance, a call button, and its next step («Yo'lga
 * chiqarish», «Yetkazildi», «Bajarildi») without opening it.
 */
export function OrderCard({ order }: { order: OrderSummary }) {
  const { t, name, lang } = useI18n()
  const delivery = order.delivery_type === 'delivery'
  const what = order.lines.map((line) => `${line.quantity}× ${name(line)}`).join(', ')

  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
      <Link to={`/orders/${order.id}`} className="block px-4 pb-3 pt-3.5 transition-colors active:bg-subtle">
        <span className="flex items-center gap-2">
          <span className="font-bold text-fg tabular">#{order.id}</span>
          <time dateTime={order.created_at} className="text-[13px] text-muted tabular">
            {formatDateTime(order.created_at, lang)}
          </time>
          <span className="ml-auto shrink-0">
            <StatusBadge status={order.status} size="xs" />
          </span>
        </span>
        <span className="mt-1.5 block truncate text-[15px] font-semibold text-fg">
          {order.customer_name || t('nameless_customer')}
          <span className="font-normal text-muted"> · {t(SOURCE_KEYS[order.source])}</span>
        </span>
        {what && <span className="mt-0.5 block truncate text-sm text-fg-soft">{what}</span>}
        {order.delivery_type && (
          <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] text-muted">
            {delivery ? <IconMapPin size={15} className="shrink-0" /> : <IconBag size={15} className="shrink-0" />}
            <span className="truncate">{delivery ? order.address || t('delivery') : t('pickup')}</span>
          </span>
        )}
      </Link>
      <div className="flex items-center gap-2 border-t border-line py-2.5 pl-4 pr-3">
        <p className="min-w-0 flex-1 leading-tight">
          <Money value={order.total} className="block truncate font-bold text-fg" />
          {order.payment_method && <span className="text-xs text-muted">{t(order.payment_method)}</span>}
        </p>
        {order.phone && (
          <a
            href={phoneHref(order.phone)}
            aria-label={`${t('call_customer')}: ${formatPhone(order.phone)}`}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-line text-fg-soft transition-colors active:bg-subtle"
          >
            <IconPhone size={19} />
          </a>
        )}
        <NextStep order={order} />
      </div>
    </article>
  )
}

function NextStep({ order }: { order: OrderSummary }) {
  const { t } = useI18n()
  const { change, busy } = useStatusChange({ ...order, notify: !!order.client_id })
  const next = nextStatus(order)
  const label = nextStatusLabel(order)
  if (!next || !label) return null
  return (
    <button
      type="button"
      className={buttonClass('primary', 'md', 'h-11 px-4')}
      disabled={busy}
      onClick={() => void change(next)}
      aria-label={`${t(label)}: #${order.id}`}
    >
      {busy && <Spinner size={16} />}
      {t(label)}
    </button>
  )
}

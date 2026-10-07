import { Link } from 'react-router'
import { Icon } from '../../components/Icon'
import { StatusPill } from '../../components/OrderStatus'
import { useI18n } from '../../i18n/i18n'
import { useAuth } from '../../state/auth'
import { statusIcon, statusText } from '../../state/orderStatus'
import { isActiveOrder, useOrders } from '../../state/orders'

/**
 * An order still on its way, on top of the menu: whether it went through and where it is, without looking for it
 * (the list refreshes itself while an order is active). Several: the newest, and how many more.
 */
export function ActiveOrder() {
  const { t } = useI18n()
  const { token } = useAuth()
  const orders = useOrders({ poll: true })
  const active = token ? (orders.data?.filter(isActiveOrder) ?? []) : []
  const order = active[0]
  if (!order) return null

  return (
    <Link
      to={`/orders/${order.id}`}
      className="flex animate-rise-in items-center gap-3 rounded-[18px] border border-[color-mix(in_srgb,var(--brand)_30%,var(--line))] bg-surface py-2.5 pr-3 pl-2.5 shadow-sm transition-transform active:scale-[0.99]"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-brand-soft text-brand-text">
        <Icon name={statusIcon(order)} className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-extrabold">
          {t('orderNo', { id: order.id })}
          {active.length > 1 && <span className="font-bold text-muted"> · +{active.length - 1}</span>}
        </span>
        <span className="block truncate text-[12.5px] font-semibold text-muted">{statusText(order, t)}</span>
      </span>
      <StatusPill order={order} />
      <Icon name="chevron-right" className="size-4 shrink-0 text-muted" />
    </Link>
  )
}

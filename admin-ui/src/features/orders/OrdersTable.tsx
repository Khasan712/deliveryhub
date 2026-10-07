import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { OrderSummary } from '../../api/types'
import { Money, SourceBadge, StatusBadge } from '../../components/badges'
import { IconOrders } from '../../components/icons'
import { Avatar } from '../../components/ui/Avatar'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { EmptyState } from '../../components/ui/States'
import { useI18n } from '../../i18n/context'
import { formatDateTime, formatFullDateTime, formatPhone } from '../../lib/format'
import { OrderCard } from './OrderCard'

type ColumnKey = 'id' | 'customer' | 'phone' | 'items' | 'total' | 'status' | 'date'

interface OrdersTableProps {
  orders: OrderSummary[] | undefined
  loading?: boolean
  fetching?: boolean
  error?: unknown
  onRetry?: () => void
  empty?: ReactNode
  hide?: ColumnKey[]
  skeletonRows?: number
  caption: string
  footer?: ReactNode
  /** The phone's cards: separate, with gaps; their container adds its own padding when it needs it. */
  mobileListClassName?: string
}

export function OrdersTable({
  orders,
  loading,
  fetching,
  error,
  onRetry,
  empty,
  hide = [],
  skeletonRows,
  caption,
  footer,
  mobileListClassName = 'space-y-3',
}: OrdersTableProps) {
  const { t, tn, lang } = useI18n()

  const columns: Array<Column<OrderSummary> & { key: ColumnKey }> = [
    {
      key: 'id',
      header: t('order_id'),
      skeleton: 'w-12',
      cell: (order) => (
        <Link
          to={`/orders/${order.id}`}
          className="font-semibold text-fg tabular hover:text-primary-600 focus-visible:text-primary-600 dark:hover:text-primary-400"
        >
          #{order.id}
        </Link>
      ),
    },
    {
      key: 'customer',
      header: t('client'),
      skeleton: 'w-40',
      cell: (order) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={order.customer_name || '?'} size="sm" />
          <div className="min-w-0">
            <p className="max-w-56 truncate font-medium text-fg">{order.customer_name || '—'}</p>
            <div className="mt-0.5">
              <SourceBadge source={order.source} />
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'phone',
      header: t('phone'),
      hideBelow: 'lg',
      skeleton: 'w-28',
      cell: (order) => <span className="whitespace-nowrap text-muted tabular">{formatPhone(order.phone) || '—'}</span>,
    },
    {
      key: 'items',
      header: t('items'),
      hideBelow: 'xl',
      skeleton: 'w-10',
      cell: (order) => <span className="whitespace-nowrap text-fg-soft">{tn('pieces', order.items_count)}</span>,
    },
    {
      key: 'total',
      header: t('total'),
      align: 'right',
      skeleton: 'w-20',
      cell: (order) => <Money value={order.total} className="whitespace-nowrap font-semibold text-fg" />,
    },
    {
      key: 'status',
      header: t('status'),
      skeleton: 'w-24',
      cell: (order) => <StatusBadge status={order.status} />,
    },
    {
      key: 'date',
      header: t('created'),
      hideBelow: 'sm',
      skeleton: 'w-28',
      cell: (order) => (
        <time
          dateTime={order.created_at}
          title={formatFullDateTime(order.created_at, lang)}
          className="whitespace-nowrap text-muted tabular"
        >
          {formatDateTime(order.created_at, lang)}
        </time>
      ),
    },
  ]

  return (
    <DataTable
      caption={caption}
      columns={columns.filter((column) => !hide.includes(column.key))}
      rows={orders}
      rowKey={(order) => order.id}
      rowHref={(order) => `/orders/${order.id}`}
      loading={loading}
      fetching={fetching}
      error={error}
      onRetry={onRetry}
      skeletonRows={skeletonRows}
      footer={footer}
      empty={empty ?? <EmptyState icon={<IconOrders size={26} />} title={t('no_orders')} />}
      mobileCard={(order) => <OrderCard order={order} />}
      mobileListClassName={mobileListClassName}
    />
  )
}

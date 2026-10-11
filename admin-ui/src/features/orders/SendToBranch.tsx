import type { BranchRef, OrderSummary } from '../../api/types'
import { useAuthed } from '../../auth/session'
import { IconMap, IconSend, IconStore } from '../../components/icons'
import { Badge } from '../../components/ui/Badge'
import { ButtonLink } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { buttonClass, type ButtonSize } from '../../components/ui/styles'
import { useI18n } from '../../i18n/context'
import { branchVars, formatDistance } from '../../lib/branches'
import { cn } from '../../lib/cn'
import { useSendToBranch, waitsForBranch } from './dispatch'

/** «Chilonzorga yuborish» in one tap: the order goes to that branch, whose staff are told in Telegram. */
export function SendToBranchButton({
  orderId,
  branch,
  size = 'md',
  className,
}: {
  orderId: number
  branch: BranchRef
  size?: ButtonSize
  className?: string
}) {
  const { t } = useI18n()
  const { send, busy } = useSendToBranch(orderId)
  const label = t('send_to_branch', branchVars(branch.name))
  return (
    <button
      type="button"
      className={buttonClass('primary', size, cn('min-w-0', className))}
      disabled={busy}
      onClick={() => send(branch)}
      aria-label={`${label}: #${orderId}`}
    >
      {busy ? <Spinner size={16} /> : <IconSend size={16} className="shrink-0" />}
      <span className="truncate">{label}</span>
    </button>
  )
}

/** The branch column of the orders table (the head office): the branch, or the nearest one to send it to. */
export function BranchCell({ order }: { order: OrderSummary }) {
  const { t, lang } = useI18n()
  const { dispatch } = useAuthed()
  if (order.branch) {
    return (
      <span className="inline-flex max-w-44 items-center gap-1.5 font-medium text-fg-soft">
        <IconStore size={15} className="shrink-0 text-teal-600 dark:text-teal-300" />
        <span className="truncate">{order.branch.name}</span>
      </span>
    )
  }
  if (!waitsForBranch(order, dispatch)) return <span className="text-faint">—</span>
  const suggested = order.suggested_branch
  if (!suggested) {
    return (
      <Badge tone="amber" dot>
        {t('branch_none')}
      </Badge>
    )
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <SendToBranchButton orderId={order.id} branch={suggested} size="xs" className="max-w-52" />
      <span className="text-xs text-muted tabular">
        {t('branch_nearest')} · {formatDistance(suggested.distance_km, lang)}
      </span>
    </div>
  )
}

/**
 * A phone's order card, in dispatch mode, while the order has no branch: what is missing, the nearest branch and
 * sending it there in one tap (the map with every branch is on the order's page).
 */
export function DispatchStrip({ order }: { order: OrderSummary }) {
  const { t, lang } = useI18n()
  const suggested = order.suggested_branch
  return (
    <div className="border-t border-amber-200 bg-amber-50/70 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-500/10">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-amber-900 dark:text-amber-100">
        <IconStore size={15} className="shrink-0" />
        {t('branch_none')}
      </p>
      {suggested && (
        <p className="mt-0.5 truncate text-[13px] text-amber-800 dark:text-amber-200">
          {t('branch_nearest_is', { name: suggested.name, distance: formatDistance(suggested.distance_km, lang) })}
        </p>
      )}
      <div className="mt-2.5 flex gap-2">
        {suggested ? (
          <>
            <SendToBranchButton orderId={order.id} branch={suggested} className="h-11 flex-1" />
            <ButtonLink
              to={`/orders/${order.id}`}
              variant="secondary"
              size="icon"
              className="size-11"
              aria-label={`${t('choose_branch')}: #${order.id}`}
              title={t('choose_branch')}
            >
              <IconMap size={19} />
            </ButtonLink>
          </>
        ) : (
          <ButtonLink to={`/orders/${order.id}`} variant="secondary" className="h-11 flex-1" icon={<IconMap size={18} />}>
            {t('choose_branch')}
          </ButtonLink>
        )}
      </div>
    </div>
  )
}

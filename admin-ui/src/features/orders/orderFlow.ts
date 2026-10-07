import { useState } from 'react'
import { errorMessage } from '../../api/errors'
import { useUpdateOrderStatus } from '../../api/queries'
import type { DeliveryType, OrderStatus } from '../../api/types'
import { useConfirm, useToast } from '../../components/feedback/feedback'
import { useI18n } from '../../i18n/context'
import type { DictKey } from '../../i18n/dict'

interface Flow {
  status: OrderStatus
  delivery_type: DeliveryType | ''
}

/** The usual next step: a delivery goes on its way first, a pickup is simply handed over. */
export function nextStatus(order: Flow): OrderStatus | null {
  if (order.status === 'ordered') return order.delivery_type === 'pickup' ? 'completed' : 'on_the_way'
  if (order.status === 'on_the_way') return 'completed'
  return null
}

/** The button for that step: «Yo'lga chiqarish», «Yetkazildi», «Bajarildi». */
export function nextStatusLabel(order: Flow): DictKey | null {
  const next = nextStatus(order)
  if (next === 'on_the_way') return 'action_send'
  if (next === 'completed') return order.status === 'on_the_way' ? 'action_delivered' : 'action_done'
  return null
}

/** The steps of the order's progress line (a pickup is never on its way). */
export function statusSteps(order: Flow): OrderStatus[] {
  return order.delivery_type === 'pickup' && order.status !== 'on_the_way'
    ? ['ordered', 'completed']
    : ['ordered', 'on_the_way', 'completed']
}

/**
 * Changes an order's status from its page or from its card in a list: asks before rejecting, says it worked.
 * `notify` — the customer is told in Telegram (an order with a customer account).
 */
export function useStatusChange(order: Flow & { id: number; notify: boolean }) {
  const { t } = useI18n()
  const toast = useToast()
  const confirm = useConfirm()
  const update = useUpdateOrderStatus(order.id)
  const [pending, setPending] = useState<OrderStatus | null>(null)

  const change = async (status: OrderStatus) => {
    if (status === order.status || update.isPending) return
    if (status === 'rejected') {
      const ok = await confirm({
        title: t('reject_confirm_title'),
        message: t('reject_confirm_text'),
        confirmLabel: t('reject_confirm'),
        cancelLabel: t('back'),
      })
      if (!ok) return
    }
    setPending(status)
    update.mutate(status, {
      onSuccess: () =>
        toast.success(t('status_updated'), { description: order.notify ? t('customer_notified') : undefined }),
      onError: (error) => toast.error(errorMessage(error, t)),
      onSettled: () => setPending(null),
    })
  }

  return { change, pending, busy: update.isPending }
}

import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { isApiError } from '../../api/client'
import { errorMessage } from '../../api/errors'
import { queryKeys, useSetOrderBranch } from '../../api/queries'
import type { BranchRef, OrderDetail, OrderStatus } from '../../api/types'
import { useConfirm, useToast } from '../../components/feedback/feedback'
import { useI18n } from '../../i18n/context'

/**
 * In dispatch mode a new order without a branch waits for the head office to send it to one (the dashboard's
 * `unassigned`, the orders page's «Filial tanlanmagan»). An order moved on or finished without one can still be sent
 * from its page.
 */
export function waitsForBranch(order: { branch: BranchRef | null; status: OrderStatus }, dispatch: boolean): boolean {
  return dispatch && !order.branch && order.status === 'ordered'
}

/**
 * Sends an order to a branch (or moves it to another one) and says so: the branch's staff are told in Telegram.
 * A branch stopped meanwhile refreshes the order and the lists.
 */
export function useSendToBranch(orderId: number | string) {
  const { t } = useI18n()
  const toast = useToast()
  const client = useQueryClient()
  const mutation = useSetOrderBranch(orderId)

  const send = (branch: BranchRef, moved = false) =>
    mutation.mutate(branch.id, {
      onSuccess: () =>
        toast.success(t(moved ? 'dispatch_moved' : 'dispatch_sent', { name: branch.name }), { description: t('dispatch_told') }),
      onError: (error) => {
        if (isApiError(error, 'validation') && error.fields.branch_id) {
          toast.error(t('dispatch_inactive'))
          void client.invalidateQueries({ queryKey: queryKeys.orders })
          return
        }
        toast.error(errorMessage(error, t))
      },
    })

  return { send, busy: mutation.isPending }
}

/**
 * The branch chosen on an order's page: its current one, else the nearest, else the first; chosen again from scratch
 * once the order gets another branch. `send` asks first when the order already has a branch.
 */
export function useBranchChoice(order: OrderDetail) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const { send: sendTo, busy } = useSendToBranch(order.id)
  const options = order.branch_options ?? []
  const current = order.branch?.id ?? null
  const preferred = current ?? options.find((option) => option.nearest)?.id ?? options[0]?.id ?? null

  const key = `${order.id}:${current ?? ''}`
  const [picked, setPicked] = useState({ key, id: preferred })
  if (picked.key !== key) setPicked({ key, id: preferred })
  const chosen = picked.key === key ? picked.id : preferred
  const selected = options.some((option) => option.id === chosen) ? chosen : preferred
  const target = options.find((option) => option.id === selected) ?? null

  const send = async () => {
    if (!target || target.id === current || busy) return
    if (order.branch) {
      const ok = await confirm({
        title: t('dispatch_move_title', { name: target.name }),
        message: t('dispatch_move_text', { from: order.branch.name, name: target.name }),
        confirmLabel: t('dispatch_move_confirm'),
        cancelLabel: t('back'),
        tone: 'primary',
      })
      if (!ok) return
    }
    sendTo(target, current !== null)
  }

  return {
    options,
    current,
    selected,
    target,
    select: (id: number) => setPicked({ key, id }),
    send,
    busy,
    /** A branch other than the current one is chosen. */
    ready: !!target && target.id !== current,
  }
}

export type BranchChoice = ReturnType<typeof useBranchChoice>

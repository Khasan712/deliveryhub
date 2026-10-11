import { isApiError } from '../../api/client'
import { errorMessage } from '../../api/errors'
import { useDeleteBranch, useSaveBranch } from '../../api/queries'
import type { Branch } from '../../api/types'
import { useConfirm, useToast } from '../../components/feedback/feedback'
import { IconPower } from '../../components/icons'
import { useI18n } from '../../i18n/context'

const POWER_ICON = (
  <span className="flex size-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20">
    <IconPower size={24} />
  </span>
)

/**
 * Stopping, restarting and deleting a branch (the list and the form): stopping asks first; a branch with orders or
 * staff cannot be deleted (`409 branch_in_use`) — then it offers to stop it instead.
 */
export function useBranchActions() {
  const { t } = useI18n()
  const toast = useToast()
  const confirm = useConfirm()
  const save = useSaveBranch()
  const remove = useDeleteBranch()

  const deactivate = (branch: Pick<Branch, 'id' | 'name'>, title = t('branch_deactivate_title', { name: branch.name }), message = t('branch_deactivate_text')) =>
    confirm({
      title,
      message,
      confirmLabel: t('branch_deactivate'),
      tone: 'primary',
      icon: POWER_ICON,
      onConfirm: async () => {
        await save.mutateAsync({ id: branch.id, body: { is_active: false } })
        toast.success(t('branch_deactivated', { name: branch.name }))
      },
    })

  const setActive = (branch: Pick<Branch, 'id' | 'name' | 'is_active'>, active: boolean) => {
    if (!active) return void deactivate(branch)
    save.mutate(
      { id: branch.id, body: { is_active: true } },
      {
        onSuccess: () => toast.success(t('branch_activated', { name: branch.name })),
        onError: (error) => toast.error(errorMessage(error, t)),
      },
    )
  }

  /** Resolves `true` once the branch is gone. */
  const askDelete = async (branch: Pick<Branch, 'id' | 'name' | 'is_active'>): Promise<boolean> => {
    let inUse = false
    const ok = await confirm({
      title: t('delete_branch'),
      message: t('delete_branch_confirm', { name: branch.name }),
      confirmLabel: t('yes_delete'),
      onConfirm: async () => {
        try {
          await remove.mutateAsync(branch.id)
        } catch (error) {
          if (!isApiError(error, 'branch_in_use')) throw error
          inUse = true
        }
      },
    })
    if (!ok) return false
    if (!inUse) {
      toast.success(t('branch_deleted'))
      return true
    }
    if (branch.is_active) await deactivate(branch, t('branch_in_use_title'), t('branch_in_use_text'))
    else toast.info(t('branch_in_use_title'), { description: t('branch_in_use_inactive') })
    return false
  }

  /** The id of the branch being restarted right now (its button waits). */
  const pendingId = save.isPending ? save.variables?.id : undefined

  return { setActive, askDelete, pendingId }
}

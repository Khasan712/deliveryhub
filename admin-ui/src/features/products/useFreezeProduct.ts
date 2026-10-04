import { errorMessage } from '../../api/errors'
import { useFreezingIds, useSetProductFrozen } from '../../api/queries'
import { useToast } from '../../components/feedback/feedback'
import { useI18n } from '../../i18n/context'

/** What freezing needs to know about a product (a catalog product or a point-of-sale one). */
export interface FreezableProduct {
  id: number
  name_uz: string
  name_ru: string
}

/**
 * Freezes a product (sold out for now) or returns it to sale with immediate feedback: every screen changes at once
 * (optimistic update), then a toast confirms it and offers to undo.
 */
export function useFreezeProduct() {
  const { t, name } = useI18n()
  const toast = useToast()
  const { mutateAsync } = useSetProductFrozen()
  const pending = useFreezingIds()

  // A promise per call: quick taps on several products each get their own toast.
  function setFrozen(product: FreezableProduct, frozen: boolean, undoable = true) {
    void mutateAsync({ id: product.id, frozen }).then(
      () => {
        toast.success(t(frozen ? 'product_frozen' : 'product_unfrozen', { name: name(product) }), {
          description: t(frozen ? 'product_frozen_text' : 'product_unfrozen_text'),
          action: undoable ? { label: t('undo_action'), onClick: () => setFrozen(product, !frozen, false) } : undefined,
        })
      },
      (error: unknown) => {
        toast.error(errorMessage(error, t))
      },
    )
  }

  return { setFrozen, isPending: (id: number) => pending.includes(id) }
}

import type { SalesProduct } from '../../api/types'
import { IconSnowflake, IconUndo } from '../../components/icons'
import { Button } from '../../components/ui/Button'
import { Callout } from '../../components/ui/States'
import { useI18n } from '../../i18n/context'
import { useFreezeProduct } from '../products/useFreezeProduct'

/**
 * Frozen products in the order being built. Customers cannot order them right now, but staff may still sell them:
 * a calm warning (never a blocker) with a one-tap «Sotuvga qaytarish» per product.
 */
export function FrozenNotice({ products }: { products: SalesProduct[] }) {
  const { t, name } = useI18n()
  const { setFrozen, isPending } = useFreezeProduct()

  const unfreezeButton = (product: SalesProduct) => (
    <Button
      variant="secondary"
      size="xs"
      icon={<IconUndo size={14} />}
      aria-label={`${t('unfreeze')}: ${name(product)}`}
      aria-disabled={isPending(product.id) || undefined}
      onClick={() => {
        if (!isPending(product.id)) setFrozen(product, false)
      }}
    >
      {t('unfreeze')}
    </Button>
  )

  // The live region stays in the page, so screen readers announce the warning when it appears.
  return (
    <div aria-live="polite">
      {products.length > 0 && (
        <Callout
          tone="warning"
          className="mx-3 mb-3 animate-fade-in"
          icon={
            <span className="flex size-7 items-center justify-center rounded-full bg-sky-500 text-white shadow-sm shadow-sky-500/30">
              <IconSnowflake size={15} strokeWidth={2.4} />
            </span>
          }
        >
          {products.length === 1 ? (
            <>
              <p className="font-semibold">
                {t('pos_frozen_one')}: {name(products[0])}
              </p>
              <p className="mt-0.5 text-[13px] leading-snug opacity-90">{t('pos_frozen_text_one')}</p>
              <div className="mt-2.5">{unfreezeButton(products[0])}</div>
            </>
          ) : (
            <>
              <p className="font-semibold">{t('pos_frozen_many')}</p>
              <p className="mt-0.5 text-[13px] leading-snug opacity-90">{t('pos_frozen_text_many')}</p>
              <ul className="mt-2.5 space-y-1.5">
                {products.map((product) => (
                  <li key={product.id} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate font-medium">{name(product)}</span>
                    {unfreezeButton(product)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Callout>
      )}
    </div>
  )
}

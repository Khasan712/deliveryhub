import { IconSnowflake } from '../../components/icons'
import { Button } from '../../components/ui/Button'
import { useI18n } from '../../i18n/context'
import type { FreezableProduct } from './useFreezeProduct'

interface FreezeButtonProps {
  product: FreezableProduct & { frozen: boolean }
  onToggle: (product: FreezableProduct, frozen: boolean) => void
  /** The request for this product is still running (taps are ignored, focus stays). */
  pending?: boolean
}

/**
 * «Muzlatish» / «Sotuvga qaytarish» in one tap, next to the other row actions: a snowflake that is lit while the
 * product is frozen.
 */
export function FreezeButton({ product, onToggle, pending }: FreezeButtonProps) {
  const { t, name } = useI18n()
  const { frozen } = product
  const label = frozen ? t('unfreeze') : t('freeze')
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`${label}: ${name(product)}`}
      aria-disabled={pending || undefined}
      title={label}
      onClick={() => {
        if (!pending) onToggle(product, !frozen)
      }}
      className={
        frozen
          ? 'bg-sky-50 text-sky-600 ring-1 ring-sky-200 hover:bg-sky-100 hover:text-sky-700 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30 dark:hover:bg-sky-500/20 dark:hover:text-sky-200'
          : 'hover:bg-sky-50 hover:text-sky-700 dark:hover:bg-sky-500/10 dark:hover:text-sky-300'
      }
    >
      <IconSnowflake size={17} />
    </Button>
  )
}

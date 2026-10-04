import { useEffect, useState } from 'react'
import type { Product } from '../../api/types'
import { Button, IconButton } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { ProductImage } from '../../components/ProductImage'
import { Sheet, SheetFooter } from '../../components/Sheet'
import { useSheet } from '../../components/sheet-context'
import { Stepper } from '../../components/Stepper'
import { useI18n } from '../../i18n/i18n'
import { cn } from '../../lib/cn'
import { haptic, isTelegram } from '../../lib/telegram'
import { HIDE_MAIN_BUTTON, MAIN_BUTTON_SHEET, useMainButton } from '../../lib/useTelegram'
import { MAX_QTY, useCart } from '../../state/cart'
import { useCatalog } from '../../state/catalog'
import { useNav } from '../../state/nav'
import { useToast } from '../../state/toast'

export function ProductSheet() {
  const { sheet, closeSheet } = useNav()
  const { productsById, popular, status } = useCatalog()
  const requestedId = sheet?.type === 'product' ? sheet.id : null
  const [shownId, setShownId] = useState<number | null>(requestedId)
  if (requestedId !== null && requestedId !== shownId) setShownId(requestedId)

  const product = shownId !== null ? productsById.get(shownId) : undefined
  const open = requestedId !== null && product !== undefined

  // A product that is not in the menu (any more) cannot be shown — drop the sheet entry.
  useEffect(() => {
    if (requestedId !== null && status === 'ready' && !productsById.has(requestedId)) closeSheet()
  }, [requestedId, status, productsById, closeSheet])

  return (
    <Sheet open={open} onClose={closeSheet} wide>
      {product && (
        <ProductDetails
          key={product.id}
          product={product}
          open={open}
          top={popular.some((item) => item.id === product.id)}
          onDone={closeSheet}
        />
      )}
    </Sheet>
  )
}

interface ProductDetailsProps {
  product: Product
  open: boolean
  top: boolean
  onDone: () => void
}

function ProductDetails({ product, open, top, onDone }: ProductDetailsProps) {
  const { t, name, desc, unit, money } = useI18n()
  const cart = useCart()
  const toast = useToast()
  const { close, titleId, dragProps } = useSheet()
  const inTelegram = isTelegram()
  const inCart = cart.quantity(product.id)
  const [qty, setQty] = useState(() => Math.max(1, inCart))
  const title = name(product)
  const description = desc(product)
  const unitName = unit(product)
  const removing = inCart > 0 && qty === 0
  // The page button is narrow next to the stepper ("Qo‘shish"); the Telegram MainButton is not.
  const label = removing ? t('removeFromCart') : inCart ? t('update') : t('add')
  const mainLabel = removing || inCart ? label : t('addToCart')
  const min = inCart > 0 ? 0 : 1

  const confirm = () => {
    cart.setQuantity(product.id, qty)
    haptic(removing ? 'select' : 'light')
    if (!inCart) toast(t('addedToCart'), { type: 'success' })
    else if (removing) toast(t('removedFromCart'))
    onDone()
  }

  const remove = () => {
    cart.setQuantity(product.id, 0)
    haptic('select')
    toast(t('removedFromCart'))
    onDone()
  }

  // A product that is not available right now cannot be added (one already in the cart can be taken out).
  const frozenAction = inCart > 0 ? { text: t('removeFromCart'), onClick: remove } : HIDE_MAIN_BUTTON
  useMainButton(
    open
      ? product.frozen
        ? frozenAction
        : { text: removing ? mainLabel : `${mainLabel} · ${money(product.price * qty)}`, onClick: confirm }
      : null,
    MAIN_BUTTON_SHEET,
  )

  return (
    <>
      <div className="absolute top-3.5 right-3.5 z-10">
        <IconButton icon="x" label={t('close')} variant="glass" onClick={close} className="size-10! rounded-full!" />
      </div>
      {/* Phones: photo and text scroll together. Wider screens: photo on the left, text on the right. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain md:flex md:overflow-hidden">
        <div className="relative aspect-[4/3] w-full bg-surface-2 sm:aspect-[16/10] md:aspect-auto md:min-h-[400px] md:w-[46%] md:shrink-0">
          <ProductImage
            src={product.image}
            name={title}
            alt={title}
            eager
            className={cn('size-full', product.frozen && '[&_img]:grayscale [&_img]:opacity-70')}
            letterClassName="text-6xl"
          />
          <div className="absolute inset-x-0 top-0 flex h-7 touch-none justify-center pt-2.5 sm:hidden" {...dragProps}>
            <div className="h-[5px] w-[42px] rounded-full bg-white/75 shadow-sm" />
          </div>
          {top && (
            <span className="absolute top-3.5 left-3.5 inline-flex h-7 items-center gap-1 rounded-full bg-white/94 px-2.5 text-xs font-extrabold text-[#16161a] shadow-sm">
              <Icon name="flame" className="size-3.5 fill-current text-brand" strokeWidth={1.5} />
              {t('top')}
            </span>
          )}
        </div>
        <div className="px-5 pt-[18px] pb-5 md:min-w-0 md:flex-1 md:overflow-y-auto md:px-7 md:pt-8 md:pr-16">
          <h2 id={titleId} className="text-2xl leading-tight font-extrabold tracking-[-0.03em] md:text-[26px]">
            {title}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <span className="tabular text-xl font-extrabold tracking-[-0.02em] text-brand-text">{money(product.price)}</span>
            {unitName && (
              <span className="inline-flex h-[26px] items-center rounded-full bg-surface-2 px-2.5 text-[12.5px] font-bold text-ink-2">
                {t('perUnit', { unit: unitName })}
              </span>
            )}
          </div>
          {description && <p className="mt-3.5 text-[15px] leading-relaxed whitespace-pre-line text-ink-2">{description}</p>}
        </div>
      </div>
      <SheetFooter>
        {product.frozen ? (
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="flex min-w-[200px] flex-1 items-start gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-[13.5px] font-bold text-ink-2">
              <Icon name="ban" className="mt-px size-4 shrink-0 text-muted" />
              {t('productUnavailableText')}
            </p>
            {inCart > 0 && !inTelegram && (
              <Button variant="danger" onClick={remove}>
                {t('removeFromCart')}
              </Button>
            )}
          </div>
        ) : (
          <div className={cn('flex gap-2.5', inTelegram && 'justify-center')}>
            <Stepper
              variant="large"
              value={qty}
              min={min}
              name={title}
              onIncrement={() => {
                setQty((value) => Math.min(MAX_QTY, value + 1))
                haptic('select')
              }}
              onDecrement={() => {
                setQty((value) => Math.max(min, value - 1))
                haptic('select')
              }}
            />
            {!inTelegram && (
              <Button variant={removing ? 'danger' : 'primary'} onClick={confirm} className="min-w-0 flex-1">
                <span className="min-w-0 flex-1 truncate text-left">{label}</span>
                {!removing && <span className="tabular">{money(product.price * qty)}</span>}
              </Button>
            )}
          </div>
        )}
      </SheetFooter>
    </>
  )
}

import { useId } from 'react'
import type { Product } from '../../api/types'
import { Icon } from '../../components/Icon'
import { ProductImage } from '../../components/ProductImage'
import { Stepper } from '../../components/Stepper'
import { useI18n } from '../../i18n/i18n'
import { cn } from '../../lib/cn'
import { haptic } from '../../lib/telegram'
import { useCart } from '../../state/cart'
import { useNav } from '../../state/nav'
import { useToast } from '../../state/toast'

/** The card's open-details button covers the whole card; the cart controls sit above it. */
const COVER = "text-left after:absolute after:inset-0 after:rounded-[20px] after:content-['']"

/** Grows the photo a little while the card is hovered (keeping its fade-in). */
const PHOTO_HOVER = '[&_img]:transition-[opacity,transform] [&_img]:duration-500 [&_img]:ease-smooth group-hover:[&_img]:scale-[1.045]'
/** The photo of a product that is not available right now: grey and faded. */
const PHOTO_FROZEN = '[&_img]:grayscale [&_img]:opacity-60'

function inCartFrame(qty: number) {
  return qty > 0 ? 'border-brand-text ring-1 ring-brand-text' : 'border-line'
}

interface CardControlProps {
  product: Product
  title: string
  nameId: string
  qty: number
}

/**
 * The round "+" of a card, which turns into a stepper in place: the stepper grows to the left and its "+"
 * lands exactly where the first one was, so a customer can keep tapping the same spot.
 */
function CardControl({ product, title, nameId, qty }: CardControlProps) {
  const { t } = useI18n()
  const cart = useCart()
  const toast = useToast()
  const add = () => {
    // Not available right now: the "+" stays where it always is and says so.
    if (product.frozen) {
      haptic('warning')
      toast(t('productUnavailable', { name: title }), { type: 'error' })
      return
    }
    cart.increment(product.id)
    haptic('light')
  }
  if (qty === 0) {
    return (
      <button
        type="button"
        onClick={add}
        aria-label={t('add')}
        aria-describedby={nameId}
        aria-disabled={product.frozen || undefined}
        className={cn(
          'relative z-[1] grid size-11 shrink-0 place-items-center rounded-full transition-[filter,transform] duration-150 active:scale-95',
          product.frozen ? 'bg-surface-2 text-muted' : 'bg-brand text-brand-ink hover:brightness-110',
        )}
      >
        <Icon name="plus" className="size-5" />
      </button>
    )
  }
  return (
    <Stepper
      variant={product.frozen ? 'soft' : 'pill'}
      value={qty}
      name={title}
      onIncrement={add}
      onDecrement={() => {
        cart.decrement(product.id)
        haptic('select')
      }}
      className="relative z-[1] animate-[fade-in_0.18s_ease_both]"
    />
  )
}

function useCard(product: Product) {
  const { name, desc, money } = useI18n()
  const cart = useCart()
  const { openSheet } = useNav()
  return {
    nameId: useId(),
    title: name(product),
    description: desc(product),
    price: money(product.price),
    qty: cart.quantity(product.id),
    open: () => openSheet({ type: 'product', id: product.id }),
  }
}

/** "Mavjud emas" on the photo of a product that is not available right now. */
function UnavailableBadge({ className }: { className?: string }) {
  const { t } = useI18n()
  return (
    <span
      className={cn(
        'pointer-events-none absolute z-[1] rounded-full bg-[rgb(22_22_26/0.72)] px-2 py-[3px] text-[11px] leading-none font-extrabold whitespace-nowrap text-white backdrop-blur-sm',
        className,
      )}
    >
      {t('unavailableBadge')}
    </span>
  )
}

/**
 * A menu line: name, description and price with its "+" on the left, the photo on the right — the same on
 * phones, the website and the Telegram Mini App. Phones get a slightly smaller photo and padding, so that even
 * a 360px screen fits a six-digit price next to the stepper.
 */
export function ProductCard({ product, className }: { product: Product; className?: string }) {
  const { nameId, title, description, price, qty, open } = useCard(product)
  return (
    <article
      aria-label={title}
      className={cn(
        'group relative flex gap-2.5 rounded-[20px] border bg-surface p-2.5 shadow-sm transition-[transform,box-shadow,border-color] duration-200 ease-smooth hover:-translate-y-0.5 hover:shadow-card sm:gap-3.5 sm:p-3',
        inCartFrame(product.frozen ? 0 : qty),
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col pt-0.5 sm:pl-0.5">
        <h3 id={nameId} className="text-[15.5px] leading-[1.3] font-bold tracking-[-0.01em]">
          <button type="button" onClick={open} className={COVER}>
            {title}
          </button>
        </h3>
        {description && <p className="mt-1 line-clamp-2 text-[13px] leading-[1.45] text-muted">{description}</p>}
        <div className="mt-auto flex items-center gap-1 pt-2.5 sm:gap-1.5">
          <span
            className={cn(
              'tabular min-w-0 flex-1 truncate text-[15px] font-extrabold tracking-[-0.01em] sm:text-[15.5px]',
              product.frozen && 'text-muted',
            )}
          >
            {price}
          </span>
          <CardControl product={product} title={title} nameId={nameId} qty={qty} />
        </div>
      </div>
      <div className="relative shrink-0">
        <ProductImage
          src={product.thumb}
          name={title}
          className={cn('size-[92px] rounded-[14px] sm:size-[104px]', product.frozen ? PHOTO_FROZEN : PHOTO_HOVER)}
        />
        {product.frozen && <UnavailableBadge className="bottom-1.5 left-1/2 -translate-x-1/2" />}
      </div>
    </article>
  )
}

/** A popular dish: a big photo, then name, description, the price and "+" (a row of these scrolls sideways). */
export function FeaturedCard({ product, className }: { product: Product; className?: string }) {
  const { nameId, title, description, price, qty, open } = useCard(product)
  return (
    <article
      aria-label={title}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-[20px] border bg-surface shadow-sm transition-[transform,box-shadow,border-color] duration-200 ease-smooth hover:-translate-y-0.5 hover:shadow-card',
        inCartFrame(product.frozen ? 0 : qty),
        className,
      )}
    >
      <div className="relative">
        <ProductImage src={product.thumb} name={title} className={cn('aspect-[4/3] w-full', product.frozen ? PHOTO_FROZEN : PHOTO_HOVER)} />
        {product.frozen && <UnavailableBadge className="top-2.5 left-2.5" />}
      </div>
      <div className="flex flex-1 flex-col pt-3.5 pr-3 pb-3 pl-3.5">
        <h3 id={nameId} className="text-[15.5px] leading-[1.3] font-bold tracking-[-0.01em]">
          <button type="button" onClick={open} className={COVER}>
            {title}
          </button>
        </h3>
        {description && <p className="mt-1 line-clamp-2 text-[13px] leading-[1.45] text-muted">{description}</p>}
        <div className="mt-auto flex items-center gap-1.5 pt-3">
          <span className={cn('tabular min-w-0 flex-1 truncate text-base font-extrabold tracking-[-0.01em]', product.frozen && 'text-muted')}>
            {price}
          </span>
          <CardControl product={product} title={title} nameId={nameId} qty={qty} />
        </div>
      </div>
    </article>
  )
}

export function ProductCardSkeleton() {
  return (
    <div className="flex gap-2.5 rounded-[20px] border border-line bg-surface p-2.5 sm:gap-3.5 sm:p-3" aria-hidden="true">
      <div className="flex flex-1 flex-col">
        <div className="skeleton mt-1 h-4 w-3/5" />
        <div className="skeleton mt-2.5 h-3 w-4/5" />
        <div className="skeleton mt-auto h-4 w-1/3" />
      </div>
      <div className="skeleton size-[92px] shrink-0 sm:size-[104px]" />
    </div>
  )
}

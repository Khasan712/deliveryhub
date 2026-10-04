import type { ReactNode } from 'react'
import { Icon, type IconName } from '../../components/Icon'
import { ProductImage } from '../../components/ProductImage'
import { useI18n } from '../../i18n/i18n'
import { cn } from '../../lib/cn'
import { statusLabel } from '../../lib/hours'
import { useCatalog } from '../../state/catalog'
import { useOpenStatus } from '../../state/hooks'
import { useNav } from '../../state/nav'

const CHIP =
  'inline-flex h-7 max-w-full min-w-0 items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--hero-ink)_12%,transparent)] px-2.5 text-xs font-bold whitespace-nowrap sm:h-8 sm:gap-1.5 sm:px-3 sm:text-[13px]'

function Chip({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <span className={CHIP}>
      <Icon name={icon} className="size-3.5 sm:size-4" />
      <span className="truncate">{children}</span>
    </span>
  )
}

/** Open or closed right now; opens the week of working hours. */
function HoursChip() {
  const { t } = useI18n()
  const status = useOpenStatus()
  const { openSheet } = useNav()
  if (!status) return null
  return (
    <button
      type="button"
      onClick={() => openSheet({ type: 'hours' })}
      aria-haspopup="dialog"
      className={cn(CHIP, 'transition-colors hover:bg-[color-mix(in_srgb,var(--hero-ink)_18%,transparent)]')}
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-2 shrink-0 rounded-full ring-2 ring-[color-mix(in_srgb,var(--hero-ink)_22%,transparent)] sm:size-2.5',
          status.open ? 'bg-[#22c55e]' : 'bg-[#f43f5e]',
        )}
      />
      <span className="truncate">{statusLabel(status, t)}</span>
    </button>
  )
}

/** The banner of the shop: tagline, delivery facts and three popular dishes. */
export function Hero() {
  const { t, money, name } = useI18n()
  const { business, popular, products } = useCatalog()
  if (!business) return null
  const images = (popular.length >= 3 ? popular : products).filter((product) => product.image).slice(0, 3)

  return (
    <section className="flex items-center justify-between gap-6 rounded-[24px] bg-[var(--hero-bg)] p-5 text-[var(--hero-ink)] sm:py-7 sm:pr-7 sm:pl-8">
      <div className="min-w-0 max-w-[460px]">
        <h1 className="text-[22px] leading-[1.15] font-extrabold tracking-[-0.03em] text-balance sm:text-[28px]">
          {business.tagline || t('heroTitle')}
        </h1>
        <p className="mt-2 text-sm font-medium text-[color-mix(in_srgb,var(--hero-ink)_74%,transparent)] sm:text-[15px]">
          {t('heroText')}
        </p>
        <div className="mt-3.5 flex flex-wrap gap-1.5 sm:mt-4 sm:gap-2">
          <HoursChip />
          {business.delivery_time && <Chip icon="clock">{t('deliveryTime', { time: business.delivery_time })}</Chip>}
          <Chip icon="cash">{t('cashOrCard')}</Chip>
          {business.min_order > 0 && (
            <Chip icon="bag">
              <span className="sm:hidden">{t('minOrderShort', { amount: money(business.min_order) })}</span>
              <span className="hidden sm:inline">{t('minOrderChip', { amount: money(business.min_order) })}</span>
            </Chip>
          )}
        </div>
      </div>
      {images.length > 0 && (
        <div aria-hidden="true" className="hidden shrink-0 gap-2.5 sm:flex">
          {images.map((product) => (
            <ProductImage
              key={product.id}
              src={product.image}
              name={name(product)}
              eager
              className="h-[120px] w-[100px] rounded-[18px] lg:h-[132px] lg:w-[112px]"
            />
          ))}
        </div>
      )}
    </section>
  )
}

export function HeroSkeleton() {
  return <div className="skeleton h-[160px] rounded-[24px] sm:h-[188px]" aria-hidden="true" />
}

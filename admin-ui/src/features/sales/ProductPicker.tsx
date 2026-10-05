import { useMemo, useState, type Ref } from 'react'
import type { CartItem, SalesCategory, SalesProduct } from '../../api/types'
import { IconMinus, IconPlus, IconSnowflake } from '../../components/icons'
import { SearchInput } from '../../components/ui/Form'
import { useI18n } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { formatMoney } from '../../lib/format'
import { filterProducts, qtyOf } from './cart'

interface ProductPickerProps {
  products: SalesProduct[]
  categories: SalesCategory[]
  items: CartItem[]
  onAdd: (product: SalesProduct) => void
  onQty: (product: SalesProduct, quantity: number) => void
  searchRef: Ref<HTMLInputElement>
}

export function ProductPicker({ products, categories, items, onAdd, onQty, searchRef }: ProductPickerProps) {
  const { t, name, lang } = useI18n()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<number | null>(null)
  const visible = useMemo(() => filterProducts(products, search, category), [products, search, category])

  return (
    <section className="rounded-3xl border border-line bg-card shadow-card" aria-labelledby="picker-title">
      <div className="border-b border-line px-5 pb-3 pt-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <h2 id="picker-title" className="text-[15px] font-semibold text-fg">
            {t('products_pick')}
          </h2>
          <SearchInput
            className="sm:w-72"
            value={search}
            onSearch={setSearch}
            delay={80}
            placeholder={t('search_product')}
            inputRef={searchRef}
            shortcut="/"
          />
        </div>
        {categories.length > 0 && (
          <fieldset className="chips mt-3 min-w-0">
            <legend className="sr-only">{t('category')}</legend>
            <button type="button" aria-pressed={category === null} onClick={() => setCategory(null)}>
              {t('all')}
            </button>
            {categories.map((item) => (
              <button key={item.id} type="button" aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>
                {name(item)}
              </button>
            ))}
          </fieldset>
        )}
      </div>
      <div className="grid max-h-[calc(100dvh-15rem)] min-h-64 grid-cols-2 content-start gap-3 overflow-y-auto p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-4">
        {visible.map((product) => {
          const qty = qtyOf(items, product.id)
          const unit = lang === 'ru' ? product.unit_ru : product.unit_uz
          // A frozen product can still be sold here: it only looks different (and the order panel warns).
          // The count is changed right on the tile (a phone shows the order panel far above the tiles).
          return (
            <div key={product.id} className={cn('tile', qty > 0 && 'in-order', product.frozen && 'is-frozen')}>
              <button
                type="button"
                className="tile-main"
                onClick={() => onAdd(product)}
                aria-label={`${t('add_to_order')}: ${name(product)}, ${formatMoney(product.price, lang)}${product.frozen ? ` · ${t('frozen_badge')}` : ''}${qty ? ` · ${t('in_order')}: ${qty}` : ''}`}
              >
                <span className="tile-media">
                  {product.thumb ? (
                    <img src={product.thumb} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <span className="tile-ph">{name(product).trim().charAt(0).toUpperCase() || '?'}</span>
                  )}
                  {product.frozen && (
                    <span className="tile-frozen" aria-hidden="true">
                      <IconSnowflake size={11} strokeWidth={2.6} />
                      {t('frozen_badge')}
                    </span>
                  )}
                </span>
                <span className="tile-name">{name(product)}</span>
                <span className="tile-price">
                  {formatMoney(product.price, lang)}
                  {unit && <span className="ml-1 text-[11px] font-medium text-faint">{t('per_unit', { unit })}</span>}
                </span>
              </button>
              {qty > 0 ? (
                <fieldset className="tile-stepper">
                  <legend className="sr-only">{`${name(product)}: ${t('in_order')}`}</legend>
                  <button
                    type="button"
                    onClick={() => onQty(product, qty - 1)}
                    aria-label={`${t('decrease')}: ${name(product)}`}
                  >
                    <IconMinus size={15} strokeWidth={2.6} />
                  </button>
                  <span aria-live="polite">{qty}</span>
                  <button
                    type="button"
                    onClick={() => onQty(product, qty + 1)}
                    aria-label={`${t('increase')}: ${name(product)}`}
                  >
                    <IconPlus size={15} strokeWidth={2.6} />
                  </button>
                </fieldset>
              ) : (
                // Same as tapping the tile; the tile button above is the one for keyboards and screen readers.
                <button type="button" className="tile-add" tabIndex={-1} aria-hidden="true" onClick={() => onAdd(product)}>
                  <IconPlus size={15} strokeWidth={2.6} />
                  {t('add')}
                </button>
              )}
            </div>
          )
        })}
        {visible.length === 0 && (
          <p className="col-span-full py-10 text-center text-sm text-muted">{t('no_products_found')}</p>
        )}
      </div>
    </section>
  )
}

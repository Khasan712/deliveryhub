import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { SALE_STATUSES, type SaleForm, type SalesData, type SalesProduct, type SaleSummary } from '../../api/types'
import { FrozenBadge, Money, StatusBadge } from '../../components/badges'
import {
  IconArrowRight,
  IconBag,
  IconCard,
  IconCash,
  IconCheck,
  IconChevronLeft,
  IconMapPin,
  IconMic,
  IconMinus,
  IconPlus,
  IconTrash,
  IconTruck,
  IconX,
} from '../../components/icons'
import { STATUS_KEYS, STATUS_TONES } from '../../components/statusMeta'
import { AiBadge } from '../../components/ui/Badge'
import { ButtonLink } from '../../components/ui/Button'
import { Field, Input, SearchInput, Textarea } from '../../components/ui/Form'
import { Modal } from '../../components/ui/Modal'
import { Segmented } from '../../components/ui/Segmented'
import { buttonClass, TONES } from '../../components/ui/styles'
import { useI18n } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { formatDateTime, formatMoney } from '../../lib/format'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useToastOffset } from '../../lib/useToastOffset'
import { ProductThumb } from '../products/ProductThumb'
import { filterProducts, qtyOf, type CartLine } from './cart'
import { FrozenNotice } from './FrozenNotice'
import type { SaleAction, SaleState } from './saleState'
import type { FormField } from './voiceResult'

/** A sale just created, as the phone's «done» screen shows it (the cart is already empty by then). */
export interface DoneSale {
  order: SaleSummary
  lines: CartLine[]
  form: SaleForm
}

interface MobileSaleProps {
  data: SalesData
  state: SaleState
  lines: CartLine[]
  count: number
  total: number
  dispatch: Dispatch<SaleAction>
  isFlashed: (key: string) => boolean
  onAdd: (product: SalesProduct) => void
  onQty: (product: SalesProduct, quantity: number) => void
  onReset: () => void
  onCreate: () => void
  creating: boolean
  done: DoneSale | null
  onNewSale: () => void
  /** The voice assistant's card (SalesPage owns its session); shown in a sheet. */
  voiceCard: ReactNode
  /** The sheet was closed: a recording still running is cancelled. */
  onVoiceClose: () => void
}

/**
 * The point of sale on a phone, in three screens that each fit without scrolling to the button:
 * pick the products → the customer, delivery and payment → «Buyurtma yaratildi» with its number.
 */
export function MobileSale(props: MobileSaleProps) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const [step, setStep] = useState<'pick' | 'details'>('pick')
  const [voiceOpen, setVoiceOpen] = useState(false)
  useDocumentTitle(t('new_sale'))

  const screen = props.done ? 'done' : step
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [screen])

  // Back to where the sale was started from; the home page when the app opened right here (a link, the sign-in, the
  // Telegram Mini App), where going back would leave the app.
  const exit = () => {
    const index = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (location.key === 'default' || index < 1) navigate('/')
    else navigate(-1)
  }

  const closeVoice = () => {
    setVoiceOpen(false)
    props.onVoiceClose()
  }

  if (props.done) {
    return (
      <DoneScreen
        done={props.done}
        onNew={() => {
          setStep('pick')
          props.onNewSale()
        }}
        onExit={exit}
      />
    )
  }

  const listening = props.state.voice.state === 'listening' || props.state.voice.state === 'processing'

  return (
    <>
      {step === 'pick' ? (
        <PickScreen {...props} onClose={exit} onVoice={() => setVoiceOpen(true)} onNext={() => setStep('details')} />
      ) : (
        <DetailsScreen {...props} onBack={() => setStep('pick')} />
      )}
      <Modal
        open={voiceOpen}
        onClose={closeVoice}
        title={t('voice_assistant')}
        footer={
          props.count > 0 && !listening ? (
            <button
              type="button"
              className={buttonClass('primary', 'lg', 'w-full')}
              onClick={() => {
                setVoiceOpen(false)
                setStep('details')
              }}
            >
              {t('continue')}
              <span className="font-medium opacity-80">
                · <Money value={props.total} />
              </span>
              <IconArrowRight size={18} />
            </button>
          ) : undefined
        }
      >
        {props.voiceCard}
      </Modal>
    </>
  )
}

/** A top bar that stays while the page under it scrolls. */
function TopBar({ children }: { children: ReactNode }) {
  return (
    <header
      className="sticky top-0 z-30 border-b border-line bg-card/95 backdrop-blur-lg"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto max-w-2xl px-3 pb-3 pt-2">{children}</div>
    </header>
  )
}

/** A bar fixed to the bottom of the screen: the next step is always in reach. */
function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 px-4 pt-3 backdrop-blur-lg"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto max-w-2xl">{children}</div>
    </div>
  )
}

const iconButton =
  'flex size-11 shrink-0 items-center justify-center rounded-xl text-fg transition-colors hover:bg-subtle active:bg-subtle'

function PickScreen({
  data,
  state,
  lines,
  count,
  total,
  onAdd,
  onQty,
  onReset,
  onClose,
  onVoice,
  onNext,
}: MobileSaleProps & { onClose: () => void; onVoice: () => void; onNext: () => void }) {
  const { t, tn, name } = useI18n()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<number | null>(null)
  useToastOffset('calc(6rem + env(safe-area-inset-bottom))')

  const { products, categories } = data
  const visible = useMemo(() => filterProducts(products, search, category), [products, search, category])
  // All the products: under their categories' titles, so a long menu is easy to run an eye over.
  const groups = useMemo(() => {
    if (search.trim() || category !== null) return [{ key: 'found', title: null, items: visible }]
    const known = new Set(categories.map((item) => item.id))
    const byCategory = new Map<number | null, SalesProduct[]>()
    for (const product of visible) {
      const key = product.category_id !== null && known.has(product.category_id) ? product.category_id : null
      byCategory.set(key, [...(byCategory.get(key) ?? []), product])
    }
    const titled = categories
      .filter((item) => byCategory.has(item.id))
      .map((item) => ({ key: String(item.id), title: name(item), items: byCategory.get(item.id) ?? [] }))
    const other = byCategory.get(null)
    return other ? [...titled, { key: 'other', title: t('no_category'), items: other }] : titled
  }, [visible, categories, search, category, name, t])
  const started = lines.length > 0 || !!state.form.customer_name || !!state.form.phone

  return (
    <div className="pb-32">
      <TopBar>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onClose} className={iconButton} aria-label={t('close')}>
            <IconX size={24} />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-[17px] font-bold text-fg">{t('new_sale')}</h1>
          {started && (
            <button type="button" onClick={onReset} className={cn(iconButton, 'text-muted')} aria-label={t('clear')}>
              <IconTrash size={20} />
            </button>
          )}
          <button
            type="button"
            onClick={onVoice}
            className="ml-1 inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 pl-2.5 pr-3.5 text-sm font-semibold text-rose-700 transition-colors active:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
          >
            <IconMic size={18} strokeWidth={2.2} />
            {t('voice_order')}
          </button>
        </div>
        <SearchInput className="mt-2" value={search} onSearch={setSearch} delay={80} placeholder={t('search_product')} />
        {categories.length > 0 && (
          <fieldset className="chips -mx-3 mt-2.5 min-w-0 px-3">
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
      </TopBar>

      <div className="mx-auto max-w-2xl">
        {groups.map((group) => (
          <section key={group.key} aria-label={group.title ?? t('products_pick')}>
            {group.title && (
              <h2 className="px-4 pb-2 pt-4 text-xs font-bold uppercase tracking-wider text-muted">{group.title}</h2>
            )}
            <ul className="divide-y divide-line border-y border-line bg-card">
              {group.items.map((product) => (
                <PickRow key={product.id} product={product} qty={qtyOf(state.items, product.id)} onAdd={onAdd} onQty={onQty} />
              ))}
            </ul>
          </section>
        ))}
        {visible.length === 0 && <p className="px-4 py-12 text-center text-sm text-muted">{t('no_products_found')}</p>}
      </div>

      <BottomBar>
        {count > 0 ? (
          <button
            type="button"
            onClick={onNext}
            className="flex h-14 w-full items-center gap-3 rounded-2xl bg-cta pl-3 pr-4 text-base font-bold text-white shadow-lg shadow-cta/30 transition-colors hover:bg-cta-hover"
          >
            <span className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-white/20 px-2 text-[15px] tabular">
              <span aria-hidden="true">{count}</span>
              <span className="sr-only">{tn('items', count)}</span>
            </span>
            <span className="flex-1 text-left">{t('continue')}</span>
            <Money value={total} className="whitespace-nowrap" />
            <IconArrowRight size={20} strokeWidth={2.4} className="shrink-0" />
          </button>
        ) : (
          <p className="flex h-14 items-center justify-center rounded-2xl bg-subtle px-4 text-center text-sm font-medium text-muted">
            {t('sale_empty')}
          </p>
        )}
      </BottomBar>
    </div>
  )
}

/** One product: a tap on the row adds one; once in the order, − count + on the right. */
function PickRow({
  product,
  qty,
  onAdd,
  onQty,
}: {
  product: SalesProduct
  qty: number
  onAdd: (product: SalesProduct) => void
  onQty: (product: SalesProduct, quantity: number) => void
}) {
  const { t, name, lang } = useI18n()
  const label = name(product)
  const unit = lang === 'ru' ? product.unit_ru : product.unit_uz
  const step = 'flex h-full w-10 items-center justify-center text-primary-700 dark:text-primary-300'
  return (
    <li className={cn('flex items-center gap-2 py-1.5 pl-4 pr-3 transition-colors', qty > 0 && 'bg-primary-50/70 dark:bg-primary-500/10')}>
      <button
        type="button"
        onClick={() => onAdd(product)}
        className="flex min-h-16 min-w-0 flex-1 items-center gap-3 text-left"
        aria-label={`${t('add_to_order')}: ${label}, ${formatMoney(product.price, lang)}${product.frozen ? ` · ${t('frozen_badge')}` : ''}${qty ? ` · ${t('in_order')}: ${qty}` : ''}`}
      >
        <ProductThumb src={product.thumb} frozen={product.frozen} />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold text-fg">{label}</span>
          <span className="block text-sm font-medium text-fg-soft tabular">
            {formatMoney(product.price, lang)}
            {unit && <span className="ml-1 text-xs font-normal text-faint">{t('per_unit', { unit })}</span>}
          </span>
          {product.frozen && <FrozenBadge className="mt-1" />}
        </span>
      </button>
      {qty > 0 ? (
        <fieldset className="flex h-11 shrink-0 items-center rounded-xl border border-primary-300 bg-card dark:border-primary-500/40">
          <legend className="sr-only">{`${label}: ${t('in_order')}`}</legend>
          <button type="button" onClick={() => onQty(product, qty - 1)} aria-label={`${t('decrease')}: ${label}`} className={step}>
            <IconMinus size={18} strokeWidth={2.6} />
          </button>
          <span className="min-w-6 text-center text-base font-bold text-fg tabular" aria-live="polite">
            {qty}
          </span>
          <button type="button" onClick={() => onQty(product, qty + 1)} aria-label={`${t('increase')}: ${label}`} className={step}>
            <IconPlus size={18} strokeWidth={2.6} />
          </button>
        </fieldset>
      ) : (
        // The same as tapping the row; the row's button is the one for keyboards and screen readers.
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => onAdd(product)}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary-200 bg-primary-50 text-primary-700 dark:border-primary-500/30 dark:bg-primary-500/10 dark:text-primary-300"
        >
          <IconPlus size={20} strokeWidth={2.6} />
        </button>
      )}
    </li>
  )
}

function DetailsScreen({
  state,
  lines,
  count,
  total,
  dispatch,
  isFlashed,
  onCreate,
  creating,
  onBack,
}: MobileSaleProps & { onBack: () => void }) {
  const { t, tn, name } = useI18n()
  const { form, aiFields } = state
  const [comment, setComment] = useState(false)
  useToastOffset('calc(9rem + env(safe-area-inset-bottom))')
  const badge = (field: FormField) => (aiFields[field] ? <AiBadge /> : null)
  const glow = (field: FormField) => (isFlashed(field) ? 'ai-glow' : undefined)
  const frozen = lines.filter((line) => line.product.frozen).map((line) => line.product)

  return (
    <div className="pb-48">
      <TopBar>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onBack} className={iconButton} aria-label={t('back')}>
            <IconChevronLeft size={26} />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-[17px] font-bold text-fg">{t('checkout_title')}</h1>
        </div>
      </TopBar>

      <div className="mx-auto max-w-2xl space-y-5 px-4 pt-4">
        <section className="rounded-2xl border border-line bg-card px-4 pb-3 shadow-card" aria-labelledby="sale-lines">
          <div className="flex items-center gap-2">
            <h2 id="sale-lines" className="text-[15px] font-bold text-fg">
              {tn('products', count)}
            </h2>
            <button type="button" onClick={onBack} className="ml-auto min-h-11 text-sm font-semibold text-primary-700 dark:text-primary-300">
              {t('change_items')}
            </button>
          </div>
          <ul className="space-y-1">
            {lines.map((line) => (
              <li key={line.product_id} className="flex items-baseline justify-between gap-3 text-sm text-fg-soft">
                <span className="min-w-0">
                  {line.quantity} × {name(line.product)}
                </span>
                <Money value={line.product.price * line.quantity} className="shrink-0 font-semibold text-fg tabular" />
              </li>
            ))}
          </ul>
        </section>
        {frozen.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-line bg-card">
            <FrozenNotice products={frozen} />
          </div>
        )}

        <Segmented<SaleForm['delivery_type']>
          label={
            <>
              {t('receive_method')} {badge('delivery_type')}
            </>
          }
          showLabel
          value={form.delivery_type}
          onChange={(value) => dispatch({ type: 'delivery', value })}
          glow={isFlashed('delivery_type')}
          options={[
            { value: 'pickup', label: t('pickup'), icon: <IconBag size={18} /> },
            { value: 'delivery', label: t('delivery'), icon: <IconTruck size={18} /> },
          ]}
        />

        <div className="space-y-4">
          <Field label={t('phone')} labelBadge={badge('phone')}>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                type="tel"
                inputMode="tel"
                className={glow('phone')}
                value={form.phone}
                onChange={(event) => dispatch({ type: 'text', field: 'phone', value: event.target.value })}
                placeholder="+998 90 123 45 67"
                autoComplete="off"
              />
            )}
          </Field>
          <Field label={t('customer_name')} labelBadge={badge('customer_name')}>
            {(fieldProps) => (
              <Input
                {...fieldProps}
                className={glow('customer_name')}
                value={form.customer_name}
                onChange={(event) => dispatch({ type: 'text', field: 'customer_name', value: event.target.value })}
                maxLength={150}
                autoComplete="off"
              />
            )}
          </Field>
          {form.delivery_type === 'delivery' && (
            <Field label={t('address')} labelBadge={badge('address')} className="animate-fade-in">
              {(fieldProps) => (
                <Input
                  {...fieldProps}
                  className={glow('address')}
                  value={form.address}
                  onChange={(event) => dispatch({ type: 'text', field: 'address', value: event.target.value })}
                  maxLength={255}
                  autoComplete="off"
                />
              )}
            </Field>
          )}
        </div>

        <Segmented<SaleForm['payment_method']>
          label={
            <>
              {t('payment_method')} {badge('payment_method')}
            </>
          }
          showLabel
          value={form.payment_method}
          onChange={(value) => dispatch({ type: 'payment', value })}
          glow={isFlashed('payment_method')}
          options={[
            { value: 'cash', label: t('cash'), icon: <IconCash size={18} /> },
            { value: 'card', label: t('card'), icon: <IconCard size={18} /> },
          ]}
        />

        <fieldset className="min-w-0">
          <legend className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-fg-soft">
            {t('status')} {badge('status')}
          </legend>
          <div className="flex flex-wrap gap-2">
            {SALE_STATUSES.map((status) => {
              const on = form.status === status
              const tone = TONES[STATUS_TONES[status]]
              return (
                <button
                  key={status}
                  type="button"
                  aria-pressed={on}
                  onClick={() => dispatch({ type: 'status', value: status })}
                  className={cn(
                    'inline-flex h-10 items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold ring-1 transition-colors',
                    on ? tone.badge : 'bg-card text-fg-soft ring-line',
                    on && glow('status'),
                  )}
                >
                  <span className={cn('size-2 rounded-full', on ? tone.dot : 'bg-line-strong')} />
                  {t(STATUS_KEYS[status])}
                </button>
              )
            })}
          </div>
        </fieldset>

        {comment || form.comment ? (
          <Field id="sale-comment" label={t('comment')} labelBadge={badge('comment')}>
            {(fieldProps) => (
              <Textarea
                {...fieldProps}
                rows={2}
                className={cn('min-h-0', glow('comment'))}
                value={form.comment}
                onChange={(event) => dispatch({ type: 'text', field: 'comment', value: event.target.value })}
                maxLength={1000}
              />
            )}
          </Field>
        ) : (
          <button
            type="button"
            onClick={() => {
              setComment(true)
              requestAnimationFrame(() => document.getElementById('sale-comment')?.focus())
            }}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary-700 dark:text-primary-300"
          >
            <IconPlus size={18} strokeWidth={2.4} />
            {t('add_comment')}
          </button>
        )}
      </div>

      <BottomBar>
        <div className="mb-2.5 flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium text-muted">
            {t('total')} · {tn('items', count)}
          </span>
          <Money value={total} className="text-[22px] font-extrabold tracking-tight text-fg" />
        </div>
        <button
          type="button"
          className={cn('create-btn', state.voice.submit && 'is-hinted')}
          disabled={creating || lines.length === 0}
          onClick={onCreate}
        >
          {creating ? <span className="mic-spinner" style={{ width: 20, height: 20 }} /> : <IconCheck size={20} strokeWidth={2.5} />}
          <span>{t('create_order')}</span>
        </button>
      </BottomBar>
    </div>
  )
}

/** The sale went through: its number and what it holds, and the next sale one tap away. */
function DoneScreen({ done, onNew, onExit }: { done: DoneSale; onNew: () => void; onExit: () => void }) {
  const { t, name, lang } = useI18n()
  const heading = useRef<HTMLHeadingElement>(null)
  useToastOffset('calc(9.5rem + env(safe-area-inset-bottom))')
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [])
  const { order, lines, form } = done
  const delivery = form.delivery_type === 'delivery'
  const chip = 'inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-[13px] font-semibold text-fg-soft ring-1 ring-line'

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col bg-card">
      <div className="px-2" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
        <button type="button" onClick={onExit} className={iconButton} aria-label={t('close')}>
          <IconX size={24} />
        </button>
      </div>
      <div className="flex flex-1 flex-col items-center px-5 pb-6 text-center">
        <span className="mt-4 flex size-20 items-center justify-center rounded-full bg-emerald-500 text-white ring-[12px] ring-emerald-100 dark:ring-emerald-500/20">
          <IconCheck size={40} strokeWidth={3} />
        </span>
        <h1 ref={heading} tabIndex={-1} className="mt-8 text-[26px] font-extrabold tracking-tight text-fg outline-none">
          {t('sale_created')}
        </h1>
        <p className="mt-1.5 text-[15px] text-muted tabular">
          #{order.id} · {formatDateTime(order.created_at, lang)}
        </p>

        <div className="mt-6 w-full rounded-2xl border border-line bg-subtle/60 p-4 text-left">
          <ul className="space-y-1.5" aria-label={t('order_items')}>
            {lines.map((line) => (
              <li key={line.product_id} className="flex items-baseline justify-between gap-3 text-[15px] text-fg">
                <span className="min-w-0">
                  {line.quantity} × {name(line.product)}
                </span>
                <Money value={line.product.price * line.quantity} className="shrink-0 font-semibold tabular" />
              </li>
            ))}
          </ul>
          <div className="my-3 border-t border-line" />
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-semibold text-fg">{t('total')}</span>
            <Money value={order.total} className="text-xl font-extrabold tracking-tight text-fg" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={chip}>
              {delivery ? <IconTruck size={15} /> : <IconBag size={15} />}
              {delivery ? t('delivery') : t('pickup')}
            </span>
            <span className={chip}>
              {form.payment_method === 'card' ? <IconCard size={15} /> : <IconCash size={15} />}
              {form.payment_method === 'card' ? t('card') : t('cash')}
            </span>
            <StatusBadge status={order.status} />
          </div>
          {delivery && form.address && (
            <p className="mt-2.5 flex items-start gap-1.5 text-[13px] text-muted">
              <IconMapPin size={15} className="mt-0.5 shrink-0" />
              {form.address}
            </p>
          )}
        </div>
      </div>
      <div
        className="sticky bottom-0 space-y-2.5 bg-card px-4 pt-3"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <button type="button" className="create-btn" onClick={onNew}>
          <IconPlus size={20} strokeWidth={2.5} />
          <span>{t('new_sale')}</span>
        </button>
        <ButtonLink to={`/orders/${order.id}`} variant="secondary" size="lg" className="w-full">
          {t('open_order')}
        </ButtonLink>
      </div>
    </div>
  )
}

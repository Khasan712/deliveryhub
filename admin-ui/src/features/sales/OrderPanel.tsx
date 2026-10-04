import type { Dispatch } from 'react'
import { SALE_STATUSES, type SaleForm, type SaleStatus } from '../../api/types'
import { FrozenBadge, Money } from '../../components/badges'
import { IconBag, IconCard, IconCart, IconCash, IconCheck, IconMinus, IconPlus, IconTrash, IconTruck } from '../../components/icons'
import { STATUS_KEYS } from '../../components/statusMeta'
import { AiBadge } from '../../components/ui/Badge'
import { Field, Input, Select, Textarea } from '../../components/ui/Form'
import { Segmented } from '../../components/ui/Segmented'
import { useI18n } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { ProductThumb } from '../products/ProductThumb'
import type { CartLine } from './cart'
import { FrozenNotice } from './FrozenNotice'
import type { SaleAction, SaleState } from './saleState'
import type { FormField } from './voiceResult'

interface OrderPanelProps {
  state: SaleState
  lines: CartLine[]
  count: number
  total: number
  dispatch: Dispatch<SaleAction>
  isFlashed: (key: string) => boolean
  onCreate: () => void
  onReset: () => void
  creating: boolean
}

export function OrderPanel({ state, lines, count, total, dispatch, isFlashed, onCreate, onReset, creating }: OrderPanelProps) {
  const { t, tn, name } = useI18n()
  const { form, aiFields } = state
  const badge = (field: FormField) => (aiFields[field] ? <AiBadge /> : null)
  const glow = (field: FormField) => (isFlashed(field) ? 'ai-glow' : undefined)
  const frozen = lines.filter((line) => line.product.frozen).map((line) => line.product)

  return (
    <section className="rounded-3xl border border-line bg-card shadow-card" aria-labelledby="sale-title">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 id="sale-title" className="text-[15px] font-semibold text-fg">
            {t('new_sale')}
          </h2>
          {count > 0 && <p className="text-xs text-muted">{tn('items', count)}</p>}
        </div>
        {(lines.length > 0 || form.customer_name || form.phone) && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-medium text-muted transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
          >
            <IconTrash size={15} />
            {t('clear')}
          </button>
        )}
      </header>

      <div className="max-h-80 overflow-y-auto px-3 py-3">
        {lines.length === 0 ? (
          <div className="py-8 text-center">
            <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-subtle text-faint">
              <IconCart size={26} />
            </div>
            <p className="text-sm text-muted">{t('sale_empty')}</p>
          </div>
        ) : (
          <ul aria-label={t('order_items')}>
            {lines.map((line) => (
              <li key={line.product_id} className={cn('line', isFlashed(`item-${line.product_id}`) && 'line-flash')}>
                <ProductThumb src={line.product.image} frozen={line.product.frozen} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{name(line.product)}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted">
                    <Money value={line.product.price} />
                    {line.product.frozen && <FrozenBadge compact />}
                  </p>
                </div>
                <div className="stepper">
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'qty', productId: line.product_id, quantity: line.quantity - 1 })}
                    aria-label={`${t('decrease')}: ${name(line.product)}`}
                  >
                    <IconMinus size={14} strokeWidth={2.5} />
                  </button>
                  <span aria-label={t('quantity')}>{line.quantity}</span>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'qty', productId: line.product_id, quantity: line.quantity + 1 })}
                    aria-label={`${t('increase')}: ${name(line.product)}`}
                  >
                    <IconPlus size={14} strokeWidth={2.5} />
                  </button>
                </div>
                <Money value={line.product.price * line.quantity} className="w-24 shrink-0 text-right text-sm font-semibold text-fg sm:w-28" />
              </li>
            ))}
          </ul>
        )}
      </div>
      <FrozenNotice products={frozen} />

      <div className="@container space-y-4 border-t border-line px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-faint">{t('customer_optional')}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('customer_name')} labelBadge={badge('customer_name')}>
            {(props) => (
              <Input
                {...props}
                className={glow('customer_name')}
                value={form.customer_name}
                onChange={(event) => dispatch({ type: 'text', field: 'customer_name', value: event.target.value })}
                maxLength={150}
                autoComplete="off"
              />
            )}
          </Field>
          <Field label={t('phone')} labelBadge={badge('phone')}>
            {(props) => (
              <Input
                {...props}
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
        </div>

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
            { value: 'pickup', label: t('pickup'), icon: <IconBag size={16} /> },
            { value: 'delivery', label: t('delivery'), icon: <IconTruck size={16} /> },
          ]}
        />

        {form.delivery_type === 'delivery' && (
          <Field label={t('address')} labelBadge={badge('address')} className="animate-fade-in">
            {(props) => (
              <Input
                {...props}
                className={glow('address')}
                value={form.address}
                onChange={(event) => dispatch({ type: 'text', field: 'address', value: event.target.value })}
                maxLength={255}
                autoComplete="off"
              />
            )}
          </Field>
        )}

        {/* Side by side only when the panel is wide enough for «Наличные» + «Карта» next to the status select. */}
        <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
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
              { value: 'cash', label: t('cash'), icon: <IconCash size={16} /> },
              { value: 'card', label: t('card'), icon: <IconCard size={16} /> },
            ]}
          />
          <Field label={t('status')} labelBadge={badge('status')}>
            {(props) => (
              <Select
                {...props}
                selectClassName={cn('h-[46px]!', glow('status'))}
                value={form.status}
                onChange={(event) => dispatch({ type: 'status', value: event.target.value as SaleStatus })}
              >
                {SALE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(STATUS_KEYS[status])}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <Field label={t('comment')} labelBadge={badge('comment')}>
          {(props) => (
            <Textarea
              {...props}
              rows={2}
              className={cn('min-h-0', glow('comment'))}
              value={form.comment}
              onChange={(event) => dispatch({ type: 'text', field: 'comment', value: event.target.value })}
              maxLength={1000}
            />
          )}
        </Field>
      </div>

      <footer className="rounded-b-3xl border-t border-line bg-subtle/50 px-5 py-4">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-sm font-medium text-muted">{t('total')}</span>
          <Money value={total} className="text-2xl font-bold tracking-tight text-fg" />
        </div>
        <button
          type="button"
          className={cn('create-btn', state.voice.submit && 'is-hinted')}
          disabled={creating || lines.length === 0}
          onClick={onCreate}
          aria-keyshortcuts="Control+Enter Meta+Enter"
        >
          {creating ? <span className="mic-spinner" style={{ width: 20, height: 20 }} /> : <IconCheck size={20} strokeWidth={2.5} />}
          <span>{t('create_order')}</span>
          <kbd className="hidden md:inline-block" aria-hidden="true">
            Ctrl ↵
          </kbd>
        </button>
      </footer>
    </section>
  )
}

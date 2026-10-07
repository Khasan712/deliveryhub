import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Navigate } from 'react-router'
import { isApiError } from '../../api/client'
import { checkoutKey, createOrder } from '../../api/shop'
import type { Order } from '../../api/types'
import { Button } from '../../components/Button'
import { Card, PageTitle } from '../../components/Card'
import { CartSummary } from '../../components/CartLines'
import { CheckoutNotice } from '../../components/CheckoutNotice'
import { EmptyState, Skeleton } from '../../components/EmptyState'
import { ExternalLink } from '../../components/ExternalLink'
import { Field, TextArea, TextInput } from '../../components/Field'
import { Icon } from '../../components/Icon'
import { PhoneInput } from '../../components/PhoneInput'
import { ProductImage } from '../../components/ProductImage'
import { Segmented } from '../../components/Segmented'
import { useI18n } from '../../i18n/i18n'
import { cn } from '../../lib/cn'
import { errorMessageKey, fieldErrorKey } from '../../lib/errors'
import { mapUrl } from '../../lib/format'
import type { Coordinates } from '../../lib/geo'
import { closedNotice, statusLabel } from '../../lib/hours'
import { confirmClosing, haptic, telegram } from '../../lib/telegram'
import { HEADER_SEARCH_QUERY, useMediaQuery } from '../../lib/useMediaQuery'
import { useMainButton } from '../../lib/useTelegram'
import { clientName, useAuth } from '../../state/auth'
import { useCart } from '../../state/cart'
import { useCatalog } from '../../state/catalog'
import { useCheckoutBlock, useDocumentTitle } from '../../state/hooks'
import { useNav } from '../../state/nav'
import { orderKey, ordersKey } from '../../state/orders'
import { useToast } from '../../state/toast'
import {
  fillFromClient,
  initialForm,
  orderBody,
  rememberContact,
  saveDraft,
  validate,
  type CheckoutErrors,
  type CheckoutField,
  type CheckoutForm,
} from './form'
import { MapSheet } from './MapSheet'

export function CheckoutScreen() {
  const { t } = useI18n()
  useDocumentTitle(t('checkoutTitle'))
  const { token, status } = useAuth()
  const catalog = useCatalog()
  const cart = useCart()
  const { openSheet } = useNav()
  const [placed, setPlaced] = useState(false)

  if (catalog.status === 'loading' || status === 'loading') return <CheckoutSkeleton />
  if (catalog.status === 'error') {
    return (
      <EmptyState
        icon="wifi-off"
        title={t('loadError')}
        text={t(errorMessageKey(catalog.error))}
        className="py-16"
        action={
          <Button variant="dark" size="md" icon="refresh" onClick={catalog.refetch}>
            {t('retry')}
          </Button>
        }
      />
    )
  }
  if (cart.lines.length === 0 && !placed) return <Navigate to="/" replace />
  if (!token) {
    return (
      <div className="mx-auto max-w-[560px] pb-16">
        <PageTitle>{t('checkoutTitle')}</PageTitle>
        <Card>
          <EmptyState
            icon="lock"
            tone="brand"
            title={t('signInToOrder')}
            text={t('signInToOrderText')}
            className="py-8"
            action={
              <Button size="md" iconRight="arrow-right" onClick={() => openSheet({ type: 'auth' })}>
                {t('login')}
              </Button>
            }
          />
        </Card>
      </div>
    )
  }
  return <CheckoutFormView token={token} onPlaced={() => setPlaced(true)} />
}

function CheckoutSkeleton() {
  return (
    <div className="mx-auto max-w-[1040px] pb-16" aria-busy="true">
      <Skeleton className="mt-[18px] mb-4 h-9 w-56" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Skeleton className="h-44 rounded-[22px]" />
          <Skeleton className="h-52 rounded-[22px]" />
        </div>
        <Skeleton className="h-72 rounded-[22px]" />
      </div>
    </div>
  )
}

function CheckoutFormView({ token, onPlaced }: { token: string; onPlaced: () => void }) {
  const { t, lang, name, money } = useI18n()
  const { client } = useAuth()
  const catalog = useCatalog()
  const cart = useCart()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { go, openSheet, closeSheet, sheet } = useNav()
  const webApp = telegram()
  const inTelegram = webApp !== null

  const [form, setForm] = useState<CheckoutForm>(initialForm)
  const [errors, setErrors] = useState<CheckoutErrors>({})
  const [placing, setPlacing] = useState(false)
  // One key per checkout: tapping again after an answer got lost returns the same order (api/shop.ts). A changed
  // cart is a new order.
  const attemptKey = useRef<string | null>(null)
  const cartContent = cart.lines.map(({ product, qty }) => `${product.id}x${qty}`).join(',')
  useEffect(() => {
    attemptKey.current = null
  }, [cartContent])
  const [formError, setFormErrorState] = useState('')
  // The map's address for the chosen point when the customer's own text was kept (one tap puts it in).
  const [mapAddress, setMapAddress] = useState('')
  const filledByMap = useRef('')
  const filledFromClient = useRef(false)
  const block = useCheckoutBlock()
  const touched = useRef(new Set<keyof CheckoutForm>())
  const fields = useRef<Partial<Record<CheckoutField, HTMLElement | null>>>({})
  // A wide screen shows the order beside the form; a phone or a tablet sums it up in one line above it.
  const wide = useMediaQuery(HEADER_SEARCH_QUERY)
  // The comment stays folded until wanted (or it came back from a draft).
  const [commenting, setCommenting] = useState(false)
  const comment = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    if (commenting) comment.current?.focus()
  }, [commenting])

  // Prefill from the account once it is known (never over what the customer typed meanwhile).
  useEffect(() => {
    if (!client || filledFromClient.current) return
    filledFromClient.current = true
    setForm((current) => fillFromClient(current, client, clientName(client), touched.current))
  }, [client])

  useEffect(() => saveDraft(form), [form])

  // Telegram: swiping the Mini App away in the middle of checkout asks first.
  useEffect(() => confirmClosing(), [])

  // Inside Telegram the summary may be off-screen (the MainButton submits), so errors also pop up as a toast.
  const setFormError = (message: string) => {
    setFormErrorState(message)
    if (message && inTelegram) toast(message, { type: 'error' })
  }

  const set = <K extends keyof CheckoutForm>(key: K, value: CheckoutForm[K]) => {
    touched.current.add(key)
    setForm((current) => ({ ...current, [key]: value }))
    if (key === 'name' || key === 'phone' || key === 'address') setErrors((current) => ({ ...current, [key]: undefined }))
    setFormErrorState('')
  }

  const focusFirstError = (found: CheckoutErrors) => {
    const first = (['address', 'name', 'phone'] as const).find((key) => found[key])
    const element = first ? fields.current[first] : null
    element?.focus({ preventScroll: true })
    element?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  }

  /** A point from the map: an empty address (or one the map filled in) takes the map's; typed text stays. */
  const pickOnMap = (point: Coordinates, address: string) => {
    const replace = address !== '' && (!form.address.trim() || form.address === filledByMap.current)
    if (replace) filledByMap.current = address
    touched.current.add('lat')
    setForm((current) => ({ ...current, lat: point.lat, lng: point.lng, ...(replace ? { address } : {}) }))
    setMapAddress(replace || address === form.address.trim() ? '' : address)
    setErrors((current) => ({ ...current, address: undefined }))
    setFormErrorState('')
    closeSheet()
  }

  const removeLocation = () => {
    setForm((current) => ({ ...current, lat: null, lng: null }))
    setMapAddress('')
  }

  const canShareContact = Boolean(webApp?.requestContact) && Boolean(webApp?.isVersionAtLeast('6.9'))
  const shareTelegramPhone = () => {
    webApp?.requestContact?.((shared, result) => {
      if (!shared) return
      const digits = (result?.responseUnsafe?.contact?.phone_number ?? '').replace(/\D/g, '')
      if (digits.length === 12 && digits.startsWith('998')) set('phone', digits.slice(3))
      else if (digits) toast(t('onlyUzPhone'), { type: 'error' })
    })
  }

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    if (placing) return
    const found = validate(form)
    setErrors(found)
    if (Object.keys(found).length) {
      haptic('error')
      focusFirstError(found)
      return
    }
    if (block?.reason === 'closed') {
      haptic('error')
      setFormError(closedNotice(block.status, t))
      return
    }
    if (block?.reason === 'unavailable') {
      haptic('error')
      setFormError(t('unavailableOrdered'))
      return
    }
    if (cart.belowMinimum) {
      haptic('error')
      setFormError(t('minOrderError', { amount: money(cart.minOrder) }))
      return
    }
    setPlacing(true)
    setFormError('')
    try {
      attemptKey.current ??= checkoutKey()
      const body = orderBody(form, cart.lines, lang, inTelegram ? 'miniapp' : 'web')
      const { order } = await createOrder(token, body, attemptKey.current)
      attemptKey.current = null
      onPlaced()
      rememberContact(form)
      queryClient.setQueryData<Order[]>(ordersKey(token), (old) => [order, ...(old ?? []).filter((item) => item.id !== order.id)])
      queryClient.setQueryData(orderKey(token, order.id), order)
      void queryClient.invalidateQueries({ queryKey: ordersKey(token) })
      cart.clear()
      haptic('success')
      go(`/orders/${order.id}`, { replace: true, state: { placed: true } })
    } catch (caught) {
      haptic('error')
      handleError(caught)
    } finally {
      setPlacing(false)
    }
  }

  const handleError = (caught: unknown) => {
    if (!isApiError(caught)) {
      setFormError(t('errGeneric'))
      return
    }
    switch (caught.code) {
      case 'auth_required':
        openSheet({ type: 'auth' })
        return
      case 'validation': {
        const fieldsWithErrors = caught.data.fields ?? {}
        const found: CheckoutErrors = {}
        for (const key of ['name', 'phone', 'address'] as const) {
          if (fieldsWithErrors[key]) found[key] = fieldErrorKey(key, fieldsWithErrors[key])
        }
        setErrors(found)
        if (Object.keys(found).length) focusFirstError(found)
        else setFormError(t('checkFields'))
        return
      }
      case 'empty':
        toast(t('cartEmpty'), { type: 'error' })
        go('/', { replace: true })
        return
      case 'product_not_found': {
        const ids = Array.isArray(caught.data.detail) ? caught.data.detail.map(Number).filter(Number.isFinite) : []
        if (ids.length) cart.removeIds(ids)
        toast(t('productGone'), { type: 'error' })
        catalog.refetch()
        return
      }
      case 'min_order':
        setFormError(t('minOrderError', { amount: money(Number(caught.data.min_order) || cart.minOrder) }))
        return
      // The catalog of this visit was out of date: fresh hours / products show what changed.
      case 'business_closed':
        setFormError(t('closedNoticeNoTime'))
        catalog.refetch()
        return
      case 'product_unavailable':
        setFormError(t('unavailableOrdered'))
        catalog.refetch()
        return
      default:
        if (caught.status === 401) openSheet({ type: 'auth' })
        else setFormError(t(errorMessageKey(caught)))
    }
  }

  const closedLabel = block?.reason === 'closed' ? statusLabel(block.status, t) : null
  const submitText = closedLabel ?? `${t('placeOrder')} · ${money(cart.total)}`
  const cannotOrder = cart.belowMinimum || block !== null
  useMainButton({ text: submitText, onClick: () => void submit(), progress: placing, disabled: cannotOrder, shine: !cannotOrder })

  const delivery = form.delivery_type === 'delivery'
  const hasLocation = form.lat !== null && form.lng !== null

  const submitButton = (
    <Button type="submit" form="checkout-form" block loading={placing} disabled={cannotOrder}>
      {closedLabel ? (
        <span className="min-w-0 flex-1 truncate">{closedLabel}</span>
      ) : (
        <>
          <span className="flex-1 text-left">{t('placeOrder')}</span>
          <span className="tabular">{money(cart.total)}</span>
        </>
      )}
    </Button>
  )

  return (
    <div className="mx-auto max-w-[1040px] pb-36 lg:pb-16 tg:pb-10">
      <PageTitle>{t('checkoutTitle')}</PageTitle>
      <CheckoutNotice className="mb-4" />
      <button
        type="button"
        onClick={() => openSheet({ type: 'cart' })}
        aria-label={`${t('edit')}: ${t('yourOrder')}`}
        className="mb-4 flex w-full items-center gap-3 rounded-[20px] border border-line bg-surface p-3 text-left shadow-sm transition-transform active:scale-[0.99] lg:hidden"
      >
        <span className="flex shrink-0">
          {cart.lines.slice(0, 3).map(({ product }, index) => (
            <ProductImage
              key={product.id}
              src={product.thumb}
              name={name(product)}
              className={cn('size-11 rounded-[13px] border-[2.5px] border-surface', index > 0 && '-ml-3')}
              letterClassName="text-sm"
            />
          ))}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-extrabold">{t('itemsCount', { count: cart.count })}</span>
          <span className="tabular block text-[13px] font-bold text-muted">{money(cart.total)}</span>
        </span>
        <span className="shrink-0 text-[13.5px] font-extrabold text-brand-text">{t('edit')}</span>
      </button>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <form id="checkout-form" onSubmit={submit} noValidate className="min-w-0 space-y-4">
          <Card title={t('receive')} titleId="receive-title">
            <Segmented
              label={t('receive')}
              value={form.delivery_type}
              onChange={(value) => {
                set('delivery_type', value)
                setErrors((current) => ({ ...current, address: undefined }))
              }}
              options={[
                { value: 'delivery', label: t('delivery'), icon: 'truck' },
                { value: 'pickup', label: t('pickup'), icon: 'store' },
              ]}
            />
            {delivery ? (
              <>
                {hasLocation ? (
                  <div className="mt-4 flex animate-pop-in items-center gap-3 rounded-2xl bg-green-soft py-2.5 pr-1.5 pl-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-green/15 text-green">
                      <Icon name="pin" className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-extrabold text-green">{t('locationOnMap')}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12.5px] font-bold text-ink-2">
                        <button
                          type="button"
                          onClick={() => openSheet({ type: 'map' })}
                          className="underline underline-offset-2 hover:text-ink"
                        >
                          {t('edit')}
                        </button>
                        <span aria-hidden="true">·</span>
                        <ExternalLink href={mapUrl(form.lat!, form.lng!)} className="underline underline-offset-2 hover:text-ink">
                          {t('onMap')}
                        </ExternalLink>
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={t('removeLocation')}
                      onClick={removeLocation}
                      className="grid size-9 shrink-0 place-items-center rounded-full text-green hover:bg-green/15"
                    >
                      <Icon name="x" className="size-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => openSheet({ type: 'map' })}
                    className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-brand-soft p-3 text-left transition-transform active:scale-[0.99]"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand text-brand-ink">
                      <Icon name="map" className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-extrabold text-brand-text">{t('pickOnMap')}</span>
                      <span className="block text-[12.5px] font-semibold text-muted">{t('pickOnMapHint')}</span>
                    </span>
                    <Icon name="chevron-right" className="size-5 shrink-0 text-brand-text" />
                  </button>
                )}
                <Field id="checkout-address" label={t('address')} error={errors.address && t(errors.address)} className="mt-4 mb-0">
                  <TextArea
                    id="checkout-address"
                    ref={(element) => {
                      fields.current.address = element
                    }}
                    value={form.address}
                    onChange={(event) => set('address', event.target.value)}
                    invalid={Boolean(errors.address)}
                    placeholder={t('addressPlaceholder')}
                    autoComplete="street-address"
                    maxLength={255}
                  />
                  {mapAddress && (
                    <div className="mt-2 flex animate-pop-in items-center gap-2 rounded-xl bg-surface-2 py-1.5 pr-1.5 pl-3">
                      <span className="min-w-0 flex-1 text-[13px] font-semibold text-ink-2">
                        {t('mapAddressSuggestion', { address: mapAddress })}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          filledByMap.current = mapAddress
                          set('address', mapAddress)
                          setMapAddress('')
                        }}
                        className="h-8 shrink-0 rounded-full bg-surface px-3 text-[13px] font-extrabold text-brand-text shadow-sm"
                      >
                        {t('useIt')}
                      </button>
                    </div>
                  )}
                </Field>
              </>
            ) : (
              <>
                {catalog.business?.address && (
                  <div className="mt-4 flex items-start gap-3 rounded-2xl bg-surface-2 p-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-text">
                      <Icon name="store" className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-bold text-muted">{t('pickupFrom')}</p>
                      <p className="text-[15px] leading-snug font-extrabold">{catalog.business.address}</p>
                      {catalog.business.lat !== null && catalog.business.lng !== null && (
                        <ExternalLink
                          href={mapUrl(catalog.business.lat, catalog.business.lng)}
                          className="mt-1 inline-flex items-center gap-1 text-[13px] font-extrabold text-brand-text hover:underline"
                        >
                          <Icon name="map" className="size-3.5" />
                          {t('onMap')}
                        </ExternalLink>
                      )}
                    </div>
                  </div>
                )}
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-blue-soft px-3 py-2.5 text-[13px] font-bold text-blue">
                  <Icon name="info" className="mt-px size-4" />
                  {t('pickupNote')}
                </p>
              </>
            )}
          </Card>

          <Card title={t('contact')} titleId="contact-title">
            <Field id="checkout-name" label={t('yourName')} error={errors.name && t(errors.name)}>
              <TextInput
                id="checkout-name"
                ref={(element) => {
                  fields.current.name = element
                }}
                value={form.name}
                onChange={(event) => set('name', event.target.value)}
                invalid={Boolean(errors.name)}
                autoComplete="name"
                maxLength={150}
              />
            </Field>
            <Field id="checkout-phone" label={t('phone')} error={errors.phone && t(errors.phone)} className="mb-0">
              <PhoneInput
                id="checkout-phone"
                ref={(element) => {
                  fields.current.phone = element
                }}
                value={form.phone}
                onChange={(digits) => set('phone', digits)}
                invalid={Boolean(errors.phone)}
                describedBy={errors.phone ? 'checkout-phone-error' : undefined}
              />
              {canShareContact && (
                <button
                  type="button"
                  onClick={shareTelegramPhone}
                  className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-[13px] font-extrabold text-ink-2"
                >
                  <Icon name="telegram" className="size-4 text-tg" />
                  {t('shareTgPhone')}
                </button>
              )}
            </Field>
          </Card>

          <Card title={t('payment')} titleId="payment-title">
            <Segmented
              label={t('payment')}
              value={form.payment_method}
              onChange={(value) => set('payment_method', value)}
              options={[
                { value: 'cash', label: t('cash'), icon: 'cash' },
                { value: 'card', label: t('card'), icon: 'card' },
              ]}
            />
            <p className="mt-2 text-[12.5px] font-semibold text-muted">{t('paymentNote')}</p>
          </Card>

          {commenting || form.comment ? (
            <Card title={<>{t('comment')} <span className="tracking-normal normal-case">· {t('optional')}</span></>} titleId="comment-title">
              <TextArea
                id="checkout-comment"
                ref={comment}
                aria-labelledby="comment-title"
                value={form.comment}
                onChange={(event) => set('comment', event.target.value)}
                placeholder={t('commentPlaceholder')}
                maxLength={1000}
              />
            </Card>
          ) : (
            <button
              type="button"
              onClick={() => setCommenting(true)}
              className="flex h-12 items-center gap-2 rounded-2xl px-1 text-[14.5px] font-extrabold text-brand-text"
            >
              <Icon name="plus" className="size-[18px]" />
              {t('addComment')}
              <span className="font-bold text-muted">· {t('optional')}</span>
            </button>
          )}
        </form>

        <aside className="hidden lg:sticky lg:top-[calc(var(--header-h)+var(--safe-top)+16px)] lg:block">
          <Card
            title={t('yourOrder')}
            titleId="summary-title"
            action={
              <button type="button" onClick={() => openSheet({ type: 'cart' })} className="text-[13px] font-extrabold text-brand-text hover:underline">
                {t('edit')}
              </button>
            }
          >
            <ul className="mb-3 space-y-2.5">
              {cart.lines.map(({ product, qty, total }) => (
                <li key={product.id} className="flex items-center gap-3">
                  <ProductImage
                    src={product.thumb}
                    name={name(product)}
                    className={cn('size-11 shrink-0 rounded-xl', product.frozen && '[&_img]:grayscale [&_img]:opacity-60')}
                    letterClassName="text-base"
                  />
                  <div className="min-w-0 flex-1">
                    <div className={cn('truncate text-sm font-bold', product.frozen && 'text-muted')}>{name(product)}</div>
                    {product.frozen ? (
                      <div className="text-[12.5px] font-bold text-red">{t('unavailableLine')}</div>
                    ) : (
                      <div className="tabular text-[12.5px] font-semibold text-muted">
                        {qty} × {money(product.price)}
                      </div>
                    )}
                  </div>
                  <span className={cn('tabular text-sm font-extrabold', product.frozen && 'text-muted line-through')}>{money(total)}</span>
                </li>
              ))}
            </ul>
            <div className="border-t border-line pt-3">
              <CartSummary />
            </div>
            {wide && <FormError message={formError} />}
            {!inTelegram && <div className="mt-1 hidden lg:block">{submitButton}</div>}
          </Card>
        </aside>
      </div>

      <MapSheet
        open={sheet?.type === 'map'}
        value={hasLocation ? { lat: form.lat!, lng: form.lng! } : null}
        onClose={closeSheet}
        onPick={pickOnMap}
      />

      {!inTelegram && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-4 pt-3 pb-[calc(12px+var(--safe-bottom))] backdrop-blur-xl lg:hidden">
          {formError && !wide && (
            <p role="alert" className="mb-2 text-center text-[13px] font-bold text-red">
              {formError}
            </p>
          )}
          {submitButton}
        </div>
      )}
    </div>
  )
}

function FormError({ message }: { message: string }): ReactNode {
  if (!message) return null
  return (
    <p role="alert" className={cn('mb-3 rounded-xl bg-red-soft px-3 py-2.5 text-[13px] font-bold text-red')}>
      {message}
    </p>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { errorMessage } from '../../api/errors'
import { voiceApi } from '../../api/endpoints'
import { useCreateSale, useSales } from '../../api/queries'
import type { SalesProduct, VoiceState } from '../../api/types'
import { Money } from '../../components/badges'
import { useToast } from '../../components/feedback/feedback'
import { IconCheck, IconChevronDown } from '../../components/icons'
import { Card } from '../../components/ui/Card'
import { PageHeader } from '../../components/ui/PageHeader'
import { Skeleton } from '../../components/ui/Skeleton'
import { ErrorState } from '../../components/ui/States'
import { useI18n } from '../../i18n/context'
import type { DictKey } from '../../i18n/dict'
import { SIDEBAR_QUERY, useMediaQuery } from '../../lib/useMediaQuery'
import { cartLines, cartTotal, itemsCount } from './cart'
import { MobileSale, type DoneSale } from './MobileSale'
import { OrderPanel } from './OrderPanel'
import { ProductPicker } from './ProductPicker'
import { RecentSales } from './RecentSales'
import { INITIAL_SALE, saleReducer, type SaleAction, type SaleState } from './saleState'
import './sales.css'
import { SalesKpis } from './SalesKpis'
import { useFlash } from './useFlash'
import { VoiceCard } from './VoiceCard'
import { audioFileName } from './voice/audio'
import { VoiceController, displayEngine, type UnderstandInput } from './voice/controller'
import { applyVoiceResult, voiceErrorKey, type Snapshot } from './voiceResult'

export function SalesPage() {
  const { t, tn, lang } = useI18n()
  const toast = useToast()
  const sales = useSales()
  const create = useCreateSale()
  const { flash, isFlashed } = useFlash()
  const wide = useMediaQuery('(min-width: 1280px)')
  // Phones and tablets sell in steps (MobileSale); a wide screen has everything side by side.
  const desktop = useMediaQuery(SIDEBAR_QUERY)
  const [done, setDone] = useState<DoneSale | null>(null)

  // The state is mirrored in a ref synchronously: the voice session and keyboard shortcuts read it between renders.
  const [state, setState] = useState<SaleState>(INITIAL_SALE)
  const stateRef = useRef<SaleState>(INITIAL_SALE)
  const dispatch = useCallback((action: SaleAction) => {
    stateRef.current = saleReducer(stateRef.current, action)
    setState(stateRef.current)
  }, [])

  const products = sales.data?.products
  const byId = useMemo(() => new Map((products ?? []).map((product) => [product.id, product])), [products])
  const lines = cartLines(state.items, byId)
  const count = itemsCount(lines)
  const total = cartTotal(lines)

  const cardRef = useRef<HTMLElement>(null)
  const waveRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const controllerRef = useRef<VoiceController | null>(null)

  // Latest values for callbacks that outlive a render (voice session, global shortcuts).
  const latest = useRef({ t, lang, byId, voice: sales.data?.voice, flash, creating: create.isPending, phone: !desktop })
  useEffect(() => {
    latest.current = { t, lang, byId, voice: sales.data?.voice, flash, creating: create.isPending, phone: !desktop }
  })

  const understand = useCallback(
    async (input: UnderstandInput, before: Snapshot) => {
      const { t: translate, lang: language } = latest.current
      const current = stateRef.current
      const formState: VoiceState = { ...current.form, items: current.items }
      try {
        const data = input.audio
          ? await voiceApi.parseAudio(input.audio, audioFileName(input.audio.type), formState, input.liveText ?? '', language)
          : await voiceApi.parseText(input.text ?? '', formState, language)
        const now = stateRef.current
        const outcome = applyVoiceResult(
          { items: now.items, form: now.form, statusAuto: now.statusAuto },
          data.result,
          (id) => latest.current.byId.has(id),
        )
        dispatch({
          type: 'apply',
          outcome,
          before,
          reply: data.result.reply || translate(outcome.changes ? 'voice_applied' : 'voice_nothing_changed'),
          transcript: data.result.transcript || input.text || input.liveText || '',
          unmatched: data.result.unmatched ?? [],
          submit: !!data.result.submit,
          engine: data.engine,
        })
        // Fields light up one after another, like the AI is filling them in.
        outcome.changedFields.forEach((field, index) => latest.current.flash(field, index * 110))
        outcome.changedItems.forEach((id) => latest.current.flash(`item-${id}`))
      } catch (error) {
        dispatch({ type: 'voice', patch: { state: 'idle', error: translate(voiceErrorKey(error)) } })
      }
    },
    [dispatch],
  )

  useEffect(() => {
    const controller = new VoiceController({
      config: () => ({
        gemini: !!latest.current.voice?.gemini,
        live: !!latest.current.voice?.live,
        lang: latest.current.lang,
      }),
      update: (patch) => dispatch({ type: 'voice', patch }),
      message: (key: DictKey) => latest.current.t(key),
      snapshot: () => {
        const current = stateRef.current
        return { items: current.items, form: current.form, statusAuto: current.statusAuto }
      },
      understand,
      fetchToken: () => voiceApi.token(),
      bars: () => Array.from(waveRef.current?.querySelectorAll<HTMLElement>('[data-bar]') ?? []),
      levelTarget: () => cardRef.current,
    })
    controllerRef.current = controller
    return () => {
      controller.dispose()
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [dispatch, understand])

  const addProduct = useCallback(
    (product: SalesProduct) => {
      dispatch({ type: 'add', productId: product.id })
      flash(`item-${product.id}`)
    },
    [dispatch, flash],
  )

  const setQuantity = useCallback(
    (product: SalesProduct, quantity: number) => {
      dispatch({ type: 'qty', productId: product.id, quantity })
      if (quantity > 0) flash(`item-${product.id}`)
    },
    [dispatch, flash],
  )

  // Below xl the order panel is above the tiles: the bar at the bottom brings it back into view.
  const panelRef = useRef<HTMLDivElement>(null)
  const showOrder = () => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const reset = useCallback(() => {
    const controller = controllerRef.current
    if (controller?.phase === 'listening') void controller.stop(true)
    dispatch({ type: 'reset' })
  }, [dispatch])

  const createOrder = useCallback(() => {
    if (latest.current.creating) return
    const current = stateRef.current
    const sold = cartLines(current.items, latest.current.byId)
    const items = sold.map(({ product_id, quantity }) => ({ product_id, quantity }))
    const translate = latest.current.t
    if (!items.length) {
      toast.error(translate('add_items_first'))
      return
    }
    const controller = controllerRef.current
    if (controller?.phase === 'listening') void controller.stop(true)
    create.mutate(
      { items, ...current.form },
      {
        onSuccess: (data) => {
          latest.current.flash(`sale-${data.order.id}`)
          // A phone shows a whole screen for it; a wide screen a toast beside the next sale.
          if (latest.current.phone) setDone({ order: data.order, lines: sold, form: current.form })
          else {
            toast.success(`${translate('sale_created')} · #${data.order.id}`, {
              action: { label: translate('open'), to: `/orders/${data.order.id}` },
            })
          }
          dispatch({ type: 'reset' })
        },
        onError: (error) => toast.error(errorMessage(error, translate, { empty: 'add_items_first' })),
      },
    )
  }, [create, dispatch, toast])

  // Keyboard: Space — start/stop, Esc — cancel, "/" — search, Ctrl/⌘+Enter — create the order.
  const shortcuts = useRef({ createOrder })
  useEffect(() => {
    shortcuts.current = { createOrder }
  })
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing || event.defaultPrevented) return
      const controller = controllerRef.current
      const active = document.activeElement as HTMLElement | null
      const typing = !!active && (['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName) || active.isContentEditable)
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault()
        shortcuts.current.createOrder()
        return
      }
      if (event.key === 'Escape' && controller?.phase === 'listening') {
        event.preventDefault()
        void controller.stop(true)
        return
      }
      if (typing || document.querySelector('[aria-modal="true"]')) return
      // A focused button already reacts to Space natively (e.g. the mic button itself).
      const onButton = active?.tagName === 'BUTTON' || active?.getAttribute('role') === 'button'
      if (event.code === 'Space' && !event.repeat && !onButton) {
        event.preventDefault()
        controller?.toggle()
      }
      if (event.key === '/') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!desktop && !sales.data) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 p-4" aria-busy={!sales.error}>
        {sales.error ? (
          <Card>
            <ErrorState error={sales.error} onRetry={() => void sales.refetch()} />
          </Card>
        ) : (
          Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-16 rounded-2xl" />)
        )}
      </div>
    )
  }

  if (sales.error && !sales.data) {
    return (
      <>
        <PageHeader title={t('sales_title')} description={t('voice_hint')} />
        <Card>
          <ErrorState error={sales.error} onRetry={() => void sales.refetch()} />
        </Card>
      </>
    )
  }

  if (!sales.data) {
    return (
      <>
        <PageHeader title={t('sales_title')} description={t('voice_hint')} />
        <div aria-busy="true">
          <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-[86px] rounded-2xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className="space-y-6 xl:order-2 xl:col-span-5">
              <Skeleton className="h-72 rounded-3xl" />
              <Skeleton className="h-96 rounded-3xl" />
            </div>
            <Skeleton className="h-[32rem] rounded-3xl xl:order-1 xl:col-span-7" />
          </div>
        </div>
      </>
    )
  }

  const data = sales.data
  const engine = displayEngine(state.voice.engine, data.voice)

  if (!desktop) {
    return (
      <MobileSale
        data={data}
        state={state}
        lines={lines}
        count={count}
        total={total}
        dispatch={dispatch}
        isFlashed={isFlashed}
        onAdd={addProduct}
        onQty={setQuantity}
        onReset={reset}
        onCreate={createOrder}
        creating={create.isPending}
        done={done}
        onNewSale={() => setDone(null)}
        voiceCard={
          <VoiceCard
            voice={state.voice}
            engine={engine}
            canUndo={!!state.undo}
            demo={!data.voice.gemini}
            onToggle={() => controllerRef.current?.toggle()}
            onUndo={() => dispatch({ type: 'undo' })}
            onSendText={(text) => void controllerRef.current?.sendText(text)}
            cardRef={cardRef}
            waveRef={waveRef}
            headless
          />
        }
        onVoiceClose={() => {
          const controller = controllerRef.current
          if (controller?.phase === 'listening') void controller.stop(true)
        }}
      />
    )
  }

  return (
    <div className={lines.length && !wide ? 'pb-24' : undefined}>
      <PageHeader title={t('sales_title')} description={t('voice_hint')} />
      <SalesKpis stats={data.stats} />

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
        <div className="space-y-6 xl:order-2 xl:col-span-5">
          <VoiceCard
            voice={state.voice}
            engine={engine}
            canUndo={!!state.undo}
            demo={!data.voice.gemini}
            onToggle={() => controllerRef.current?.toggle()}
            onUndo={() => dispatch({ type: 'undo' })}
            onSendText={(text) => void controllerRef.current?.sendText(text)}
            cardRef={cardRef}
            waveRef={waveRef}
          />
          <div ref={panelRef} className="scroll-mt-24">
            <OrderPanel
              state={state}
              lines={lines}
              count={count}
              total={total}
              dispatch={dispatch}
              isFlashed={isFlashed}
              onCreate={createOrder}
              onReset={reset}
              creating={create.isPending}
            />
          </div>
        </div>
        <div className="xl:sticky xl:top-24 xl:order-1 xl:col-span-7">
          <ProductPicker
            products={data.products}
            categories={data.categories}
            items={state.items}
            onAdd={addProduct}
            onQty={setQuantity}
            searchRef={searchRef}
          />
        </div>
      </div>

      <RecentSales sales={data.recent} isFlashed={isFlashed} />

      {lines.length > 0 && !wide && (
        <div
          className="fixed bottom-0 left-0 right-0 z-30 animate-slide-up border-t border-line bg-card/95 px-4 py-3 shadow-pop backdrop-blur-lg lg:left-(--sidebar-w)"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto flex max-w-3xl items-center gap-4">
            <button
              type="button"
              className="-my-1 -ml-2 min-w-0 flex-1 rounded-xl px-2 py-1 text-left transition-colors hover:bg-subtle"
              onClick={showOrder}
              aria-label={`${t('order_items')}: ${tn('items', count)}`}
            >
              <span className="flex items-center gap-1 text-xs text-muted">
                {t('total')} · {tn('items', count)}
                <IconChevronDown size={14} strokeWidth={2.4} className="rotate-180" />
              </span>
              <Money value={total} className="block truncate text-lg font-bold text-fg" />
            </button>
            <button
              type="button"
              className="create-btn w-auto! px-5!"
              disabled={create.isPending}
              onClick={createOrder}
            >
              <IconCheck size={18} strokeWidth={2.5} />
              {/* A narrow phone keeps the room for the total. */}
              <span className="min-[420px]:hidden">{t('create')}</span>
              <span className="max-[419px]:hidden">{t('create_order')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import { Icon, type IconName } from '../../components/Icon'
import { SearchBox } from '../../components/SearchBox'
import { useI18n } from '../../i18n/i18n'
import { cn } from '../../lib/cn'
import { errorMessageKey } from '../../lib/errors'
import { prefersReducedMotion } from '../../lib/motion'
import { haptic } from '../../lib/telegram'
import { DESKTOP_QUERY, HEADER_SEARCH_QUERY, WIDE_QUERY, useMediaQuery } from '../../lib/useMediaQuery'
import { useMainButton } from '../../lib/useTelegram'
import { useCart } from '../../state/cart'
import { searchProducts, useCatalog } from '../../state/catalog'
import { useDocumentTitle } from '../../state/hooks'
import { useNav } from '../../state/nav'
import { useSearch } from '../../state/search'
import { CartPanel } from './CartPanel'
import { Hero, HeroSkeleton } from './Hero'
import { FeaturedCard, ProductCard, ProductCardSkeleton } from './ProductCard'
import { CategoryChips, CategoryRail, Toolbar, type MenuPlace } from './Toolbar'

/** Popular dishes in the grid of wide screens: six fill two rows of three (or three rows of two). */
const FEATURED_ON_GRID = 6
/** Room between the sticky bars and a section the menu scrolled to. */
const SCROLL_GAP = 16

function SectionTitle({ id, icon, title, count }: { id?: string; icon?: IconName; title: string; count?: number }) {
  return (
    <h2 id={id} className="mb-3.5 flex items-baseline gap-2.5 text-[22px] font-extrabold tracking-[-0.02em]">
      {icon && <Icon name={icon} className="size-5 self-center text-brand-text" />}
      {title}
      {count !== undefined && <small className="tabular text-[13px] font-bold tracking-normal text-muted">{count}</small>}
    </h2>
  )
}

/** Menu lines: as many columns as cards of at least 336px fit (one on phones). */
function ProductList({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,336px),1fr))] gap-3.5">{children}</div>
}

function CatalogSkeleton() {
  return (
    <section className="mt-7" aria-busy="true">
      <div className="skeleton mb-3.5 h-6 w-40" />
      <ProductList>
        {Array.from({ length: 6 }, (_, index) => (
          <ProductCardSkeleton key={index} />
        ))}
      </ProductList>
    </section>
  )
}

export function MenuScreen() {
  const { t, name, money } = useI18n()
  useDocumentTitle()
  const catalog = useCatalog()
  const cart = useCart()
  const { openSheet } = useNav()
  const { query: search, setQuery: setSearch } = useSearch()
  const query = useDeferredValue(search)
  const results = useMemo(() => searchProducts(catalog.products, query), [catalog.products, query])
  const desktop = useMediaQuery(DESKTOP_QUERY)
  const wide = useMediaQuery(WIDE_QUERY)
  const searchInHeader = useMediaQuery(HEADER_SEARCH_QUERY)
  const [active, setActive] = useState<string | null>(null)
  const toolbar = useRef<HTMLDivElement>(null)
  const ignoreSpyUntil = useRef(0)
  const pendingScroll = useRef<string | null>(null)
  const searching = results !== null
  const ready = catalog.status === 'ready'

  // The places to jump to: the popular dishes, then every category.
  const places = useMemo<MenuPlace[]>(
    () => [
      ...(catalog.popular.length ? [{ key: 'popular', label: t('popularShort'), icon: 'flame' as const }] : []),
      ...catalog.sections.map((section) => ({
        key: `section-${section.id}`,
        label: section.category ? name(section.category) : t('other'),
      })),
    ],
    [catalog.popular.length, catalog.sections, t, name],
  )
  const activeKey = active ?? places[0]?.key ?? null
  const showPlaces = ready && catalog.products.length > 0 && places.length > 1
  const rail = wide && showPlaces
  const chips = !wide && showPlaces && !searching

  const stickyOffset = useCallback(() => {
    const header = document.querySelector('header')?.getBoundingClientRect().height ?? 64
    const bar = toolbar.current?.getBoundingClientRect().height ?? 0
    return header + bar + SCROLL_GAP
  }, [])

  // Scroll-spy: the place whose section is at the top becomes the active chip / rail item.
  useEffect(() => {
    if (searching || !showPlaces || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() < ignoreSpyUntil.current) return
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        const first = visible[0]
        if (first) setActive((first.target as HTMLElement).dataset.place ?? null)
      },
      { rootMargin: `-${Math.round(stickyOffset())}px 0px -55% 0px` },
    )
    document.querySelectorAll('[data-place]').forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [searching, showPlaces, places, rail, stickyOffset])

  // Telegram: the cart lives in the MainButton.
  useMainButton(
    cart.count > 0
      ? {
          text: `${t('cart')} · ${t('itemsCount', { count: cart.count })} · ${money(cart.total)}`,
          onClick: () => openSheet({ type: 'cart' }),
        }
      : null,
  )

  /** Brings a section just below the sticky header (and chips), clear of them. */
  const scrollToPlace = useCallback(
    (key: string) => {
      const section = document.querySelector<HTMLElement>(`[data-place="${key}"]`)
      if (!section) return
      ignoreSpyUntil.current = Date.now() + 900
      window.scrollTo({
        top: section.getBoundingClientRect().top + window.scrollY - stickyOffset(),
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      })
    },
    [stickyOffset],
  )

  const selectPlace = (key: string) => {
    setActive(key)
    haptic('select')
    if (search) {
      // The sections come back once the search is cleared: scroll after that render.
      pendingScroll.current = key
      setSearch('')
      return
    }
    scrollToPlace(key)
  }

  useEffect(() => {
    const key = pendingScroll.current
    if (searching || !key) return
    pendingScroll.current = null
    scrollToPlace(key)
  }, [searching, scrollToPlace])

  let content: ReactNode
  if (catalog.status === 'loading') {
    content = <CatalogSkeleton />
  } else if (catalog.status === 'error') {
    content = (
      <EmptyState
        icon="wifi-off"
        title={t('loadError')}
        text={t(errorMessageKey(catalog.error))}
        action={
          <Button variant="dark" size="md" icon="refresh" onClick={catalog.refetch}>
            {t('retry')}
          </Button>
        }
      />
    )
  } else if (results) {
    content = (
      <section className="mt-6" aria-labelledby="search-results">
        <SectionTitle id="search-results" title={t('results')} count={results.length} />
        {results.length ? (
          <ProductList>
            {results.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </ProductList>
        ) : (
          <EmptyState icon="search" title={t('nothingFound')} text={t('nothingFoundText', { query: search.trim() })} />
        )}
      </section>
    )
  } else if (!catalog.products.length) {
    content = <EmptyState icon="utensils" tone="brand" title={t('emptyMenu')} text={t('emptyMenuText')} />
  } else {
    content = (
      <div className="mt-7 flex flex-col gap-9 sm:gap-10">
        {catalog.popular.length > 0 && (
          <section data-place="popular" aria-labelledby="popular-title">
            <SectionTitle id="popular-title" icon="flame" title={t('popular')} />
            {desktop ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-4">
                {catalog.popular.slice(0, FEATURED_ON_GRID).map((product) => (
                  <FeaturedCard key={product.id} product={product} />
                ))}
              </div>
            ) : (
              <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pt-0.5 pb-1.5">
                {catalog.popular.map((product) => (
                  <FeaturedCard key={product.id} product={product} className="w-[240px] shrink-0 snap-start" />
                ))}
              </div>
            )}
          </section>
        )}
        {catalog.sections.map((section) => (
          <section key={section.id} data-place={`section-${section.id}`} aria-labelledby={`section-${section.id}`}>
            <SectionTitle
              id={`section-${section.id}`}
              title={section.category ? name(section.category) : t('other')}
              count={section.products.length}
            />
            <ProductList>
              {section.products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </ProductList>
          </section>
        ))}
      </div>
    )
  }

  // Wide screens: the search is in the header; the banner and the cart start level, with the categories rail
  // on the left (its width and the cart's match the header above them). Phones: the search above the banner.
  const place = rail
    ? { menu: 'lg:col-start-2 lg:row-start-1', cart: 'lg:col-start-3 lg:row-start-1' }
    : { menu: 'lg:col-start-1 lg:row-start-1', cart: 'lg:col-start-2 lg:row-start-1' }

  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-x-7 gap-y-3 pt-3 pb-32 lg:pt-6 lg:pb-14 tg:pb-10',
        rail ? 'lg:grid-cols-[200px_minmax(0,1fr)_380px]' : 'lg:grid-cols-[minmax(0,1fr)_340px]',
      )}
    >
      {rail && (
        <div className="lg:col-start-1 lg:row-start-1">
          <CategoryRail places={places} active={activeKey} onSelect={selectPlace} />
        </div>
      )}
      {!searchInHeader && catalog.status !== 'error' && <SearchBox value={search} onChange={setSearch} />}
      <div className={cn('min-w-0', place.menu)}>
        {ready ? <Hero /> : catalog.status === 'loading' ? <HeroSkeleton /> : null}
        {chips && (
          <Toolbar ref={toolbar}>
            <CategoryChips places={places} active={activeKey} onSelect={selectPlace} />
          </Toolbar>
        )}
        {content}
      </div>
      <aside className={cn('hidden lg:sticky lg:top-[calc(var(--header-h)+var(--safe-top)+24px)] lg:block lg:self-start', place.cart)}>
        <CartPanel />
      </aside>
    </div>
  )
}

import { useDeferredValue, useState } from 'react'
import { Link } from 'react-router'
import { usePrefetchBusiness, useBusinesses } from '../api/queries'
import type { BusinessCard, BusinessStatus } from '../api/types'
import { Avatar } from '../components/Avatar'
import { BotLine } from '../components/BotStatus'
import {
  ArrowRightIcon,
  BagIcon,
  BuildingIcon,
  CheckCircleIcon,
  PlusIcon,
  SearchIcon,
  StoreIcon,
  WalletIcon,
  XIcon,
} from '../components/icons'
import { Money } from '../components/Money'
import { StatGrid, StatTile } from '../components/StatTile'
import { StatusBadge } from '../components/StatusBadge'
import { Button } from '../components/ui/Button'
import { Skeleton } from '../components/ui/Skeleton'
import { EmptyState, ErrorState } from '../components/ui/States'
import { cx } from '../lib/cx'
import { formatNumber, hostOf } from '../lib/format'
import { businessPath } from '../lib/paths'
import { buttonClass, cardClass, inputClass } from '../components/ui/styles'

type Filter = 'all' | BusinessStatus

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Hammasi' },
  { value: 'active', label: 'Faol' },
  { value: 'suspended', label: "To'xtatilgan" },
]

export function BusinessesPage() {
  const query = useBusinesses()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const deferredSearch = useDeferredValue(search)
  const totals = query.data?.totals
  const businesses = query.data?.results ?? []

  const needle = deferredSearch.trim().toLowerCase()
  const shown = businesses.filter(
    (business) =>
      (filter === 'all' || business.status === filter) &&
      (!needle ||
        business.name.toLowerCase().includes(needle) ||
        business.slug.includes(needle) ||
        business.tagline.toLowerCase().includes(needle)),
  )
  const count = (value: Filter) =>
    value === 'all' ? businesses.length : businesses.filter((business) => business.status === value).length

  return (
    <div className="animate-enter">
      <title>Bizneslar · DeliveryHub</title>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Bizneslar</h1>
          <p className="mt-1 text-slate-500">Har biri o'z do'koni, admin paneli va botlari bilan — ma'lumotlari alohida.</p>
        </div>
      </div>

      {query.isError && !query.data ? (
        <ErrorState
          className="mt-8"
          error={query.error}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <>
          <StatGrid label="Umumiy ko'rsatkichlar" className="mt-6">
            <StatTile
              label="Bizneslar"
              icon={<BuildingIcon size={18} />}
              loading={!totals}
              value={totals && formatNumber(totals.businesses)}
            />
            <StatTile
              label="Faol"
              tone="emerald"
              icon={<CheckCircleIcon size={18} />}
              loading={!totals}
              value={totals && formatNumber(totals.active)}
              valueClassName="text-emerald-600"
            />
            <StatTile
              label="Bugungi buyurtmalar"
              tone="sky"
              icon={<BagIcon size={18} />}
              loading={!totals}
              value={totals && formatNumber(totals.orders_today)}
            />
            <StatTile
              label="Bugungi tushum"
              tone="amber"
              icon={<WalletIcon size={18} />}
              loading={!totals}
              value={totals && <Money value={totals.revenue_today} />}
            />
          </StatGrid>

          {query.isPending ? (
            <CardsSkeleton />
          ) : businesses.length === 0 ? (
            <EmptyState
              className="mt-8"
              icon={<StoreIcon size={30} />}
              title="Hali biznes yo'q"
              description="Birinchi mijozingiz uchun do'kon, admin panel va botlarni bir necha daqiqada oching."
              action={
                <Link to="/new" className={buttonClass({ size: 'lg' })}>
                  <PlusIcon size={18} strokeWidth={2.5} />
                  Yangi biznes ochish
                </Link>
              }
            />
          ) : (
            <section aria-label="Bizneslar ro'yxati" className="mt-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-full sm:max-w-xs">
                  <label htmlFor="business-search" className="sr-only">
                    Biznes qidirish
                  </label>
                  <SearchIcon
                    size={18}
                    className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    id="business-search"
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Nomi yoki manzili bo'yicha qidirish"
                    autoComplete="off"
                    className={inputClass(false, 'h-10 pl-10 text-sm [&::-webkit-search-cancel-button]:hidden')}
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      aria-label="Qidiruvni tozalash"
                      className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      <XIcon size={15} />
                    </button>
                  )}
                </div>
                <fieldset className="inline-flex min-w-0 self-start rounded-xl bg-slate-200/60 p-1">
                  <legend className="sr-only">Holati bo'yicha</legend>
                  {FILTERS.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      aria-pressed={filter === item.value}
                      onClick={() => setFilter(item.value)}
                      className={cx(
                        'rounded-lg px-3 py-1.5 text-[13px] font-bold transition',
                        filter === item.value
                          ? 'bg-white text-slate-900 shadow-[0_1px_3px_rgb(15_23_42/0.12)]'
                          : 'text-slate-500 hover:text-slate-800',
                      )}
                    >
                      {item.label}
                      <span className={cx('ml-1.5 tabular-nums', filter === item.value ? 'text-slate-400' : 'text-slate-400/80')}>
                        {count(item.value)}
                      </span>
                    </button>
                  ))}
                </fieldset>
              </div>

              {shown.length === 0 ? (
                <EmptyState
                  className="mt-5"
                  icon={<SearchIcon size={28} />}
                  title="Hech narsa topilmadi"
                  description="Qidiruv so'zini yoki filtrni o'zgartirib ko'ring."
                  action={
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSearch('')
                        setFilter('all')
                      }}
                    >
                      Filtrni tozalash
                    </Button>
                  }
                />
              ) : (
                <ul className="mt-5 grid gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {shown.map((business) => (
                    <li key={business.slug}>
                      <BusinessTile business={business} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}

function BusinessTile({ business }: { business: BusinessCard }) {
  const prefetch = usePrefetchBusiness()
  const warm = () => void prefetch(business.slug)

  return (
    <article
      className={cx(
        cardClass,
        'group relative h-full p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-lift hover:ring-brand-200',
        'has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-brand-500',
      )}
    >
      <div className="flex items-start gap-3.5">
        {/* A suspended business fades out a little. */}
        <div className={cx('shrink-0', business.status === 'suspended' && 'opacity-60 grayscale')}>
          <Avatar name={business.name} logo={business.logo} color={business.brand_color} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-lg font-extrabold tracking-tight">
              <Link
                to={businessPath(business.slug)}
                onMouseEnter={warm}
                onFocus={warm}
                className="outline-hidden after:absolute after:inset-0 after:rounded-2xl group-hover:text-brand-700"
              >
                {business.name}
              </Link>
            </h2>
            <StatusBadge status={business.status} size="sm" />
          </div>
          <p className="truncate text-sm text-slate-500">{hostOf(business.links.shop)}</p>
        </div>
        <ArrowRightIcon
          size={18}
          className="mt-1 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600"
        />
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'bugun', value: business.stats.orders_today },
          { label: 'jami buyurtma', value: business.stats.orders_total },
          { label: 'mijoz', value: business.stats.customers },
        ].map((stat) => (
          <div key={stat.label} className="flex flex-col-reverse rounded-xl bg-slate-50 py-2 ring-1 ring-slate-100 ring-inset">
            <dt className="text-[11px] font-medium text-slate-500">{stat.label}</dt>
            <dd className="text-lg font-extrabold tabular-nums">{formatNumber(stat.value)}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
        <BotLine label="Mijozlar boti" bot={business.bots.client} />
        <BotLine label="Xodimlar boti" bot={business.bots.admin} />
      </div>
    </article>
  )
}

function CardsSkeleton() {
  return (
    <div className="mt-8" aria-busy="true">
      <output className="sr-only">Bizneslar yuklanmoqda…</output>
      <Skeleton className="h-10 w-full max-w-xs rounded-xl" />
      <div className="mt-5 grid gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className={cx(cardClass, 'p-5')}>
            <div className="flex items-center gap-3.5">
              <Skeleton className="size-12 rounded-2xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-3.5 w-1/2" />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Skeleton className="h-14 rounded-xl" />
              <Skeleton className="h-14 rounded-xl" />
              <Skeleton className="h-14 rounded-xl" />
            </div>
            <div className="mt-4 space-y-2.5 border-t border-slate-100 pt-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

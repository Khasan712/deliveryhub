import { useDeferredValue, useState } from 'react'
import { useBusinesses, useMobileApp, useSetMobileApp } from '../api/queries'
import type { AppConfig, AppShop, BusinessCard } from '../api/types'
import { Avatar } from '../components/Avatar'
import { CheckIcon, ExternalIcon, PhoneIcon, SearchIcon, SparklesIcon, StoreIcon } from '../components/icons'
import { StatusBadge } from '../components/StatusBadge'
import { Skeleton } from '../components/ui/Skeleton'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState, ErrorState } from '../components/ui/States'
import { buttonClass, cardClass, inputClass } from '../components/ui/styles'
import { useToast } from '../components/ui/toast'
import { cx } from '../lib/cx'
import { errorMessage } from '../lib/errors'
import { hostOf } from '../lib/format'

/** The list gets a search box once it is longer than this. */
const SEARCH_FROM = 6

/**
 * Which business our Android/iOS app opens. We show a business its own shop on a phone, as its customers would
 * use it: pick it here, and the app opens it the next time it starts or comes back to the screen.
 */
export function MobileAppPage() {
  const mobile = useMobileApp()
  const list = useBusinesses()
  const choose = useSetMobileApp()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const needle = useDeferredValue(search).trim().toLowerCase()
  const [picking, setPicking] = useState<string | null>(null)

  const chosen = mobile.data?.business?.slug ?? null
  const businesses = list.data?.results ?? []
  const shown = businesses.filter(
    (business) => !needle || business.name.toLowerCase().includes(needle) || business.slug.includes(needle),
  )

  const pick = (business: BusinessCard | null) => {
    if (choose.isPending || (business?.slug ?? null) === chosen) return
    setPicking(business?.slug ?? '')
    choose.mutate(business?.slug ?? null, {
      onSuccess: () =>
        toast.success(business ? `Ilova endi «${business.name}» do'konini ochadi` : "Ilovada do'kon tanlanmagan", {
          description: business ? "Ilova keyingi ochilishida shu do'kon bilan chiqadi." : undefined,
        }),
      onError: (error) => toast.error(errorMessage(error)),
      onSettled: () => setPicking(null),
    })
  }

  const failed = (mobile.isError && !mobile.data) || (list.isError && !list.data)
  return (
    <div className="animate-enter">
      <title>Mobil ilova · DeliveryHub</title>
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Mobil ilova</h1>
      <p className="mt-1 max-w-2xl text-slate-500">
        Android va iOS ilovasi shu yerda tanlangan biznesning do'konini ochadi — mijozga o'z do'konini telefonda
        ko'rsatish uchun. Tanlov darhol ishlaydi: ilova har ochilganda shu yerdan so'raydi.
      </p>

      {failed ? (
        <ErrorState
          className="mt-8"
          error={mobile.error ?? list.error}
          onRetry={() => {
            void mobile.refetch()
            void list.refetch()
          }}
          retrying={mobile.isFetching || list.isFetching}
        />
      ) : (
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-12">
          <section className={cx(cardClass, 'p-5 sm:p-6 lg:col-span-7')} aria-labelledby="mobile-pick">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="mobile-pick" className="text-lg font-extrabold tracking-tight">
                Ilovada qaysi do'kon ochiladi
              </h2>
              {chosen && (
                <button
                  type="button"
                  className={buttonClass({ variant: 'ghost', size: 'sm' })}
                  disabled={choose.isPending}
                  onClick={() => pick(null)}
                >
                  Tanlovni olib tashlash
                </button>
              )}
            </div>

            {businesses.length > SEARCH_FROM && (
              <label className="relative mt-4 block">
                <span className="sr-only">Biznesni qidirish</span>
                <SearchIcon
                  size={18}
                  className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Nomi yoki manzili bo'yicha"
                  className={cx(inputClass(), 'pl-10')}
                />
              </label>
            )}

            {!list.data || !mobile.data ? (
              <div className="mt-4 space-y-2.5" aria-busy="true">
                {Array.from({ length: 3 }, (_, index) => (
                  <Skeleton key={index} className="h-[72px] rounded-2xl" />
                ))}
              </div>
            ) : businesses.length === 0 ? (
              <EmptyState
                className="mt-4"
                icon={<StoreIcon size={28} />}
                title="Hali biznes yo'q"
                description="Avval biznes oching — keyin uni ilovada ko'rsatish mumkin."
              />
            ) : shown.length === 0 ? (
              <p className="mt-6 text-center text-sm text-slate-500">Hech narsa topilmadi.</p>
            ) : (
              <ul className="mt-4 space-y-2.5">
                {shown.map((business) => (
                  <li key={business.slug}>
                    <ShopOption
                      business={business}
                      chosen={business.slug === chosen}
                      busy={picking === business.slug}
                      disabled={choose.isPending}
                      onPick={() => pick(business)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <aside className="space-y-6 lg:sticky lg:top-24 lg:col-span-5" aria-label="Ilovada ko'rinishi">
            {mobile.data ? (
              <PhonePreview shop={mobile.data.config.shop} />
            ) : (
              <Skeleton className="mx-auto h-[624px] w-[300px] rounded-[46px]" />
            )}
            {mobile.data && <UpdatesNote config={mobile.data.config} />}
          </aside>
        </div>
      )}
    </div>
  )
}

interface ShopOptionProps {
  business: BusinessCard
  chosen: boolean
  busy: boolean
  disabled: boolean
  onPick: () => void
}

function ShopOption({ business, chosen, busy, disabled, onPick }: ShopOptionProps) {
  const suspended = business.status === 'suspended'
  return (
    <button
      type="button"
      aria-pressed={chosen}
      disabled={suspended || (disabled && !chosen)}
      onClick={onPick}
      className={cx(
        'group flex w-full items-center gap-3.5 rounded-2xl p-3 text-left ring-1 ring-inset transition',
        chosen
          ? 'bg-brand-50/70 ring-2 ring-brand-500'
          : 'ring-slate-200 hover:bg-slate-50 hover:ring-slate-300 disabled:hover:bg-transparent',
        suspended && 'cursor-not-allowed opacity-60',
      )}
    >
      <Avatar name={business.name} logo={business.logo} color={business.brand_color} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold text-slate-900">{business.name}</span>
        <span className="block truncate text-[13px] text-slate-500">{hostOf(business.links.shop)}</span>
      </span>
      {suspended ? (
        <StatusBadge status={business.status} size="sm" />
      ) : busy ? (
        <Spinner size={18} className="text-brand-700" />
      ) : chosen ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-2.5 py-1 text-xs font-bold text-white">
          <CheckIcon size={13} strokeWidth={3} />
          Ilovada
        </span>
      ) : (
        <span className="text-[13px] font-bold text-brand-700 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          Tanlash
        </span>
      )}
    </button>
  )
}

/** iPhone 15-ish screen (390 × 844 CSS px) shrunk into the frame; the shop itself, live. */
const SCREEN = { width: 390, height: 848 }
const FRAME_INNER = 276

function PhonePreview({ shop }: { shop: AppShop | null }) {
  const scale = FRAME_INNER / SCREEN.width
  return (
    <figure>
      <div className="mx-auto w-[300px] rounded-[46px] bg-slate-900 p-3 shadow-lift ring-1 ring-slate-900/40">
        <div className="relative h-[600px] overflow-hidden rounded-[35px] bg-white">
          {shop ? (
            <iframe
              key={shop.url}
              src={shop.url}
              title={`${shop.name} — ilovadagi ko'rinishi`}
              loading="lazy"
              className="absolute top-0 left-0 origin-top-left border-0"
              style={{ width: SCREEN.width, height: SCREEN.height, transform: `scale(${scale})` }}
            />
          ) : (
            <div className="grid h-full place-items-center bg-slate-50 px-8 text-center">
              <div>
                <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-white text-slate-400 shadow-card">
                  <PhoneIcon size={26} />
                </span>
                <p className="mt-4 font-bold text-slate-700">Do'kon tanlanmagan</p>
                <p className="mt-1 text-sm text-slate-500">Ilova «Hozircha do'kon yo'q» deb ko'rsatadi.</p>
              </div>
            </div>
          )}
          <span
            aria-hidden="true"
            className="absolute top-2.5 left-1/2 h-6 w-24 -translate-x-1/2 rounded-full bg-slate-900"
          />
        </div>
      </div>
      <figcaption className="mt-3 text-center text-sm text-slate-500">
        {shop ? (
          <>
            Jonli ko'rinish — ilova xuddi shu sahifani ochadi.{' '}
            <a
              href={shop.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-bold text-brand-700 hover:underline"
            >
              {hostOf(shop.url)}
              <ExternalIcon size={13} />
            </a>
          </>
        ) : (
          'Biznesni tanlang — u shu yerda ko\'rinadi.'
        )}
      </figcaption>
    </figure>
  )
}

function UpdatesNote({ config }: { config: AppConfig }) {
  return (
    <section className={cx(cardClass, 'p-5')} aria-labelledby="mobile-updates">
      <h2 id="mobile-updates" className="flex items-center gap-2 font-extrabold tracking-tight">
        <SparklesIcon size={18} className="text-brand-600" />
        Yangilanishlar o'zi yetib boradi
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        Do'kon ichidagi har qanday o'zgarish — dizayn, menyu, narxlar — serverga chiqarilishi bilan ilovada ko'rinadi.
        Mijoz Play Market yoki App Store'dan yangilashi shart emas.
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-slate-50 p-3">
          <dt className="text-slate-500">Ilovaning eng past versiyasi</dt>
          <dd className="mt-0.5 font-bold text-slate-900 tabular-nums">{config.min_version}</dd>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <dt className="text-slate-500">Do'konlar</dt>
          <dd className="mt-0.5 font-bold text-slate-900">
            {config.store.android || config.store.ios
              ? [config.store.android && 'Google Play', config.store.ios && 'App Store'].filter(Boolean).join(' · ')
              : 'hali joylanmagan'}
          </dd>
        </div>
      </dl>
    </section>
  )
}

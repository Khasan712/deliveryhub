import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { isApiError } from '../../api/client'
import { useBusiness } from '../../api/queries'
import type { BusinessDetail, Credentials } from '../../api/types'
import { Avatar } from '../../components/Avatar'
import { CredentialsPanel } from '../../components/CredentialsPanel'
import {
  AlertIcon,
  ArrowLeftIcon,
  BagIcon,
  CalendarIcon,
  DashboardIcon,
  ExternalIcon,
  SearchIcon,
  StoreIcon,
  UsersIcon,
  WalletIcon,
} from '../../components/icons'
import { Money } from '../../components/Money'
import { StatGrid, StatTile } from '../../components/StatTile'
import { StatusBadge } from '../../components/StatusBadge'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState, ErrorState } from '../../components/ui/States'
import { cx } from '../../lib/cx'
import { formatDate, formatNumber } from '../../lib/format'
import { AddressesCard } from './AddressesCard'
import { LocationCard } from './LocationCard'
import { BotsSection } from './bots'
import { DangerZone } from './DangerZone'
import { OwnerCard } from './OwnerCard'
import { ProfileForm } from './ProfileForm'
import { StatusToggle } from './StatusToggle'
import { buttonClass, cardClass } from '../../components/ui/styles'

/** Owner credentials handed over by the create page through the history state. */
function credentialsFrom(state: unknown): Credentials | null {
  if (!state || typeof state !== 'object' || !('credentials' in state)) return null
  const credentials = (state as { credentials: unknown }).credentials
  if (!credentials || typeof credentials !== 'object') return null
  const { phone, password } = credentials as Record<string, unknown>
  return typeof phone === 'string' && typeof password === 'string' ? { phone, password } : null
}

export function BusinessPage() {
  const { slug = '' } = useParams()
  // A fresh page (and its one-time state) for every business.
  return <BusinessView key={slug} slug={slug} />
}

function BusinessView({ slug }: { slug: string }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [credentials, setCredentials] = useState(() => credentialsFrom(location.state))
  const [pollUntil, setPollUntil] = useState(0)
  const query = useBusiness(slug, { pollUntil })
  const watch = useCallback((ms: number) => setPollUntil(Date.now() + ms), [])

  // The credentials are shown once: drop them from the history entry so a reload or "Back" never shows them again.
  useEffect(() => {
    if (credentialsFrom(location.state)) {
      navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null })
    }
  }, [location, navigate])

  if (query.isPending) return <BusinessSkeleton />
  if (query.isError && !query.data) {
    if (isApiError(query.error, 'not_found')) {
      return (
        <>
          <title>Biznes topilmadi · DeliveryHub</title>
          <EmptyState
            headingLevel="h1"
            icon={<SearchIcon size={28} />}
            title="Biznes topilmadi"
            description={`"${slug}" manzilli biznes yo'q yoki o'chirilgan.`}
            action={
              <Link to="/" className={buttonClass({ variant: 'secondary' })}>
                <ArrowLeftIcon size={16} />
                Bizneslarga qaytish
              </Link>
            }
          />
        </>
      )
    }
    return (
      <>
        <BackLink />
        <ErrorState
          headingLevel="h1"
          className="mt-4"
          error={query.error}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </>
    )
  }

  const business = query.data
  return (
    <div className="animate-enter">
      <title>{`${business.name} · DeliveryHub`}</title>
      <BackLink />
      <Header business={business} />

      {business.status === 'suspended' && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl bg-slate-900 px-5 py-4 text-white sm:items-center">
          <AlertIcon size={22} className="shrink-0 text-amber-300" />
          <p className="flex-1 text-sm">
            <b className="font-bold">Biznes to'xtatilgan.</b>{' '}
            <span className="text-slate-300">
              Do'kon, admin panel va botlar hozir ishlamayapti — qayta yoqish uchun «Yoqish» tugmasini bosing.
            </span>
          </p>
        </div>
      )}

      {credentials && (
        <div className="mt-6">
          <CredentialsPanel
            credentials={credentials}
            adminUrl={business.links.admin}
            onClose={() => setCredentials(null)}
          />
        </div>
      )}

      <StatGrid label="Ko'rsatkichlar" className="mt-6">
        <StatTile label="Bugungi buyurtmalar" tone="violet" icon={<BagIcon size={18} />} value={formatNumber(business.stats.orders_today)} />
        <StatTile label="Bugungi tushum" tone="amber" icon={<WalletIcon size={18} />} value={<Money value={business.stats.revenue_today} />} />
        <StatTile label="Jami buyurtmalar" icon={<DashboardIcon size={18} />} value={formatNumber(business.stats.orders_total)} />
        <StatTile label="Mijozlar" tone="sky" icon={<UsersIcon size={18} />} value={formatNumber(business.stats.customers)} />
      </StatGrid>

      <div className="mt-6 grid gap-5 lg:grid-cols-5">
        <div className="min-w-0 space-y-5 lg:col-span-3">
          <BotsSection business={business} watch={watch} />
          <AddressesCard business={business} />
          <LocationCard business={business} />
        </div>
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <ProfileForm business={business} />
          <OwnerCard business={business} />
        </div>
      </div>

      <DangerZone business={business} />
    </div>
  )
}

function BackLink() {
  return (
    <Link
      to="/"
      className="inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold text-slate-500 transition hover:text-slate-900"
    >
      <ArrowLeftIcon size={16} />
      Bizneslar
    </Link>
  )
}

function Header({ business }: { business: BusinessDetail }) {
  const created = formatDate(business.created_at)
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-4">
      <Avatar
        name={business.name}
        logo={business.logo}
        color={business.brand_color}
        size="xl"
        className="max-sm:size-16 max-sm:rounded-2xl max-sm:text-2xl"
      />
      <div className="min-w-0 flex-1 basis-60">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-extrabold tracking-tight break-words sm:text-3xl">{business.name}</h1>
          <StatusBadge status={business.status} />
        </div>
        <p className="mt-0.5 text-slate-500">{business.tagline || business.slug}</p>
        {created && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
            <CalendarIcon size={13} />
            Ochilgan: {created}
          </p>
        )}
      </div>
      <div className="flex w-full flex-wrap gap-2 sm:w-auto">
        <a
          href={business.links.shop}
          target="_blank"
          rel="noopener noreferrer"
          className={cx(buttonClass({ variant: 'secondary' }), 'max-sm:flex-1')}
        >
          <StoreIcon size={17} />
          Do'kon
          <ExternalIcon size={14} className="text-slate-400" />
        </a>
        <a
          href={business.links.admin}
          target="_blank"
          rel="noopener noreferrer"
          className={cx(buttonClass({ variant: 'secondary' }), 'max-sm:flex-1')}
        >
          <DashboardIcon size={17} />
          Admin panel
          <ExternalIcon size={14} className="text-slate-400" />
        </a>
        <StatusToggle business={business} className="max-sm:w-full" />
      </div>
    </div>
  )
}

function BusinessSkeleton() {
  return (
    <div aria-busy="true">
      <output className="sr-only">Biznes yuklanmoqda…</output>
      <Skeleton className="h-4 w-24" />
      <div className="mt-4 flex flex-wrap items-center gap-5">
        <Skeleton className="size-20 rounded-3xl" />
        <div className="flex-1 space-y-2.5">
          <Skeleton className="h-8 w-56 max-w-full" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-28 rounded-xl" />
          <Skeleton className="h-10 w-32 rounded-xl" />
          <Skeleton className="h-10 w-28 rounded-xl" />
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className={cx(cardClass, 'p-5')}>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-3 h-7 w-20" />
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          <div className={cx(cardClass, 'p-6')}>
            <Skeleton className="h-5 w-40" />
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-36 rounded-2xl" />
              <Skeleton className="h-36 rounded-2xl" />
            </div>
            <Skeleton className="mt-5 h-28 rounded-2xl" />
          </div>
          <div className={cx(cardClass, 'p-6')}>
            <Skeleton className="h-5 w-28" />
            <Skeleton className="mt-5 h-9" />
            <Skeleton className="mt-3 h-9" />
          </div>
        </div>
        <div className="space-y-5 lg:col-span-2">
          <div className={cx(cardClass, 'space-y-4 p-6')}>
            <Skeleton className="h-5 w-20" />
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-10 rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

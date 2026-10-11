import { useMemo, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { useBranches } from '../../api/queries'
import type { Branch } from '../../api/types'
import { ActiveBadge, Money } from '../../components/badges'
import {
  IconAlert,
  IconBag,
  IconInbox,
  IconInfo,
  IconMapPin,
  IconPencil,
  IconPhone,
  IconPlus,
  IconPower,
  IconSend,
  IconStore,
  IconTrash,
} from '../../components/icons'
import { MapView } from '../../components/map/MapView'
import { Avatar } from '../../components/ui/Avatar'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { PageHeader } from '../../components/ui/PageHeader'
import { Skeleton } from '../../components/ui/Skeleton'
import { Callout, ErrorState } from '../../components/ui/States'
import { useI18n } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { formatPhone, phoneHref } from '../../lib/format'
import { toPoint, type MapPin } from '../../lib/map'
import { useBranchActions } from './useBranchActions'

/**
 * The business's branches (admins): how orders are split between them right now, all of them on a map, and each one
 * with today's orders and money, its staff, editing, stopping and deleting.
 */
export function BranchesPage() {
  const { t, tn, lang } = useI18n()
  const navigate = useNavigate()
  const { data, error, refetch } = useBranches()
  const actions = useBranchActions()
  const active = data?.filter((branch) => branch.is_active).length ?? 0

  const pins = useMemo<MapPin[]>(
    () =>
      (data ?? []).flatMap((branch) => {
        const point = toPoint(branch.lat, branch.lng)
        if (!point) return []
        return [
          {
            id: String(branch.id),
            point,
            label: branch.name,
            detail: branch.is_active ? tn('orders', branch.today.orders) : t('inactive'),
            tone: branch.is_active ? ('branch' as const) : ('muted' as const),
          },
        ]
      }),
    [data, t, tn],
  )

  const header = (
    <PageHeader
      title={t('branches_title')}
      description={
        data?.length
          ? `${tn('branches', data.length)} · ${t('branches_active_count', { count: active })}`
          : t('branches_subtitle')
      }
      actions={
        data?.length ? (
          <ButtonLink to="/branches/new" variant="primary" icon={<IconPlus size={18} />}>
            {t('add_branch')}
          </ButtonLink>
        ) : undefined
      }
    />
  )

  if (!data) {
    return (
      <>
        {header}
        {error ? (
          <Card>
            <ErrorState error={error} onRetry={() => void refetch()} />
          </Card>
        ) : (
          <div className="space-y-6" aria-busy="true">
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-72 rounded-2xl" />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-56 rounded-2xl" />
              ))}
            </div>
          </div>
        )}
      </>
    )
  }

  if (data.length === 0) {
    return (
      <>
        {header}
        <BranchesIntro />
      </>
    )
  }

  const mode = active >= 2 ? 'branches_mode_dispatch' : active === 1 ? 'branches_mode_single' : 'branches_mode_none'

  return (
    <>
      {header}
      <div className="space-y-6">
        <Callout tone={active ? 'info' : 'warning'} icon={active ? <IconInfo size={18} /> : <IconAlert size={18} />}>
          {t(mode)}
        </Callout>

        {pins.length > 0 && (
          <Card className="overflow-hidden">
            <CardHeader title={t('branches_map')} />
            <div className="p-3 sm:p-4">
              <MapView
                className="h-60 sm:h-80"
                label={t('branches_map_label')}
                lang={lang}
                pins={pins}
                onPinClick={(id) => navigate(`/branches/${id}/edit`)}
              />
            </div>
          </Card>
        )}

        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label={t('branches_title')}>
          {data.map((branch) => (
            <li key={branch.id}>
              <BranchCard
                branch={branch}
                onActive={(value) => actions.setActive(branch, value)}
                onDelete={() => void actions.askDelete(branch)}
                busy={actions.pendingId === branch.id}
              />
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

function BranchCard({
  branch,
  onActive,
  onDelete,
  busy,
}: {
  branch: Branch
  onActive: (active: boolean) => void
  onDelete: () => void
  busy: boolean
}) {
  const { t, tn } = useI18n()
  const edit = `/branches/${branch.id}/edit`
  const located = toPoint(branch.lat, branch.lng) !== null

  return (
    <article
      className={cn(
        'flex h-full flex-col rounded-2xl border border-line bg-card shadow-card',
        !branch.is_active && 'bg-subtle/40',
      )}
    >
      <div className="flex items-start gap-3 p-4 pb-3">
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-xl',
            branch.is_active
              ? 'bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-300'
              : 'bg-slate-100 text-slate-400 dark:bg-slate-800',
          )}
        >
          <IconStore size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-bold text-fg">
            <Link to={edit} className="hover:text-primary-600 dark:hover:text-primary-400">
              {branch.name}
            </Link>
          </h2>
          <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">{branch.address}</p>
        </div>
        <ActiveBadge active={branch.is_active} />
      </div>

      <dl className="grid grid-cols-2 gap-2 border-t border-line px-4 py-3">
        <Stat label={t('today')}>{tn('orders', branch.today.orders)}</Stat>
        <Stat label={t('revenue')}>
          <Money value={branch.today.revenue} />
        </Stat>
      </dl>

      {(branch.phone || !located) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-3 text-[13px]">
          {branch.phone && (
            <a href={phoneHref(branch.phone)} className="inline-flex items-center gap-1.5 font-medium text-fg-soft tabular hover:text-fg">
              <IconPhone size={14} className="text-faint" />
              {formatPhone(branch.phone)}
            </a>
          )}
          {!located && (
            <span className="inline-flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-300">
              <IconMapPin size={14} />
              {t('branch_no_point')}
            </span>
          )}
        </div>
      )}

      <BranchStaffList branch={branch} />

      <footer className="mt-auto flex items-center gap-1 border-t border-line px-2.5 py-2">
        <ButtonLink to={edit} variant="ghost" size="sm" icon={<IconPencil size={15} />} aria-label={`${t('edit')}: ${branch.name}`}>
          {t('edit')}
        </ButtonLink>
        <Button
          variant="ghost"
          size="sm"
          icon={<IconPower size={15} />}
          loading={busy}
          onClick={() => onActive(!branch.is_active)}
          aria-label={`${branch.is_active ? t('branch_deactivate') : t('branch_activate')}: ${branch.name}`}
        >
          {branch.is_active ? t('branch_deactivate') : t('branch_activate')}
        </Button>
        <Button
          variant="danger-soft"
          size="icon-sm"
          className="ml-auto"
          title={t('delete')}
          aria-label={`${t('delete')}: ${branch.name}`}
          onClick={onDelete}
        >
          <IconTrash size={16} />
        </Button>
      </footer>
    </article>
  )
}

/** Who works at the branch (their user pages a tap away), and adding one more there. */
function BranchStaffList({ branch }: { branch: Branch }) {
  const { t } = useI18n()
  const staff = branch.staff ?? []
  const headingId = `branch-${branch.id}-staff`
  return (
    <section aria-labelledby={headingId} className="border-t border-line px-4 py-3">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <h3 id={headingId} className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          {t('branch_staff_label')} · <span className="tabular">{staff.length}</span>
        </h3>
        {/* A stopped branch takes no new staff. */}
        {branch.is_active && (
          <ButtonLink
            to={`/users/new?role=branch&branch=${branch.id}`}
            variant="ghost"
            size="xs"
            icon={<IconPlus size={14} />}
            aria-label={`${t('add_staff')}: ${branch.name}`}
            className="-mr-1.5 text-primary-700 dark:text-primary-300"
          >
            {t('add_staff')}
          </ButtonLink>
        )}
      </div>
      {staff.length ? (
        <ul className="mt-1.5 space-y-2">
          {staff.map((person) => (
            <li key={person.id} className="flex min-w-0 items-center gap-2.5">
              <Avatar
                name={person.name}
                size="xs"
                colorClass="bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300"
              />
              <Link
                to={`/users/${person.id}/edit`}
                className="min-w-0 flex-1 truncate text-sm font-medium text-fg hover:text-primary-600 dark:hover:text-primary-400"
              >
                {person.name}
              </Link>
              <a href={phoneHref(person.phone_number)} className="shrink-0 text-xs text-muted tabular hover:text-fg">
                {formatPhone(person.phone_number)}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[13px] text-muted">{t('branch_no_staff')}</p>
      )}
    </section>
  )
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-semibold text-fg tabular">{children}</dd>
    </div>
  )
}

/** No branches yet: how they work, and the first one a tap away. */
function BranchesIntro() {
  const { t } = useI18n()
  const steps = [
    { icon: <IconStore size={20} />, title: t('branches_how_1'), text: t('branches_how_1_sub') },
    { icon: <IconInbox size={20} />, title: t('branches_how_2'), text: t('branches_how_2_sub') },
    { icon: <IconSend size={20} />, title: t('branches_how_3'), text: t('branches_how_3_sub') },
    { icon: <IconBag size={20} />, title: t('branches_how_4'), text: t('branches_how_4_sub') },
  ]
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col items-center px-6 pb-2 pt-10 text-center">
        <span className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 ring-1 ring-teal-100 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-500/20">
          <IconStore size={30} />
        </span>
        <h2 className="text-lg font-bold text-fg">{t('branches_empty_title')}</h2>
        <p className="mt-1.5 max-w-md text-sm text-muted">{t('branches_empty_text')}</p>
      </div>
      <div className="px-5 pt-4 sm:px-8">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">{t('tg_how_title')}</h3>
        <ol className="grid gap-3 sm:grid-cols-2">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-3 rounded-2xl border border-line bg-subtle/40 p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-card text-primary-600 ring-1 ring-line dark:text-primary-300">
                {step.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-fg">
                  <span className="mr-1 text-primary-600 tabular dark:text-primary-300">{index + 1}.</span>
                  {step.title}
                </span>
                <span className="mt-0.5 block text-[13px] leading-relaxed text-muted">{step.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex justify-center px-6 pb-10 pt-6">
        <ButtonLink to="/branches/new" variant="primary" size="lg" icon={<IconPlus size={18} />}>
          {t('add_first_branch')}
        </ButtonLink>
      </div>
    </Card>
  )
}

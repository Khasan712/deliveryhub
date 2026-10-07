import type { ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { useWorkingHours } from '../api/queries'
import { useAuthed, useSession } from '../auth/session'
import { RoleBadge } from '../components/badges'
import { IconChevronRight, IconExternal, IconGlobe, IconLogOut, IconMoon } from '../components/icons'
import { LanguageSwitch } from '../components/LanguageSwitch'
import { Avatar } from '../components/ui/Avatar'
import { PageHeader } from '../components/ui/PageHeader'
import { Switch } from '../components/ui/Switch'
import { useI18n } from '../i18n/context'
import { cn } from '../lib/cn'
import { formatPhone, fullName } from '../lib/format'
import { SIDEBAR_QUERY, useMediaQuery } from '../lib/useMediaQuery'
import { useTheme } from '../theme/theme'
import { NAV, TAB_PATHS } from './nav'

/** «Yana» of the phone's bottom menu: the side menu's other pages, the language and the theme, signing out. */
export function MorePage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const desktop = useMediaQuery(SIDEBAR_QUERY)
  const { user, business, isAdmin } = useAuthed()
  const { logout } = useSession()
  const { theme, toggleTheme } = useTheme()
  const hours = useWorkingHours().data

  // A wide screen has all of it in the side menu and the header.
  if (desktop) return <Navigate to="/" replace />

  const groups = NAV.map((group) => ({
    label: group.label,
    items: group.items.filter((item) => !TAB_PATHS.includes(item.to) && (!item.adminOnly || isAdmin)),
  })).filter((group) => group.items.length > 0)

  return (
    <>
      <PageHeader title={t('nav_more')} />
      <div className="space-y-6">
        <section className="flex items-center gap-3.5 rounded-2xl border border-line bg-card p-4 shadow-card">
          <Avatar name={user.first_name || user.phone_number} secondary={user.last_name} size="lg" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-fg">{fullName(user.first_name, user.last_name) || formatPhone(user.phone_number)}</p>
            <p className="truncate text-[13px] text-muted">{business.name}</p>
            <div className="mt-1.5">
              <RoleBadge role={user.role} />
            </div>
          </div>
        </section>

        {groups.map((group) => (
          <Group key={group.label} title={t(group.label)}>
            {group.items.map((item) => {
              const Icon = item.icon
              return (
                <li key={item.to}>
                  <Link to={item.to} className="flex min-h-14 items-center gap-3 px-4 transition-colors active:bg-subtle">
                    <RowIcon>
                      <Icon size={18} className={item.iconClassName} />
                    </RowIcon>
                    <span className="min-w-0 flex-1 truncate font-medium text-fg">{t(item.label)}</span>
                    {item.to === '/hours' && hours && (
                      <span className={cn('text-[13px] font-semibold', hours.open ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300')}>
                        {hours.open ? t('hours_open_now') : t('hours_closed_now')}
                      </span>
                    )}
                    <IconChevronRight size={18} className="shrink-0 text-faint" />
                  </Link>
                </li>
              )
            })}
          </Group>
        ))}

        <Group title={t('app_settings')}>
          <li className="flex min-h-14 items-center gap-3 px-4">
            <RowIcon>
              <IconGlobe size={18} />
            </RowIcon>
            <span className="flex-1 font-medium text-fg">{t('language')}</span>
            <LanguageSwitch />
          </li>
          <li className="flex min-h-14 items-center gap-3 px-4">
            <RowIcon>
              <IconMoon size={18} />
            </RowIcon>
            <span className="flex-1 font-medium text-fg">{t('dark_mode')}</span>
            <Switch checked={theme === 'dark'} onChange={toggleTheme} label={t('dark_mode')} />
          </li>
          {business.shop_url && (
            <li>
              <a
                href={business.shop_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-14 items-center gap-3 px-4 transition-colors active:bg-subtle"
              >
                <RowIcon>
                  <IconExternal size={18} />
                </RowIcon>
                <span className="flex-1 font-medium text-fg">{t('open_shop')}</span>
                <IconChevronRight size={18} className="shrink-0 text-faint" />
              </a>
            </li>
          )}
        </Group>

        <button
          type="button"
          onClick={() => void logout().then(() => navigate('/login', { replace: true, state: { reason: 'logout' } }))}
          className="flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl border border-rose-200 bg-card font-semibold text-rose-700 transition-colors active:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:active:bg-rose-500/10"
        >
          <IconLogOut size={20} />
          {t('logout')}
        </button>
      </div>
    </>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-muted">{title}</h2>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card shadow-card">{children}</ul>
    </section>
  )
}

function RowIcon({ children }: { children: ReactNode }) {
  return <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-subtle text-fg-soft">{children}</span>
}

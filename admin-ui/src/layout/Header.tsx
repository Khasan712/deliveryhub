import { useNavigate } from 'react-router'
import { useAuthed, useSession } from '../auth/session'
import { RoleBadge } from '../components/badges'
import { BusinessLogo } from '../components/BusinessLogo'
import { IconChevronDown, IconExternal, IconLogOut, IconMoon, IconSun } from '../components/icons'
import { LanguageSwitch } from '../components/LanguageSwitch'
import { Avatar } from '../components/ui/Avatar'
import { Menu, MenuItem } from '../components/ui/Menu'
import { Tooltip } from '../components/ui/Tooltip'
import { useI18n } from '../i18n/context'
import { formatPhone, fullName } from '../lib/format'
import { useTheme } from '../theme/theme'

/** The wide screen's header (a phone has the bottom menu and its «Yana» page instead). */
export function Header() {
  const { t } = useI18n()
  const { theme, toggleTheme } = useTheme()
  const { business } = useAuthed()

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-card/85 backdrop-blur-xl supports-[backdrop-filter]:bg-card/70">
      <div className="flex h-16 items-center gap-3 px-8">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <BusinessLogo name={business.name} logo={business.logo} brandColor={business.brand_color} />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[15px] font-semibold text-fg">{business.name}</p>
            <p className="truncate text-xs text-muted">{t('app_admin_panel')}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {business.shop_url && (
            <a
              href={business.shop_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-xl px-3 text-[13px] font-semibold text-fg-soft transition-colors hover:bg-subtle hover:text-fg"
            >
              <IconExternal size={16} />
              {t('open_shop')}
            </a>
          )}
          <LanguageSwitch />
          <Tooltip content={theme === 'dark' ? t('light_mode') : t('dark_mode')} side="bottom">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex size-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-subtle hover:text-fg"
              aria-label={theme === 'dark' ? t('light_mode') : t('dark_mode')}
            >
              {theme === 'dark' ? <IconSun size={20} /> : <IconMoon size={20} />}
            </button>
          </Tooltip>
          <UserMenu />
        </div>
      </div>
    </header>
  )
}

function UserMenu() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { user } = useAuthed()
  const { logout } = useSession()
  const name = fullName(user.first_name, user.last_name) || formatPhone(user.phone_number)

  return (
    <Menu
      trigger={(props) => (
        <button
          type="button"
          {...props}
          aria-label={t('user_menu')}
          className="flex h-10 items-center gap-2 rounded-xl pl-1 pr-1.5 transition-colors hover:bg-subtle sm:pr-2"
        >
          <Avatar name={user.first_name || user.phone_number} secondary={user.last_name} size="sm" />
          <span className="hidden max-w-36 truncate text-[13px] font-semibold text-fg lg:block">{name}</span>
          <IconChevronDown size={16} className="hidden text-faint sm:block" />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="flex items-center gap-3 px-3 pb-3 pt-2">
            <Avatar name={user.first_name || user.phone_number} secondary={user.last_name} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-fg">{name}</p>
              <p className="truncate text-xs text-muted tabular">{formatPhone(user.phone_number)}</p>
              <div className="mt-1.5">
                <RoleBadge role={user.role} />
              </div>
            </div>
          </div>
          <div className="my-1 border-t border-line" />
          <MenuItem
            danger
            icon={<IconLogOut size={18} />}
            onSelect={() => {
              close()
              void logout().then(() => navigate('/login', { replace: true, state: { reason: 'logout' } }))
            }}
          >
            {t('logout')}
          </MenuItem>
        </>
      )}
    </Menu>
  )
}

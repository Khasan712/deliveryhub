import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { useI18n } from '../i18n/i18n'
import { cn } from '../lib/cn'
import { isTelegram } from '../lib/telegram'
import { HEADER_SEARCH_QUERY, useMediaQuery } from '../lib/useMediaQuery'
import { avatarLetter, useAuth } from '../state/auth'
import { useCart } from '../state/cart'
import { useCatalog } from '../state/catalog'
import { useChangeLanguage } from '../state/hooks'
import { useNav } from '../state/nav'
import { usePhoneNav } from '../state/phoneNav'
import { useSearch } from '../state/search'
import { useTheme } from '../state/theme'
import { BusinessLogo } from './BusinessLogo'
import { IconButton } from './Button'
import { Icon } from './Icon'
import { SearchBox } from './SearchBox'

/** The width of every page (the header keeps its place from screen to screen). */
export const PAGE_WIDTH = 'max-w-[1440px]'
/**
 * From 1360px the header lines up with the menu below it: the brand over the categories rail, the search over
 * the banner (the same width), the links and settings over the cart. Keep in step with MenuScreen's columns.
 */
export const RAIL_COLUMN = 'min-[1360px]:w-[200px]'
export const CART_COLUMN = 'min-[1360px]:min-w-[380px]'

export function Header() {
  const { t, lang } = useI18n()
  const { business, status } = useCatalog()
  const search = useSearch()
  const searchHere = useMediaQuery(HEADER_SEARCH_QUERY)
  const { client, token } = useAuth()
  const { count, pulse } = useCart()
  const { openSheet, back, go } = useNav()
  const changeLanguage = useChangeLanguage()
  const theme = useTheme()
  const { pathname } = useLocation()
  const inTelegram = isTelegram()
  // A phone has the links, the cart and the profile in its menu bar at the bottom (TabBar).
  const phoneNav = usePhoneNav()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const atRoot = pathname === '/'
  // Wide screens search from the header on every screen (typing elsewhere goes to the menu); phones search above
  // the banner.
  const showSearch = searchHere && status !== 'error'

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b bg-[color-mix(in_srgb,var(--bg)_86%,transparent)] pt-[var(--safe-top)] backdrop-blur-xl backdrop-saturate-[1.8] transition-[border-color] duration-200',
        scrolled ? 'border-line' : 'border-transparent',
      )}
    >
      <div className={cn('mx-auto flex h-[var(--header-h)] w-full items-center gap-2 px-4 md:gap-3 md:px-6 lg:gap-7', PAGE_WIDTH)}>
        {!atRoot && !inTelegram && (
          <IconButton icon="chevron-left" label={t('back')} onClick={back} className="-ml-2 md:hidden" />
        )}
        <Link
          to="/"
          className={cn('flex min-w-0 items-center gap-2.5 rounded-xl min-[1360px]:shrink-0', RAIL_COLUMN)}
          aria-label={business?.name ?? t('menu')}
        >
          {business ? (
            <BusinessLogo name={business.name} logo={business.logo} className="size-10 rounded-[13px] text-[19px]" />
          ) : (
            <span className="skeleton size-10 shrink-0 rounded-[13px]" />
          )}
          {business ? (
            <span className="truncate text-[17px] leading-tight font-extrabold tracking-[-0.02em]">{business.name}</span>
          ) : (
            <span className="skeleton block h-4 w-28" />
          )}
        </Link>

        {showSearch && (
          <SearchBox
            value={search.query}
            onChange={(value) => {
              search.setQuery(value)
              if (!atRoot) go('/')
            }}
            className="min-w-0 flex-1"
          />
        )}

        <div className={cn('ml-auto flex shrink-0 items-center justify-end gap-1', CART_COLUMN)}>
          {!phoneNav && (
            <nav aria-label={t('mainNavigation')} className="mr-1 hidden gap-0.5 md:flex">
              {(
                [
                  ['/', t('menu')],
                  ['/orders', t('orders')],
                ] as const
              ).map(([to, label]) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'flex h-[38px] items-center rounded-xl px-2.5 text-[14.5px] font-bold transition-colors',
                      isActive ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:bg-surface-2',
                    )
                  }
                >
                  {label}
                </NavLink>
              ))}
            </nav>
          )}
          {!inTelegram && (
            <div role="group" aria-label={t('language')} className="mr-1 hidden rounded-[11px] bg-surface-2 p-[3px] md:flex">
              {(['uz', 'ru'] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed={lang === code}
                  onClick={() => changeLanguage(code)}
                  className={cn(
                    'h-[30px] rounded-lg px-2.5 text-[12.5px] font-extrabold transition-colors',
                    lang === code ? 'bg-thumb text-ink shadow-sm' : 'text-muted hover:text-ink-2',
                  )}
                >
                  {code.toUpperCase()}
                </button>
              ))}
            </div>
          )}
          {theme.canChange && (
            <IconButton
              icon={theme.preference === 'auto' ? 'contrast' : theme.preference === 'dark' ? 'moon' : 'sun'}
              label={`${t('switchTheme')}: ${t(`theme_${theme.preference}`)}`}
              onClick={theme.cycle}
              className="hidden md:grid"
            />
          )}
          {!phoneNav && (
            <Link
              to="/orders"
              aria-label={t('orders')}
              title={t('orders')}
              className="grid size-[42px] place-items-center rounded-[13px] text-ink-2 transition-colors hover:bg-surface-2 md:hidden"
            >
              <Icon name="receipt" />
            </Link>
          )}
          {!inTelegram && !phoneNav && (
            <IconButton
              key={pulse}
              icon="bag"
              label={count ? `${t('openCart')}: ${t('itemsCount', { count })}` : t('openCart')}
              badge={count}
              onClick={() => openSheet({ type: 'cart' })}
              className={cn('lg:hidden', pulse > 0 && 'animate-bump')}
            />
          )}
          {!phoneNav && (
            <Link
              to="/profile"
              aria-label={t('profile')}
              title={t('profile')}
              className="grid size-[42px] place-items-center rounded-[13px] transition-colors hover:bg-surface-2"
            >
              {token && client ? (
                <span className="grid size-[34px] place-items-center rounded-full bg-surface-3 text-[13px] font-extrabold text-ink">
                  {avatarLetter(client) ?? <Icon name="user" className="size-[18px]" />}
                </span>
              ) : (
                <Icon name="user" className="text-ink-2" />
              )}
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}

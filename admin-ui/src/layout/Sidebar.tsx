import { NavLink } from 'react-router'
import { useNewOrdersCount } from '../api/queries'
import { useSession } from '../auth/session'
import { DeliveryHubMark } from '../components/DeliveryHubMark'
import { IconPanelClose, IconPanelOpen } from '../components/icons'
import { Tooltip } from '../components/ui/Tooltip'
import { useI18n } from '../i18n/context'
import { cn } from '../lib/cn'
import { NAV, type NavItem } from './nav'

interface SidebarProps {
  collapsed: boolean
  onToggleCollapsed?: () => void
}

export function Sidebar({ collapsed, onToggleCollapsed }: SidebarProps) {
  const { t } = useI18n()
  const { isAdmin } = useSession()
  const newOrders = useNewOrdersCount(true).data ?? 0

  return (
    <div className="flex h-full flex-col bg-sidebar text-slate-300">
      <div className={cn('flex h-16 shrink-0 items-center gap-3 border-b border-white/[0.06] px-4', collapsed && 'justify-center px-0')}>
        <DeliveryHubMark className="size-9 rounded-xl" />
        {!collapsed && (
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[15px] font-bold tracking-tight text-white">{t('app_platform')}</p>
            <p className="truncate text-[11.5px] font-medium text-slate-400">{t('app_admin_panel')}</p>
          </div>
        )}
      </div>

      <nav aria-label={t('app_admin_panel')} className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
        {NAV.map((group, index) => {
          const items = group.items.filter((item) => !item.adminOnly || isAdmin)
          if (!items.length) return null
          return (
            <div key={group.label} className={cn(index > 0 && 'mt-5')}>
              {collapsed ? (
                index > 0 && <div className="mx-3 mb-4 border-t border-white/[0.07]" aria-hidden="true" />
              ) : (
                <p className="mb-1.5 px-3 text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-500">
                  {t(group.label)}
                </p>
              )}
              <ul className="space-y-1">
                {items.map((item) => (
                  <li key={item.to}>
                    <SidebarLink item={item} collapsed={collapsed} count={item.counter ? newOrders : 0} />
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </nav>

      {onToggleCollapsed && (
        <div className="shrink-0 border-t border-white/[0.06] p-3">
          <Tooltip content={t('expand_sidebar')} side="right" disabled={!collapsed}>
            <button
              type="button"
              onClick={onToggleCollapsed}
              className={cn(
                'flex h-10 w-full items-center gap-3 rounded-xl px-3 text-[13px] font-medium text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white',
                collapsed && 'justify-center px-0',
              )}
              aria-label={collapsed ? t('expand_sidebar') : t('collapse_sidebar')}
              aria-expanded={!collapsed}
            >
              {collapsed ? <IconPanelOpen size={20} /> : <IconPanelClose size={20} />}
              {!collapsed && t('collapse_sidebar')}
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  )
}

function SidebarLink({ item, collapsed, count }: { item: NavItem; collapsed: boolean; count: number }) {
  const { t } = useI18n()
  const Icon = item.icon
  const label = t(item.label)
  const link = (
    <NavLink
      to={item.to}
      end={item.end}
      aria-label={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          'group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] font-medium transition-all duration-150',
          collapsed && 'justify-center px-0',
          isActive
            ? 'bg-primary-600 text-white shadow-md shadow-primary-950/40'
            : 'text-slate-300 hover:bg-white/[0.06] hover:text-white',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={20} className={cn('shrink-0', item.iconClassName, !isActive && 'text-slate-400 group-hover:text-white')} />
          {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
          {!collapsed && item.badge === 'ai' && (
            <span
              className={cn(
                'rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                isActive ? 'bg-white/20 text-white' : 'bg-linear-to-r from-ai-1 to-ai-3 text-white',
              )}
            >
              AI
            </span>
          )}
          {count > 0 &&
            (collapsed ? (
              <span className="absolute right-2 top-2 size-2 rounded-full bg-amber-400 ring-2 ring-sidebar" aria-hidden="true" />
            ) : (
              <span
                className={cn(
                  'min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold tabular',
                  isActive ? 'bg-white/20 text-white' : 'bg-amber-400/15 text-amber-300',
                )}
                aria-label={t('new_orders_badge', { count })}
              >
                {count > 99 ? '99+' : count}
              </span>
            ))}
        </>
      )}
    </NavLink>
  )
  return (
    <Tooltip content={count > 0 ? `${label} · ${count}` : label} side="right" disabled={!collapsed}>
      {link}
    </Tooltip>
  )
}

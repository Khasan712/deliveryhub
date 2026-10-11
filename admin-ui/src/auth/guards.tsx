import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useI18n } from '../i18n/context'
import { FullPageLoader, NoAccess, SessionErrorScreen } from './SystemScreens'
import { useSession } from './session'

/** Protected routes: waits for the session, sends anonymous users to /login?next=<path>. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const session = useSession()
  const location = useLocation()

  if (session.status === 'loading') return <FullPageLoader />
  if (session.status === 'error') return <SessionErrorScreen error={session.error} onRetry={session.retry} />
  if (session.status === 'anonymous') {
    const path = location.pathname + location.search
    const next = session.signedOut === 'logout' || path === '/' ? '' : `?next=${encodeURIComponent(path)}`
    return <Navigate to={`/login${next}`} replace state={{ reason: session.signedOut }} />
  }
  return children
}

/** Admin-only sections (staff users, branches). Managers see a "no access" page. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin } = useSession()
  return isAdmin ? children : <NoAccess />
}

/** Sections of the head office (customers, categories, units, editing the menu): branch staff see "no access". */
export function RequireHeadOffice({ children }: { children: ReactNode }) {
  const { branchStaff } = useSession()
  const { t } = useI18n()
  return branchStaff ? <NoAccess text={t('no_access_branch_text')} /> : children
}

/** Pages that exist only while our panel lets the business have branches. */
export function RequireBranches({ children }: { children: ReactNode }) {
  const { branchesOn } = useSession()
  const { t } = useI18n()
  return branchesOn ? children : <NoAccess text={t('branches_off_text')} />
}

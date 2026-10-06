import { Navigate, Outlet, useLocation, useNavigation } from 'react-router'
import { useMe } from '../api/queries'
import { loginPath } from '../lib/paths'
import { Glow } from './AppLayout'
import { BrandMark } from './BrandMark'
import { Spinner } from './ui/Spinner'
import { ErrorState } from './ui/States'

export function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="flex flex-col items-center gap-5">
        <BrandMark size="lg" />
        <Spinner size={22} className="text-brand-600" />
        <output className="sr-only">Yuklanmoqda…</output>
      </div>
    </div>
  )
}

/** Restores the session (`/auth/me`); without one, sends to the login page with a return path. */
export function RequireAuth() {
  const me = useMe()
  const location = useLocation()
  // When the session ends during a navigation, come back to the page that was being opened.
  const target = useNavigation().location ?? location

  if (me.isPending) return <Splash />
  if (me.isError) {
    return (
      <div className="relative isolate grid min-h-dvh place-items-center px-4">
        <Glow />
        <ErrorState
          headingLevel="h1"
          className="w-full max-w-md"
          title="Panelni ochib bo'lmadi"
          error={me.error}
          onRetry={() => void me.refetch()}
          retrying={me.isFetching}
        />
      </div>
    )
  }
  if (!me.data) return <Navigate to={loginPath(target.pathname, target.search)} replace />
  return <Outlet />
}

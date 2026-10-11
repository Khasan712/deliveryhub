import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { isApiError, onApiEvent } from '../api/client'
import { authApi } from '../api/endpoints'
import { queryKeys } from '../api/queries'
import type { MeResponse } from '../api/types'
import { SuspendedScreen } from './SystemScreens'
import { SessionContext, branchAccess, fetchSession, rememberBusiness, type SessionValue } from './session'

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [suspended, setSuspended] = useState(false)
  const [signedOut, setSignedOut] = useState<SessionValue['signedOut']>(null)
  const statusRef = useRef<SessionValue['status']>('loading')

  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: fetchSession,
    staleTime: 5 * 60_000,
    retry: (count, error) => isApiError(error, 'network') && count < 2,
  })

  const clearSession = useCallback(() => {
    void queryClient.cancelQueries()
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== queryKeys.me[0] })
    queryClient.setQueryData(queryKeys.me, null)
  }, [queryClient])

  useEffect(
    () =>
      onApiEvent((event) => {
        if (event.type === 'suspended') {
          setSuspended(true)
          return
        }
        // A 401 while signed in means the session expired → back to the login page.
        if (statusRef.current === 'authenticated') {
          setSignedOut('expired')
          clearSession()
        }
      }),
    [clearSession],
  )

  let status: SessionValue['status'] = 'loading'
  if (me.data) status = 'authenticated'
  else if (me.data === null) status = 'anonymous'
  else if (me.isError) status = 'error'

  // A background /auth/me check found the session gone (not a logout) → it expired.
  const [lastStatus, setLastStatus] = useState(status)
  if (lastStatus !== status) {
    setLastStatus(status)
    if (lastStatus === 'authenticated' && status === 'anonymous' && signedOut === null) setSignedOut('expired')
  }

  useEffect(() => {
    statusRef.current = status
  }, [status])

  const refresh = useCallback(async () => {
    const data = (await queryClient.fetchQuery({ queryKey: queryKeys.me, queryFn: fetchSession, staleTime: 0 })) as MeResponse | null
    if (data) setSignedOut(null)
    return data
  }, [queryClient])

  const signIn = useCallback(
    (data: MeResponse) => {
      rememberBusiness(data.business)
      setSignedOut(null)
      queryClient.setQueryData(queryKeys.me, data)
    },
    [queryClient],
  )

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } catch {
      /* the local session is cleared anyway */
    }
    setSignedOut('logout')
    clearSession()
  }, [clearSession])

  const { data, error, refetch } = me
  const value = useMemo<SessionValue>(
    () => ({
      status,
      user: data?.user ?? null,
      business: data?.business ?? null,
      isAdmin: data?.user.role === 'admin',
      ...branchAccess(data?.user, data?.business),
      error,
      signedOut,
      retry: () => void refetch(),
      signIn,
      refresh,
      logout,
    }),
    [status, data, error, refetch, signedOut, signIn, refresh, logout],
  )

  if (suspended || isApiError(error, 'business_suspended')) return <SuspendedScreen />

  return <SessionContext value={value}>{children}</SessionContext>
}

import { useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { isApiError } from '../api/client'

/** A page that no longer exists (items deleted, an old link) answers 404 → go back to the first page. */
export function useFirstPageOnMissing(error: unknown, page: number, setPage: (page: number) => void) {
  useEffect(() => {
    if (page > 1 && isApiError(error) && error.status === 404) setPage(1)
  }, [error, page, setPage])
}

/**
 * List filters kept in the URL (`?status=…&search=…&page=2`), so reloads, back/forward
 * and shared links keep them. Changing a filter resets the page.
 */
export function useListParams<K extends string>(keys: readonly K[]) {
  const [params, setParams] = useSearchParams()

  const values = {} as Record<K, string>
  for (const key of keys) values[key] = params.get(key) ?? ''

  const pageValue = Number(params.get('page'))
  const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1

  /** Several filters at once (one URL change): `{status: 'ordered', branch: 'none'}`; `''` removes one. */
  const setFilters = useCallback(
    (patch: Partial<Record<K, string>>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          for (const [key, value] of Object.entries(patch) as Array<[K, string | undefined]>) {
            if (value) next.set(key, value)
            else next.delete(key)
          }
          next.delete('page')
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const setFilter = useCallback((key: K, value: string) => setFilters({ [key]: value } as Partial<Record<K, string>>), [setFilters])

  const setPage = useCallback(
    (value: number) => {
      setParams((current) => {
        const next = new URLSearchParams(current)
        if (value > 1) next.set('page', String(value))
        else next.delete('page')
        return next
      })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    [setParams],
  )

  const reset = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams])

  const active = keys.some((key) => values[key])

  return { values, page, setFilter, setFilters, setPage, reset, active }
}

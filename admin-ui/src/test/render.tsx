import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { routes } from '../app/routes'
import { I18nProvider } from '../i18n/I18nProvider'
import type { Lang } from '../i18n/translate'
import { BRANCH_USER_ID } from '../mocks/branches'
import { store } from '../mocks/data'
import { ThemeProvider } from '../theme/ThemeProvider'

interface Options {
  /** Who is signed in (the mock session); `null` — nobody. `branch` — Bobur of Chilonzor (after `withBranches`). */
  as?: 'admin' | 'manager' | 'branch' | null
  lang?: Lang
}

const SIGNED_IN = { admin: 1, manager: 2, branch: BRANCH_USER_ID }

/** Renders the whole app (real routes, providers and API client) at `path`, against the mock API. */
export function renderApp(path = '/', { as = 'admin', lang = 'uz' }: Options = {}) {
  store.db.sessionUserId = as ? SIGNED_IN[as] : null
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } },
  })
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const user = userEvent.setup()
  const view = render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider defaultLang={lang}>
        <ThemeProvider>
          <RouterProvider router={router} />
        </ThemeProvider>
      </I18nProvider>
    </QueryClientProvider>,
  )
  return { ...view, user, router, queryClient }
}

/** Current location of a memory router as `pathname?search`. */
export function locationOf(router: ReturnType<typeof createMemoryRouter>) {
  const { pathname, search } = router.state.location
  return pathname + search
}

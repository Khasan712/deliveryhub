import type { RouteObject } from 'react-router'
import { AppLayout } from './components/AppLayout'
import { RequireAuth, Splash } from './components/RequireAuth'
import { Root } from './components/Root'
import { BusinessesPage } from './pages/BusinessesPage'
import { loadBusinessPage, loadCreatePage, loadLeadsPage, loadMobileAppPage } from './pages/lazy'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage, RouteError } from './pages/NotFoundPage'

/**
 * The same addresses as the old Django panel: /, /new, /b/<slug>, /login; and /leads (applications from our landing
 * page), /mobile (our mobile app).
 */
export const routes: RouteObject[] = [
  {
    element: <Root />,
    errorElement: <RouteError />,
    // Shown while the first page's code loads (a direct visit to /new or /b/<slug>).
    hydrateFallbackElement: <Splash />,
    children: [
      { path: 'login', element: <LoginPage /> },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { index: true, element: <BusinessesPage /> },
              {
                path: 'new',
                lazy: async () => ({ Component: (await loadCreatePage()).BusinessCreatePage }),
              },
              {
                path: 'b/:slug',
                lazy: async () => ({ Component: (await loadBusinessPage()).BusinessPage }),
              },
              {
                path: 'leads',
                lazy: async () => ({ Component: (await loadLeadsPage()).LeadsPage }),
              },
              {
                path: 'mobile',
                lazy: async () => ({ Component: (await loadMobileAppPage()).MobileAppPage }),
              },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
]

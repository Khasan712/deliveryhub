import { Outlet, type RouteObject } from 'react-router'
import { RequireAdmin, RequireAuth } from '../auth/guards'
import { LoginPage } from '../auth/LoginPage'
import { NotFound } from '../auth/SystemScreens'
import { TelegramSignInPage } from '../auth/TelegramSignInPage'
import { AppLayout } from '../layout/AppLayout'
import { AppRoot, RouteError } from './AppRoot'
import {
  CategoriesPage,
  ClientDetailPage,
  ClientEditPage,
  ClientsPage,
  DashboardPage,
  HoursPage,
  OrderDetailPage,
  OrdersPage,
  ProductFormPage,
  ProductsPage,
  SalesPage,
  TelegramPage,
  UnitsPage,
  UserFormPage,
  UsersPage,
} from './pages'

export const routes: RouteObject[] = [
  {
    element: <AppRoot />,
    errorElement: <RouteError />,
    children: [
      { path: '/login', element: <LoginPage /> },
      // Sign-in of the Telegram Mini App opened from the staff bot.
      { path: '/tg', element: <TelegramSignInPage /> },
      {
        element: (
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        ),
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'sales', element: <SalesPage /> },
          { path: 'orders', element: <OrdersPage /> },
          { path: 'orders/:id', element: <OrderDetailPage /> },
          { path: 'clients', element: <ClientsPage /> },
          { path: 'clients/:id', element: <ClientDetailPage /> },
          { path: 'clients/:id/edit', element: <ClientEditPage /> },
          { path: 'products', element: <ProductsPage /> },
          { path: 'products/new', element: <ProductFormPage /> },
          { path: 'products/:id/edit', element: <ProductFormPage /> },
          { path: 'categories', element: <CategoriesPage /> },
          { path: 'units', element: <UnitsPage /> },
          {
            path: 'users',
            element: (
              <RequireAdmin>
                <Outlet />
              </RequireAdmin>
            ),
            children: [
              { index: true, element: <UsersPage /> },
              { path: 'new', element: <UserFormPage /> },
              { path: ':id/edit', element: <UserFormPage /> },
            ],
          },
          { path: 'telegram', element: <TelegramPage /> },
          // Every staff member sees the working hours; only the admin role can change them (the page knows).
          { path: 'hours', element: <HoursPage /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]

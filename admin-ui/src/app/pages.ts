import { lazy } from 'react'

// Every page is its own chunk: charts (dashboard) and the voice engine (sales) load only where they are used.
export const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })))
export const OrdersPage = lazy(() => import('../features/orders/OrdersPage').then((m) => ({ default: m.OrdersPage })))
export const OrderDetailPage = lazy(() => import('../features/orders/OrderDetailPage').then((m) => ({ default: m.OrderDetailPage })))
export const ClientsPage = lazy(() => import('../features/clients/ClientsPage').then((m) => ({ default: m.ClientsPage })))
export const ClientDetailPage = lazy(() =>
  import('../features/clients/ClientDetailPage').then((m) => ({ default: m.ClientDetailPage })),
)
export const ClientEditPage = lazy(() => import('../features/clients/ClientEditPage').then((m) => ({ default: m.ClientEditPage })))
export const ProductsPage = lazy(() => import('../features/products/ProductsPage').then((m) => ({ default: m.ProductsPage })))
export const ProductFormPage = lazy(() =>
  import('../features/products/ProductFormPage').then((m) => ({ default: m.ProductFormPage })),
)
export const CategoriesPage = lazy(() =>
  import('../features/categories/CategoriesPage').then((m) => ({ default: m.CategoriesPage })),
)
export const UnitsPage = lazy(() => import('../features/units/UnitsPage').then((m) => ({ default: m.UnitsPage })))
export const UsersPage = lazy(() => import('../features/users/UsersPage').then((m) => ({ default: m.UsersPage })))
export const UserFormPage = lazy(() => import('../features/users/UserFormPage').then((m) => ({ default: m.UserFormPage })))
export const SalesPage = lazy(() => import('../features/sales/SalesPage').then((m) => ({ default: m.SalesPage })))
export const TelegramPage = lazy(() => import('../features/telegram/TelegramPage').then((m) => ({ default: m.TelegramPage })))
export const HoursPage = lazy(() => import('../features/hours/HoursPage').then((m) => ({ default: m.HoursPage })))

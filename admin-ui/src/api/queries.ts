import {
  keepPreviousData,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import {
  businessApi,
  categoriesApi,
  clientsApi,
  dashboardApi,
  ordersApi,
  productsApi,
  salesApi,
  telegramApi,
  unitsApi,
  usersApi,
} from './endpoints'
import type {
  ClientUpdate,
  NamePair,
  OrderDetail,
  OrderStatus,
  OrdersQuery,
  Paginated,
  Product,
  SalesData,
  StaffUserInput,
  TelegramData,
  TelegramLink,
  Week,
} from './types'

export const queryKeys = {
  me: ['me'] as const,
  dashboard: ['dashboard'] as const,
  orders: ['orders'] as const,
  orderList: (query: OrdersQuery) => ['orders', 'list', query] as const,
  newOrdersCount: ['orders', 'new-count'] as const,
  order: (id: string | number) => ['orders', 'detail', String(id)] as const,
  clients: ['clients'] as const,
  clientList: (query: object) => ['clients', 'list', query] as const,
  client: (id: string | number) => ['clients', 'detail', String(id)] as const,
  products: ['products'] as const,
  productLists: ['products', 'list'] as const,
  productList: (query: object) => ['products', 'list', query] as const,
  frozenCount: ['products', 'frozen-count'] as const,
  product: (id: string | number) => ['products', 'detail', String(id)] as const,
  business: ['business'] as const,
  categories: ['categories'] as const,
  categoryList: (search: string) => ['categories', 'list', search] as const,
  units: ['units'] as const,
  users: ['users'] as const,
  userList: (query: object) => ['users', 'list', query] as const,
  user: (id: string | number) => ['users', 'detail', String(id)] as const,
  sales: ['sales'] as const,
  telegram: ['telegram'] as const,
}

export const PAGE_SIZE = 20

/** Mutation key of freezing a product (its pending ids are read with `useFreezingIds`). */
const FREEZE_MUTATION = ['products', 'freeze'] as const

// ------------------------------------------------------------------ dashboard
export function useDashboard() {
  return useQuery({ queryKey: queryKeys.dashboard, queryFn: dashboardApi.get, refetchInterval: 60_000 })
}

// ------------------------------------------------------------------ working hours
/** The week and whether the business is open now (worked out by the server, so refreshed every minute). */
export function useWorkingHours() {
  return useQuery({ queryKey: queryKeys.business, queryFn: businessApi.get, refetchInterval: 60_000 })
}

export function useSaveWorkingHours() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (week: Week | null) => businessApi.setWeek(week),
    onSuccess: (hours) => client.setQueryData(queryKeys.business, hours),
  })
}

// ------------------------------------------------------------------ orders
export function useOrders(query: OrdersQuery) {
  return useQuery({
    queryKey: queryKeys.orderList(query),
    queryFn: () => ordersApi.list(query),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  })
}

/** Orders waiting to be processed — the badge next to "Orders" in the sidebar. */
export function useNewOrdersCount(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.newOrdersCount,
    queryFn: () => ordersApi.list({ status: 'ordered', page: 1, page_size: 1 }),
    select: (data) => data.count,
    refetchInterval: 60_000,
    enabled,
  })
}

export function useOrder(id: string | number) {
  return useQuery({ queryKey: queryKeys.order(id), queryFn: () => ordersApi.get(id) })
}

export function useUpdateOrderStatus(id: string | number) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (status: OrderStatus) => ordersApi.setStatus(id, status),
    onSuccess: (order: OrderDetail) => {
      client.setQueryData(queryKeys.order(id), order)
      void client.invalidateQueries({ queryKey: queryKeys.orders, refetchType: 'none' })
      void client.invalidateQueries({ queryKey: queryKeys.dashboard })
      void client.invalidateQueries({ queryKey: queryKeys.newOrdersCount })
      if (order.client?.id) void client.invalidateQueries({ queryKey: queryKeys.client(order.client.id) })
    },
  })
}

// ------------------------------------------------------------------ clients
export function useClients(query: { search?: string; page?: number }) {
  return useQuery({
    queryKey: queryKeys.clientList(query),
    queryFn: () => clientsApi.list({ ...query, page_size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })
}

export function useClient(id: string | number) {
  return useQuery({ queryKey: queryKeys.client(id), queryFn: () => clientsApi.get(id) })
}

export function useUpdateClient(id: string | number) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<ClientUpdate>) => clientsApi.update(id, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.clients })
    },
  })
}

// ------------------------------------------------------------------ products
export function useProducts(query: { search?: string; category?: string; frozen?: boolean; page?: number }) {
  return useQuery({
    queryKey: queryKeys.productList(query),
    queryFn: () => productsApi.list({ ...query, page_size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })
}

/** How many products are frozen — the counter on the "Frozen" filter. */
export function useFrozenCount() {
  return useQuery({
    queryKey: queryKeys.frozenCount,
    queryFn: () => productsApi.list({ frozen: true, page: 1, page_size: 1 }),
    select: (data) => data.count,
  })
}

interface FreezeVariables {
  id: number
  frozen: boolean
}

/** Writes `frozen` into every cached copy of a product: the lists, its edit page and the point of sale. */
function patchFrozen(client: QueryClient, id: number, frozen: boolean, frozenAt: string | null) {
  const update = (product: Product) => (product.id === id ? { ...product, frozen, frozen_at: frozenAt } : product)
  client.setQueriesData<Paginated<Product>>({ queryKey: queryKeys.productLists }, (page) =>
    page ? { ...page, results: page.results.map(update) } : page,
  )
  client.setQueryData<Product>(queryKeys.product(id), (product) => (product ? update(product) : product))
  client.setQueryData<SalesData>(queryKeys.sales, (data) =>
    data ? { ...data, products: data.products.map((item) => (item.id === id ? { ...item, frozen } : item)) } : data,
  )
}

/**
 * Freezes a product (sold out for now) or returns it to sale. Optimistic: every screen changes at once and goes
 * back if the request fails; afterwards the lists are refetched (a filtered list may lose the product).
 */
export function useSetProductFrozen() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: FREEZE_MUTATION,
    mutationFn: ({ id, frozen }: FreezeVariables) => productsApi.setFrozen(id, frozen),
    onMutate: async ({ id, frozen }) => {
      await Promise.all([
        client.cancelQueries({ queryKey: queryKeys.products }),
        client.cancelQueries({ queryKey: queryKeys.sales }),
      ])
      const snapshot = [
        ...client.getQueriesData({ queryKey: queryKeys.products }),
        ...client.getQueriesData({ queryKey: queryKeys.sales }),
      ]
      patchFrozen(client, id, frozen, frozen ? new Date().toISOString() : null)
      return { snapshot }
    },
    onError: (_error, _variables, context) => {
      context?.snapshot.forEach(([key, data]) => client.setQueryData(key, data))
    },
    onSuccess: (product) => patchFrozen(client, product.id, product.frozen, product.frozen_at),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.products })
      void client.invalidateQueries({ queryKey: queryKeys.sales })
    },
  })
}

/** Ids of the products being frozen / returned to sale right now (their buttons wait). */
export function useFreezingIds(): number[] {
  return useMutationState({
    filters: { mutationKey: FREEZE_MUTATION, status: 'pending' },
    select: (mutation) => (mutation.state.variables as FreezeVariables).id,
  })
}

export function useProduct(id: string | number | undefined) {
  return useQuery({
    queryKey: queryKeys.product(id ?? 'new'),
    queryFn: () => productsApi.get(id as string | number),
    enabled: id !== undefined,
  })
}

function useCatalogInvalidation() {
  const client = useQueryClient()
  return () => {
    void client.invalidateQueries({ queryKey: queryKeys.products })
    void client.invalidateQueries({ queryKey: queryKeys.categories })
    void client.invalidateQueries({ queryKey: queryKeys.sales })
    void client.invalidateQueries({ queryKey: queryKeys.dashboard })
  }
}

export function useSaveProduct(id?: string | number) {
  const invalidate = useCatalogInvalidation()
  return useMutation({
    mutationFn: (body: Record<string, unknown> | FormData) =>
      id === undefined ? productsApi.create(body) : productsApi.update(id, body),
    onSuccess: invalidate,
  })
}

export function useDeleteProduct() {
  const invalidate = useCatalogInvalidation()
  return useMutation({ mutationFn: (id: number) => productsApi.remove(id), onSuccess: invalidate })
}

// ------------------------------------------------------------------ categories & units
export function useCategories(search = '') {
  return useQuery({
    queryKey: queryKeys.categoryList(search),
    queryFn: () => categoriesApi.list(search || undefined),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })
}

export function useSaveCategory() {
  const invalidate = useCatalogInvalidation()
  return useMutation({
    mutationFn: ({ id, body }: { id?: number; body: NamePair }) =>
      id === undefined ? categoriesApi.create(body) : categoriesApi.update(id, body),
    onSuccess: invalidate,
  })
}

export function useDeleteCategory() {
  const invalidate = useCatalogInvalidation()
  return useMutation({ mutationFn: (id: number) => categoriesApi.remove(id), onSuccess: invalidate })
}

export function useUnits() {
  return useQuery({ queryKey: queryKeys.units, queryFn: unitsApi.list, staleTime: 60_000 })
}

export function useCreateUnit() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: NamePair) => unitsApi.create(body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.units })
    },
  })
}

// ------------------------------------------------------------------ staff users
export function useUsers(query: { search?: string; page?: number }) {
  return useQuery({
    queryKey: queryKeys.userList(query),
    queryFn: () => usersApi.list({ ...query, page_size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })
}

export function useUser(id: string | number | undefined) {
  return useQuery({
    queryKey: queryKeys.user(id ?? 'new'),
    queryFn: () => usersApi.get(id as string | number),
    enabled: id !== undefined,
  })
}

export function useSaveUser(id?: string | number) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<StaffUserInput>) =>
      id === undefined ? usersApi.create(body as StaffUserInput) : usersApi.update(id, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.users })
      void client.invalidateQueries({ queryKey: queryKeys.telegram })
    },
  })
}

export function useDeleteUser() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => usersApi.remove(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.users })
      void client.invalidateQueries({ queryKey: queryKeys.telegram })
    },
  })
}

// ------------------------------------------------------------------ sales
export function useSales() {
  return useQuery({ queryKey: queryKeys.sales, queryFn: salesApi.get, staleTime: 30_000 })
}

export function useCreateSale() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: salesApi.create,
    onSuccess: (data) => {
      client.setQueryData<SalesData>(queryKeys.sales, (current) =>
        current ? { ...current, stats: data.stats, recent: [data.order, ...current.recent].slice(0, 8) } : current,
      )
      void client.invalidateQueries({ queryKey: queryKeys.orders })
      void client.invalidateQueries({ queryKey: queryKeys.dashboard })
    },
  })
}

// ------------------------------------------------------------------ telegram
export function useTelegram() {
  return useQuery({ queryKey: queryKeys.telegram, queryFn: telegramApi.get })
}

export function useSetLinkNotify() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, notify }: { id: number; notify: boolean }) => telegramApi.setNotify(id, notify),
    onSuccess: (link, { id, notify }) => {
      // api.md documents the updated Link in the response; the OpenAPI file says 204 — handle both.
      const update = (item: TelegramLink) => (item.id === id ? (link ?? { ...item, notify_orders: notify }) : item)
      client.setQueryData<TelegramData>(queryKeys.telegram, (current) =>
        current
          ? { ...current, my_links: current.my_links.map(update), team_links: current.team_links.map(update) }
          : current,
      )
    },
  })
}

export function useUnlink() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => telegramApi.unlink(id),
    onSuccess: (_data, id) => {
      client.setQueryData<TelegramData>(queryKeys.telegram, (current) =>
        current
          ? {
              ...current,
              my_links: current.my_links.filter((item) => item.id !== id),
              team_links: current.team_links.filter((item) => item.id !== id),
            }
          : current,
      )
      void client.invalidateQueries({ queryKey: queryKeys.telegram })
    },
  })
}

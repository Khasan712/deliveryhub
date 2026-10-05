import {
  keepPreviousData,
  MutationCache,
  QueryCache,
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { ApiError } from './client'
import { authApi, businessesApi, leadsApi, mobileAppApi } from './endpoints'
import type {
  Bot,
  BotRole,
  BusinessCreateInput,
  BusinessDetail,
  BusinessList,
  BusinessProfilePatch,
  BusinessStatus,
  LeadCounts,
  LeadPatch,
  LeadStatus,
  MobileApp,
  PlatformUser,
} from './types'

export const queryKeys = {
  me: ['me'] as const,
  businesses: ['businesses', 'list'] as const,
  business: (slug: string) => ['businesses', 'detail', slug] as const,
  slugCheck: (slug: string) => ['slug-check', slug] as const,
  mobileApp: ['mobile-app'] as const,
  leadCounts: ['leads', 'counts'] as const,
  leadLists: ['leads', 'list'] as const,
  leadList: (status: LeadStatus | null, page: number) => ['leads', 'list', status ?? 'all', page] as const,
}

const BOT_ROLES: BotRole[] = ['client', 'admin']

/** Retry only what may pass next time: network failures and server errors. */
function shouldRetry(failureCount: number, error: unknown) {
  return error instanceof ApiError && (error.status === 0 || error.status >= 500) && failureCount < 2
}

export function createQueryClient(options: { retry?: boolean } = {}) {
  // Any 401 means the session is gone: forget the user, the auth guard sends them to the login page
  // with the current address as the return path.
  const onError = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) client.setQueryData(queryKeys.me, null)
  }
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: { staleTime: 15_000, retry: options.retry === false ? false : shouldRetry },
      mutations: { retry: false },
    },
  })
  return client
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

async function fetchMe(): Promise<PlatformUser | null> {
  try {
    return (await authApi.me()).user
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return null
    throw error
  }
}

/** The signed-in user (`null` — signed out); restores the session on load. */
export function useMe() {
  return useQuery({ queryKey: queryKeys.me, queryFn: fetchMe, staleTime: Infinity })
}

export function useLogin() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ phone, password }: { phone: string; password: string }) => authApi.login(phone, password),
    onSuccess: ({ user }) => client.setQueryData(queryKeys.me, user),
  })
}

/** POST /auth/logout. The caller moves to the login page, which then forgets the session (see forgetSession). */
export function useLogout() {
  return useMutation({ mutationFn: authApi.logout })
}

/** Drops the user and every cached answer of the old session. */
export function forgetSession(client: QueryClient) {
  client.removeQueries({ predicate: (query) => query.queryKey[0] !== queryKeys.me[0] })
  client.setQueryData(queryKeys.me, null)
}

// ---------------------------------------------------------------------------
// Businesses
// ---------------------------------------------------------------------------

export function useBusinesses() {
  return useQuery({ queryKey: queryKeys.businesses, queryFn: businessesApi.list })
}

/** How often a watched business is re-read (tests shorten it). */
export const polling = { intervalMs: 4000 }

/** Nothing to wait for: both bots are connected and the bot service runs them. */
function botsSettled(business: BusinessDetail | undefined) {
  return (
    business !== undefined &&
    business.missing_roles.length === 0 &&
    Object.values(business.bots).every((bot) => bot === null || bot.alive)
  )
}

/**
 * A business. Re-read every few seconds until `pollUntil` (ms timestamp) while its bots are being created or
 * started — stops earlier once both bots are connected and alive.
 */
export function useBusiness(slug: string, options: { pollUntil?: number } = {}) {
  const pollUntil = options.pollUntil ?? 0
  return useQuery({
    queryKey: queryKeys.business(slug),
    queryFn: ({ signal }) => businessesApi.get(slug, signal),
    refetchInterval: (query) =>
      Date.now() < pollUntil && !botsSettled(query.state.data) ? polling.intervalMs : false,
  })
}

/** Warms up a business page (on hover/focus of its card). */
export function usePrefetchBusiness() {
  const client = useQueryClient()
  return (slug: string) =>
    client.prefetchQuery({
      queryKey: queryKeys.business(slug),
      queryFn: ({ signal }) => businessesApi.get(slug, signal),
      staleTime: 15_000,
    })
}

export function useSlugCheck(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.slugCheck(slug),
    queryFn: ({ signal }) => businessesApi.checkSlug(slug, signal),
    enabled,
    staleTime: 10_000,
    retry: false,
  })
}

export function useCreateBusiness() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ input, logo }: { input: BusinessCreateInput; logo: File | null }) =>
      businessesApi.create(input, logo),
    onSuccess: ({ business }) => {
      client.setQueryData(queryKeys.business(business.slug), business)
      void client.invalidateQueries({ queryKey: queryKeys.businesses })
    },
  })
}

/** Stores a fresh BusinessDetail from a mutation and refreshes the list behind it. */
function useStoreBusiness() {
  const client = useQueryClient()
  return (business: BusinessDetail) => {
    client.setQueryData(queryKeys.business(business.slug), business)
    void client.invalidateQueries({ queryKey: queryKeys.businesses })
  }
}

export function useUpdateBusiness(slug: string) {
  const store = useStoreBusiness()
  return useMutation({
    mutationFn: ({ patch, logo }: { patch: BusinessProfilePatch; logo: File | null }) =>
      businessesApi.update(slug, patch, logo),
    onSuccess: store,
  })
}

export function useSetBusinessStatus(slug: string) {
  const store = useStoreBusiness()
  return useMutation({
    mutationFn: (status: BusinessStatus) => businessesApi.setStatus(slug, status),
    onSuccess: store,
  })
}

export function useDeleteBusiness(slug: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (confirm: string) => businessesApi.remove(slug, confirm),
    onSuccess: () => {
      client.removeQueries({ queryKey: queryKeys.business(slug) })
      client.setQueryData<BusinessList>(queryKeys.businesses, (list) =>
        list && { ...list, results: list.results.filter((each) => each.slug !== slug) },
      )
      void client.invalidateQueries({ queryKey: queryKeys.businesses })
    },
  })
}

export function useNewOwnerPassword(slug: string) {
  return useMutation({ mutationFn: () => businessesApi.newOwnerPassword(slug) })
}

export function useBotSetupLink(slug: string) {
  return useMutation({ mutationFn: () => businessesApi.setupLink(slug) })
}

/** Applies a bot change to the cached business at once, then re-reads it from the server. */
function useBotChange(slug: string) {
  const client = useQueryClient()
  return (role: BotRole, bot: Bot | null) => {
    client.setQueryData<BusinessDetail>(queryKeys.business(slug), (business) => {
      if (!business) return business
      const bots = { ...business.bots, [role]: bot }
      return { ...business, bots, missing_roles: BOT_ROLES.filter((each) => !bots[each]) }
    })
    void client.invalidateQueries({ queryKey: queryKeys.business(slug) })
    void client.invalidateQueries({ queryKey: queryKeys.businesses })
  }
}

export function useConnectBot(slug: string) {
  const change = useBotChange(slug)
  return useMutation({
    mutationFn: ({ role, token }: { role: BotRole; token: string }) => businessesApi.connectBot(slug, role, token),
    onSuccess: ({ bot }, { role }) => change(role, bot),
  })
}

export function useDisconnectBot(slug: string) {
  const change = useBotChange(slug)
  return useMutation({
    mutationFn: (role: BotRole) => businessesApi.disconnectBot(slug, role),
    onSuccess: (_, role) => change(role, null),
  })
}

// ---------------------------------------------------------------------------
// Mobile app
// ---------------------------------------------------------------------------

export function useMobileApp() {
  return useQuery({ queryKey: queryKeys.mobileApp, queryFn: mobileAppApi.get })
}

export function useSetMobileApp() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (business: string | null) => mobileAppApi.set(business),
    onSuccess: (data: MobileApp) => client.setQueryData(queryKeys.mobileApp, data),
  })
}

// ---------------------------------------------------------------------------
// Applications (the form of our landing page)
// ---------------------------------------------------------------------------

/** Applications on a page of the list. */
const LEADS_PAGE_SIZE = 20

/** How often the counts of applications are re-read while the panel is open (tests shorten it). */
export const leadsPolling = { intervalMs: 60_000 }

function sameCounts(a: LeadCounts, b: LeadCounts) {
  return (Object.keys(b) as LeadStatus[]).every((status) => a[status] === b[status])
}

/**
 * How many applications there are of each status — the menu badge. Re-read every minute and whenever the window
 * gets the focus back, so a new application shows up without a reload; when they change, the open list re-reads
 * too, so the badge, the tabs and the list agree.
 */
export function useLeadCounts() {
  const client = useQueryClient()
  return useQuery({
    queryKey: queryKeys.leadCounts,
    queryFn: async ({ signal }) => {
      // The smallest page: only the counts that come with it are needed.
      const { counts } = await leadsApi.list({ pageSize: 1 }, signal)
      const known = client.getQueryData<LeadCounts>(queryKeys.leadCounts)
      if (known && !sameCounts(known, counts)) void client.invalidateQueries({ queryKey: queryKeys.leadLists })
      return counts
    },
    refetchInterval: leadsPolling.intervalMs,
    refetchOnWindowFocus: true,
  })
}

/**
 * A page of applications, newest first (`status` null — all of them). Every answer brings the counts of all
 * applications, and they go to the menu badge too. Another tab or page keeps the last answer as a placeholder while
 * it loads (`isPlaceholderData`).
 */
export function useLeads(status: LeadStatus | null, page: number) {
  const client = useQueryClient()
  return useQuery({
    queryKey: queryKeys.leadList(status, page),
    queryFn: async ({ signal }) => {
      const list = await leadsApi.list({ status, page, pageSize: LEADS_PAGE_SIZE }, signal)
      client.setQueryData(queryKeys.leadCounts, list.counts)
      return list
    },
    placeholderData: keepPreviousData,
  })
}

/**
 * Changes the status or the note of an application. Settles once the lists are re-read: the application may have
 * moved to another tab, and the new counts reach the tabs and the badge with them.
 */
export function useUpdateLead() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: LeadPatch }) => leadsApi.update(id, patch),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.leadLists }),
  })
}

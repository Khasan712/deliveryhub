/* `npm run dev:mock` — the whole Admin API answered in the browser by MSW (no backend needed).
   Sign in with +998 90 123 45 67 / admin12345 (admin), +998 93 555 77 88 / manager12345 (manager) or
   +998 90 111 22 44 / branch12345 (Bobur, the admin of the Chilonzor branch). The business has branches;
   `?mock-branches=off` opens it without them, `?mock-branches=empty` with branches allowed but none opened yet.
   What you change survives a reload of the tab (sessionStorage); `?mock-reset` (or a `?mock-branches=…`) starts over. */
import { getResponse } from 'msw'
import { setupWorker } from 'msw/browser'
import { BRANCH_USER_ID, withBranches } from './branches'
import { store } from './data'
import { handlers, setMockLatency } from './handlers'

const SESSION_KEY = 'mock.session'
const DB_KEY = 'mock.db'

/** The data of the last visit in this tab, unless the URL asks for a fresh start. */
function restoreDb(params: URLSearchParams): boolean {
  if (params.has('mock-reset') || params.has('mock-branches')) {
    sessionStorage.removeItem(DB_KEY)
    return false
  }
  try {
    const saved = sessionStorage.getItem(DB_KEY)
    if (!saved) return false
    store.db = JSON.parse(saved) as typeof store.db
    return true
  } catch {
    return false
  }
}

function saveDb() {
  try {
    sessionStorage.setItem(DB_KEY, JSON.stringify(store.db))
  } catch {
    /* storage full or blocked: the next visit starts over */
  }
}

/** Where service workers are unavailable (some embedded browsers), answer `fetch` in the page itself. */
function patchFetch() {
  const original = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    if (new URL(request.url).pathname.startsWith('/api/')) {
      const response = await getResponse(handlers, request)
      if (response) return response
    }
    return original(input, init)
  }
}

export async function startMockApi() {
  const params = new URLSearchParams(window.location.search)
  setMockLatency(params.has('mock-fast') ? 0 : 350)
  if (!restoreDb(params)) {
    const branches = params.get('mock-branches')
    if (branches === 'empty') store.db.business.branches_enabled = true
    else if (branches !== 'off') withBranches(store.db)
  }
  // A reload keeps what was changed (an order sent to a branch, a new branch…), like the real server would.
  window.addEventListener('pagehide', saveDb)
  // Keep the mock session across page reloads; `?mock-as=admin|manager|branch` signs in directly (screenshots, demos).
  const saved = Number(sessionStorage.getItem(SESSION_KEY))
  if (saved) store.db.sessionUserId = saved
  const as = params.get('mock-as')
  const signIn: Record<string, number> = { admin: 1, manager: 2, branch: BRANCH_USER_ID }
  if (as && signIn[as] && store.db.users.some((user) => user.id === signIn[as])) store.db.sessionUserId = signIn[as]
  window.addEventListener('beforeunload', () => {
    if (store.db.sessionUserId) sessionStorage.setItem(SESSION_KEY, String(store.db.sessionUserId))
    else sessionStorage.removeItem(SESSION_KEY)
  })
  try {
    await setupWorker(...handlers).start({
      onUnhandledRequest: 'bypass',
      quiet: true,
      serviceWorker: { url: '/mockServiceWorker.js' },
    })
  } catch (error) {
    console.warn('[mock] Service worker unavailable, mocking fetch in the page instead:', error)
    patchFetch()
  }
  console.info('[mock] Admin API is mocked — sign in with +998901234567 / admin12345')
}

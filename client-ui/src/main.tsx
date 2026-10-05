import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { createQueryClient } from './app/queryClient'
import './index.css'
import { readStorage } from './lib/storage'
import { initTelegram, isTelegramLaunch, waitForTelegramSdk } from './lib/telegram'
import { watchForUpdates } from './lib/updates'
import { fetchShop, readCachedCatalog, shopQueryKey } from './state/catalog'

async function start() {
  watchForUpdates()
  const queryClient = createQueryClient()
  // The menu is asked for right away, not after the Telegram SDK below (up to seconds on a slow network); the last
  // menu of this device shows meanwhile. A Mini App signs in with initData first, so it asks without the token of
  // the website (CatalogProvider then reuses this request).
  const cached = readCachedCatalog()
  if (cached) queryClient.setQueryData(shopQueryKey, cached.data, { updatedAt: cached.savedAt })
  const token = isTelegramLaunch() ? null : readStorage<string | null>('token', null)
  const menu = { queryKey: shopQueryKey, queryFn: ({ signal }: { signal: AbortSignal }) => fetchShop(token, signal) }
  queryClient.fetchQuery({ ...menu, staleTime: 0 }).catch(() => {
    /* CatalogProvider shows the error and retries */
  })
  // Inside Telegram, index.html is loading telegram-web-app.js — the app needs it before the first render
  // (theme, sign-in with initData). On the website this resolves immediately.
  await waitForTelegramSdk()
  // index.html marks the page as a Mini App from the launch parameters; keep the mark only if the SDK agrees.
  if (!initTelegram()) document.documentElement.removeAttribute('data-tg')
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual'

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App queryClient={queryClient} />
    </StrictMode>,
  )
}

void start()

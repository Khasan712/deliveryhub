/**
 * A deploy replaces the panel on the server while it stays open (a cashier keeps it open all day, the Mini App) —
 * for hours. The old page then misses its code chunks (their names change with every build) and keeps
 * showing the old version. The new version is picked up at a calm moment: when a chunk fails to load, when the
 * panel comes back after a while in the background, and on the next move to another page (AppLayout).
 */
const BUILD = import.meta.env.VITE_BUILD_ID as string | undefined
const CHECK_EVERY_MS = 60_000
const AWAY_LONG_MS = 5 * 60_000
const RELOADED_AT = 'dh:reloaded-at'

let waiting = false
let checkedAt = 0
let hiddenAt = 0

/** Reloads the page, but not twice in 10 s: a server that is down must not make it loop. */
function reloadOnce(): boolean {
  try {
    if (Date.now() - (Number(sessionStorage.getItem(RELOADED_AT)) || 0) < 10_000) return false
    sessionStorage.setItem(RELOADED_AT, String(Date.now()))
  } catch {
    /* private mode: reload anyway */
  }
  window.location.reload()
  return true
}

/** Asks the server which build it serves (at most once a minute). */
export async function checkForUpdate(): Promise<boolean> {
  if (!BUILD || waiting || Date.now() - checkedAt < CHECK_EVERY_MS) return waiting
  checkedAt = Date.now()
  try {
    const response = await fetch('/version.json', { cache: 'no-store' })
    const { build } = (await response.json()) as { build?: unknown }
    waiting = typeof build === 'string' && build !== BUILD
  } catch {
    /* offline or an old server: next time */
  }
  return waiting
}

/** Loads the new version if one is waiting (the session and the page address survive a reload). */
export const reloadIfUpdated = () => waiting && reloadOnce()

export function watchForUpdates(): void {
  // Vite: a lazy chunk of this build is gone from the server.
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadOnce()) event.preventDefault()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
      return
    }
    const away = hiddenAt ? Date.now() - hiddenAt : 0
    void checkForUpdate().then((found) => {
      if (found && away >= AWAY_LONG_MS) reloadOnce()
    })
  })
}

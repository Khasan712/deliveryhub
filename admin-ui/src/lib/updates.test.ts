import { afterEach, describe, expect, it, vi } from 'vitest'

const reload = vi.fn<() => void>()

async function freshModule() {
  vi.resetModules()
  return import('./updates')
}

describe('a new version on the server', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    sessionStorage.clear()
  })

  it('is noticed and loaded on the next page change, once', async () => {
    vi.stubGlobal('location', { ...window.location, reload })
    const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      async () => new Response(JSON.stringify({ build: 'newer-build' })),
    )
    vi.stubGlobal('fetch', fetch)
    const updates = await freshModule()

    expect(updates.reloadIfUpdated()).toBe(false) // nothing known yet
    expect(await updates.checkForUpdate()).toBe(true)
    expect(fetch).toHaveBeenCalledWith('/version.json', { cache: 'no-store' })
    expect(updates.reloadIfUpdated()).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    // A server that keeps failing must not make the page reload in a loop.
    expect(updates.reloadIfUpdated()).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('keeps the page when the server serves this very build', async () => {
    const build = import.meta.env.VITE_BUILD_ID as string
    vi.stubGlobal('fetch', vi.fn<() => Promise<Response>>(async () => new Response(JSON.stringify({ build }))))
    const updates = await freshModule()
    expect(await updates.checkForUpdate()).toBe(false)
    expect(updates.reloadIfUpdated()).toBe(false)
  })
})

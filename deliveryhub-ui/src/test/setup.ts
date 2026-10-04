import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { polling } from '../api/queries'
import { backend } from './backend'
import { server } from './server'

// jsdom has <dialog> and its `open` property, but not the modal API.
if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
}
// Not in jsdom: WebGL for the map (a stand-in with a "click" button) and scrolling (ScrollRestoration).
vi.mock('../components/map/MapCanvas', () => import('./fakeMap'))
window.scrollTo = vi.fn<() => void>() as typeof window.scrollTo

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  backend.reset()
  polling.intervalMs = 30
  document.cookie = 'csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
})
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())

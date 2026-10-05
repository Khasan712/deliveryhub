import '@fontsource-variable/manrope'
import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'
import { createQueryClient } from './api/queries'
import { App } from './App'
import { routes } from './routes'

// A deploy removes the lazy chunks of the old build (pages, the map): load the new version once instead of failing —
// not twice in 10 s, so a server that is down cannot make the page loop.
window.addEventListener('vite:preloadError', (event) => {
  try {
    if (Date.now() - (Number(sessionStorage.getItem('dh:reloaded-at')) || 0) < 10_000) return
    sessionStorage.setItem('dh:reloaded-at', String(Date.now()))
  } catch {
    /* private mode: reload anyway */
  }
  event.preventDefault()
  window.location.reload()
})

const root = document.getElementById('root')
if (!root) throw new Error('#root is missing in index.html')

createRoot(root).render(
  <StrictMode>
    <App router={createBrowserRouter(routes)} queryClient={createQueryClient()} />
  </StrictMode>,
)

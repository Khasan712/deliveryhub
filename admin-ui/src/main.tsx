import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './index.css'
import { watchForUpdates } from './lib/updates'

async function start() {
  watchForUpdates()
  // `npm run dev:mock`: the API is answered by MSW in the browser (dev only, never in a production build).
  if (import.meta.env.MODE === 'mock') {
    const { startMockApi } = await import('./mocks/browser')
    await startMockApi()
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void start()

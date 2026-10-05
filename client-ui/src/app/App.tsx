import type { QueryClient } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { CrashScreen } from '../screens/StatusScreens'
import { AppShell } from './AppShell'
import { Providers } from './Providers'

export function App({ queryClient }: { queryClient: QueryClient }) {
  return (
    <Providers queryClient={queryClient}>
      <ErrorBoundary fallback={<CrashScreen />}>
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
      </ErrorBoundary>
    </Providers>
  )
}

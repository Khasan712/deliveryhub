import { isApiError } from '../api/client'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { useI18n } from '../i18n/i18n'
import { useDocumentTitle } from '../state/hooks'
import { useNav } from '../state/nav'

/** The whole shop is unavailable: suspended business (503) or unknown host (404). */
export function ShopUnavailable({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useI18n()
  const suspended = isApiError(error) && (error.code === 'business_suspended' || error.status === 503)
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <EmptyState
        icon={suspended ? 'store' : 'compass'}
        tone={suspended ? 'brand' : 'neutral'}
        title={suspended ? t('shopSuspended') : t('shopNotFound')}
        text={suspended ? t('shopSuspendedText') : t('shopNotFoundText')}
        action={
          suspended ? (
            <Button variant="dark" size="md" icon="refresh" onClick={onRetry}>
              {t('retry')}
            </Button>
          ) : null
        }
      />
    </main>
  )
}

/** Something broke while rendering (ErrorBoundary in App): a calm way back instead of a blank page. */
export function CrashScreen() {
  const { t } = useI18n()
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <EmptyState
        icon="alert"
        title={t('appCrashed')}
        text={t('appCrashedText')}
        action={
          <Button variant="dark" size="md" icon="refresh" onClick={() => window.location.reload()}>
            {t('reload')}
          </Button>
        }
      />
    </main>
  )
}

export function NotFoundScreen() {
  const { t } = useI18n()
  useDocumentTitle(t('pageNotFound'))
  const { go } = useNav()
  return (
    <EmptyState
      icon="compass"
      title={t('pageNotFound')}
      text={t('pageNotFoundText')}
      className="py-20"
      action={
        <Button size="md" onClick={() => go('/', { replace: true })}>
          {t('backToMenu')}
        </Button>
      }
    />
  )
}

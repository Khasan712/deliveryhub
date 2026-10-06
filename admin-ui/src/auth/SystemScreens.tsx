import type { ReactNode } from 'react'
import { errorMessage } from '../api/errors'
import { DeliveryHubMark } from '../components/DeliveryHubMark'
import { IconAlert, IconLock, IconRefresh } from '../components/icons'
import { Button, ButtonLink } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'
import { useI18n } from '../i18n/context'
import { cn } from '../lib/cn'

/** Full-screen centered layout with the platform backdrop (login, Telegram sign-in, system states). */
export function CenteredScreen({
  children,
  className,
  corner,
}: {
  children: ReactNode
  className?: string
  /** Pinned to the top-right corner of the screen (e.g. the language switch). */
  corner?: ReactNode
}) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-slate-950 px-4 py-16 text-white sm:py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_40rem_at_10%_-10%,rgba(249,115,22,0.24),transparent_60%),radial-gradient(50rem_35rem_at_110%_110%,rgba(244,63,94,0.16),transparent_60%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,0.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
      />
      {corner && <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">{corner}</div>}
      <div className={cn('relative w-full max-w-md animate-pop-in', className)}>{children}</div>
    </div>
  )
}

export function BrandMark({ className }: { className?: string }) {
  return <DeliveryHubMark className={cn('size-16 rounded-2xl shadow-lg', className)} />
}

function MessageScreen({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode
  title: string
  text: string
  action?: ReactNode
}) {
  return (
    <CenteredScreen>
      <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-8 text-center shadow-2xl backdrop-blur-xl">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
          {icon}
        </div>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">{text}</p>
        {action && <div className="mt-6 flex justify-center">{action}</div>}
      </div>
    </CenteredScreen>
  )
}

export function SuspendedScreen() {
  const { t } = useI18n()
  return <MessageScreen icon={<IconLock size={26} />} title={t('suspended_title')} text={t('suspended_text')} />
}

export function FullPageLoader() {
  const { t } = useI18n()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-app">
      <DeliveryHubMark className="size-12 rounded-2xl shadow-lg" />
      <Spinner size={20} className="text-primary-500" label={t('loading')} />
    </div>
  )
}

export function SessionErrorScreen({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useI18n()
  return (
    <MessageScreen
      icon={<IconAlert size={26} />}
      title={t('error_load_title')}
      text={errorMessage(error, t)}
      action={
        <Button variant="secondary" icon={<IconRefresh size={16} />} onClick={onRetry}>
          {t('retry')}
        </Button>
      }
    />
  )
}

/** In-layout "no access" (e.g. staff users page for managers). */
export function NoAccess() {
  const { t } = useI18n()
  return (
    <div className="flex flex-col items-center px-6 py-20 text-center">
      <div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20">
        <IconLock size={28} />
      </div>
      <h1 className="text-xl font-semibold text-fg">{t('no_access_title')}</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">{t('no_access_text')}</p>
      <ButtonLink to="/" variant="secondary" className="mt-6">
        {t('go_home')}
      </ButtonLink>
    </div>
  )
}

export function NotFound() {
  const { t } = useI18n()
  return (
    <div className="flex flex-col items-center px-6 py-20 text-center">
      <p className="bg-linear-to-br from-primary-500 to-primary-700 bg-clip-text text-7xl font-black tracking-tight text-transparent">
        404
      </p>
      <h1 className="mt-4 text-xl font-semibold text-fg">{t('not_found_title')}</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">{t('not_found_text')}</p>
      <ButtonLink to="/" variant="secondary" className="mt-6">
        {t('go_home')}
      </ButtonLink>
    </div>
  )
}

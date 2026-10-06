import { useState } from 'react'
import { errorMessage } from '../../api/errors'
import { useSetLinkNotify, useTelegram, useUnlink } from '../../api/queries'
import type { TelegramData, TelegramLink } from '../../api/types'
import { useAuthed } from '../../auth/session'
import { useConfirm, useToast } from '../../components/feedback/feedback'
import { IconAlert, IconBell, IconExternal, IconInfo, IconMic, IconPlus, IconQr, IconTelegram } from '../../components/icons'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { Select } from '../../components/ui/Form'
import { PageHeader } from '../../components/ui/PageHeader'
import { Skeleton } from '../../components/ui/Skeleton'
import { Callout, EmptyState, ErrorState } from '../../components/ui/States'
import { Switch } from '../../components/ui/Switch'
import { useI18n } from '../../i18n/context'
import { formatDate, formatDateTime } from '../../lib/format'
import { InviteModal } from './InviteModal'

export function TelegramPage() {
  const { t } = useI18n()
  const { data, isLoading, error, refetch } = useTelegram()
  const { isAdmin } = useAuthed()
  const [invite, setInvite] = useState<{ open: boolean; userId?: number }>({ open: false })

  const openInvite = (userId?: number) => setInvite({ open: true, userId })

  return (
    <>
      <PageHeader title={t('nav_telegram')} />
      {error && !data ? (
        <Card>
          <ErrorState error={error} onRetry={() => void refetch()} />
        </Card>
      ) : isLoading || !data ? (
        <div className="space-y-6" aria-busy="true">
          <Skeleton className="h-44 rounded-3xl" />
          <div className="grid gap-6 lg:grid-cols-5">
            <Skeleton className="h-64 rounded-2xl lg:col-span-3" />
            <Skeleton className="h-64 rounded-2xl lg:col-span-2" />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <BotHero data={data} />
          {!data.bot ? (
            <Callout tone="info" icon={<IconInfo size={18} />}>
              {t('tg_not_connected_hint')}
            </Callout>
          ) : !data.bot.alive ? (
            <Callout tone="warning" icon={<IconAlert size={18} />}>
              {t('tg_offline_hint')}
            </Callout>
          ) : null}
          {data.bot && !data.voice_ready && (
            <Callout tone="ai" icon={<IconMic size={18} />}>
              {t('tg_voice_off')}
            </Callout>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <Card className="self-start lg:col-span-3" aria-labelledby="tg-my-account">
              <CardHeader
                id="tg-my-account"
                title={t('tg_my_account')}
                actions={
                  data.bot && data.my_links.length > 0 ? (
                    <Button variant="ghost" size="sm" icon={<IconPlus size={16} />} onClick={() => openInvite()}>
                      {t('tg_connect_another')}
                    </Button>
                  ) : undefined
                }
              />
              {data.my_links.length ? (
                <ul className="divide-y divide-line">
                  {data.my_links.map((link) => (
                    <LinkRow key={link.id} link={link} />
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col items-center px-6 py-10 text-center">
                  <span className="flex size-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 ring-1 ring-sky-100 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/20">
                    <IconTelegram size={28} className="-rotate-12" />
                  </span>
                  <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">{t('tg_not_linked')}</p>
                  <Button
                    variant="telegram"
                    className="mt-5"
                    icon={<IconQr size={18} />}
                    disabled={!data.bot}
                    onClick={() => openInvite()}
                  >
                    {t('tg_connect')}
                  </Button>
                </div>
              )}
            </Card>
            <HowItWorks />
          </div>

          {isAdmin && <TeamCard data={data} onInvite={openInvite} />}
        </div>
      )}
      <InviteModal open={invite.open} userId={invite.userId} onClose={() => setInvite({ open: false })} />
    </>
  )
}

function BotHero({ data }: { data: TelegramData }) {
  const { t } = useI18n()
  const bot = data.bot
  return (
    <section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-sky-500 via-sky-600 to-blue-600 p-6 text-white shadow-lg shadow-sky-600/20 sm:p-8">
      <div aria-hidden="true" className="absolute -right-16 -top-16 size-64 rounded-full bg-white/10" />
      <div aria-hidden="true" className="absolute -bottom-24 right-24 size-56 rounded-full bg-white/5" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
          <IconTelegram size={32} strokeWidth={1.8} className="-rotate-12" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-bold tracking-tight">{t('tg_title')}</h2>
          <p className="mt-1 text-sky-100">{t('tg_subtitle')}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            {!bot ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 ring-1 ring-white/25">
                <span className="size-2 rounded-full bg-slate-300" />
                {t('tg_not_configured')}
              </span>
            ) : bot.alive ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/20 px-2.5 py-1 ring-1 ring-emerald-200/40">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-300 opacity-75" />
                  <span className="relative size-2 rounded-full bg-emerald-300" />
                </span>
                {t('tg_online')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/25 px-2.5 py-1 ring-1 ring-amber-200/40">
                <span className="size-2 rounded-full bg-amber-300" />
                {t('tg_offline')}
              </span>
            )}
            {bot && <span className="rounded-full bg-white/10 px-2.5 py-1 font-medium">@{bot.username}</span>}
          </div>
        </div>
        {bot && (
          <a
            href={`https://t.me/${bot.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 font-semibold text-sky-700 shadow transition-colors hover:bg-sky-50"
          >
            {t('tg_open_bot')}
            <IconExternal size={16} />
          </a>
        )}
      </div>
    </section>
  )
}

function HowItWorks() {
  const { t } = useI18n()
  const steps = [
    ['tg_how_1', 'tg_how_1_sub'],
    ['tg_how_2', 'tg_how_2_sub'],
    ['tg_how_3', 'tg_how_3_sub'],
    ['tg_how_4', 'tg_how_4_sub'],
  ] as const
  return (
    <Card className="self-start p-6 lg:col-span-2">
      <h2 className="text-[15px] font-semibold text-fg">{t('tg_how_title')}</h2>
      <ol className="mt-5 space-y-4">
        {steps.map(([title, sub], index) => (
          <li key={title} className="flex gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-sky-500 to-blue-500 text-sm font-bold text-white shadow-sm">
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="font-medium text-fg">{t(title)}</p>
              <p className="text-sm text-muted">{t(sub)}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  )
}

function TeamCard({ data, onInvite }: { data: TelegramData; onInvite: (userId?: number) => void }) {
  const { t } = useI18n()
  const { user: me } = useAuthed()
  const [selected, setSelected] = useState(String(me.id))

  return (
    <Card aria-labelledby="tg-team">
      <CardHeader
        id="tg-team"
        title={t('tg_team')}
        description={t('tg_team_hint')}
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Select
              aria-label={t('tg_select_user')}
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
              selectSize="sm"
              className="sm:w-56"
            >
              {data.users.map((user) => (
                <option key={user.id} value={String(user.id)}>
                  {user.name}
                  {user.id === me.id ? ` (${t('tg_you')})` : ''}
                </option>
              ))}
            </Select>
            <Button
              variant="telegram"
              size="sm"
              className="h-9"
              icon={<IconQr size={16} />}
              disabled={!data.bot || !selected}
              onClick={() => onInvite(Number(selected))}
            >
              {t('tg_create_link')}
            </Button>
          </div>
        }
      />
      {data.team_links.length ? (
        <ul className="divide-y divide-line">
          {data.team_links.map((link) => (
            <LinkRow key={link.id} link={link} team />
          ))}
        </ul>
      ) : (
        <EmptyState compact icon={<IconTelegram size={24} className="-rotate-12" />} title={t('tg_no_links')} />
      )}
    </Card>
  )
}

function linkName(link: TelegramLink) {
  return link.first_name || (link.username ? `@${link.username}` : String(link.telegram_id))
}

function LinkRow({ link, team }: { link: TelegramLink; team?: boolean }) {
  const { t, lang } = useI18n()
  const toast = useToast()
  const confirm = useConfirm()
  const notify = useSetLinkNotify()
  const unlink = useUnlink()
  const display = linkName(link)

  const toggle = (value: boolean) =>
    notify.mutate(
      { id: link.id, notify: value },
      {
        onSuccess: () => toast.success(value ? t('tg_notify_on') : t('tg_notify_off')),
        onError: (error) => toast.error(errorMessage(error, t)),
      },
    )

  const askUnlink = () =>
    void confirm({
      title: t('tg_unlink_confirm'),
      message: (
        <>
          <span className="font-semibold text-fg">{team ? `${link.user.name} · ${display}` : display}</span>
          <span className="mt-1 block">{t('tg_unlink_text')}</span>
        </>
      ),
      confirmLabel: t('tg_unlink'),
      onConfirm: async () => {
        await unlink.mutateAsync(link.id)
        toast.success(t('tg_unlinked'))
      },
    })

  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-sky-400 to-blue-500 font-semibold text-white">
          {(team ? link.user.name : display).trim().charAt(0).toUpperCase() || '?'}
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{team ? link.user.name : display}</p>
          <p className="truncate text-[13px] text-muted">
            {team
              ? `Telegram: ${display}${link.username && link.first_name ? ` · @${link.username}` : ''}`
              : `${link.username ? `@${link.username} · ` : ''}${t('tg_linked_at')} ${formatDate(link.created_at, lang)}`}
          </p>
          {link.blocked && (
            <Badge tone="red" size="xs" className="mt-1">
              {t('tg_blocked')}
            </Badge>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 text-sm sm:gap-4">
        {team && (
          <span className="hidden text-[13px] text-muted md:block">
            {t('tg_last_seen')}: {link.last_seen_at ? formatDateTime(link.last_seen_at, lang) : '—'}
          </span>
        )}
        <div className="flex items-center gap-2">
          <IconBell size={16} className="text-faint" />
          <span className="hidden text-[13px] text-fg-soft sm:inline" aria-hidden="true">
            {t('tg_notifications')}
          </span>
          <Switch
            checked={link.notify_orders}
            onChange={toggle}
            loading={notify.isPending}
            label={`${t('tg_notifications')}: ${team ? link.user.name : display}`}
            tone="green"
          />
        </div>
        <Button variant="danger-soft" size="sm" onClick={askUnlink} className="ml-auto sm:ml-0">
          {t('tg_unlink')}
        </Button>
      </div>
    </li>
  )
}

import { useState, type FormEvent } from 'react'
import { isApiError } from '../../api/client'
import { errorMessage } from '../../api/errors'
import { useSaveWorkingHours, useWorkingHours } from '../../api/queries'
import type { WorkingHours } from '../../api/types'
import { useAuthed } from '../../auth/session'
import { useConfirm, useToast } from '../../components/feedback/feedback'
import { IconAlert, IconClock, IconCopy, IconGlobe, IconLock, IconMoon, IconPlus } from '../../components/icons'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { Input } from '../../components/ui/Form'
import { PageHeader } from '../../components/ui/PageHeader'
import { Skeleton } from '../../components/ui/Skeleton'
import { Callout, EmptyState, ErrorState } from '../../components/ui/States'
import { Switch } from '../../components/ui/Switch'
import { Tooltip } from '../../components/ui/Tooltip'
import { useI18n } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { useUnsavedChanges } from '../../lib/useUnsavedChanges'
import {
  clockAt,
  dayErrors,
  dayName,
  everyDay,
  onDayName,
  overnightNote,
  sameWeek,
  statusDetail,
  toDraft,
  toWeek,
  zoneLabel,
  type DayDraft,
  type DayErrors,
} from './hours'

const TODAY_ROW = 'bg-primary-50/70 ring-1 ring-primary-200 dark:bg-primary-500/10 dark:ring-primary-500/25'

/** Working hours: the admin edits the week, every other staff member sees it read-only. */
export function HoursPage() {
  const { t, lang } = useI18n()
  const { isAdmin } = useAuthed()
  const toast = useToast()
  const confirm = useConfirm()
  const hours = useWorkingHours()
  const save = useSaveWorkingHours()
  // `undefined` — nothing edited yet: the editor shows the saved week (and follows background refreshes).
  const [edited, setEdited] = useState<DayDraft[] | undefined>(undefined)
  const [errors, setErrors] = useState<Record<number, DayErrors>>({})

  const saved = hours.data?.week ?? null
  const days = edited ?? (saved ? toDraft(saved) : null)
  const dirty = edited !== undefined && !sameWeek(toWeek(edited), saved)
  useUnsavedChanges(dirty)

  const header = <PageHeader title={t('hours_title')} description={t('hours_subtitle')} />

  if (!hours.data) {
    return (
      <div className="max-w-3xl">
        {header}
        {hours.error ? (
          <Card>
            <ErrorState error={hours.error} onRetry={() => void hours.refetch()} />
          </Card>
        ) : (
          <div className="space-y-6" aria-busy="true">
            <Skeleton className="h-[92px] rounded-2xl" />
            <Skeleton className="h-[30rem] rounded-2xl" />
          </div>
        )}
      </div>
    )
  }

  // "Now" is when the server answered (refreshed every minute) — the moment its open / closed status describes.
  const now = hours.dataUpdatedAt
  const today = clockAt(now, hours.data.timezone).weekday

  const change = (next: DayDraft[]) => {
    setEdited(next)
    if (save.error) save.reset()
  }

  const update = (index: number, patch: Partial<DayDraft>) => {
    if (!days) return
    change(days.map((day, position) => (position === index ? { ...day, ...patch } : day)))
    if (errors[index]) {
      setErrors((current) => {
        const next = { ...current }
        delete next[index]
        return next
      })
    }
  }

  const applyToAll = (index: number) => {
    if (!days) return
    const source = days[index]
    change(days.map(() => ({ ...source })))
    setErrors({})
    toast.info(t('hours_applied_all', { day: onDayName(index, lang) }))
  }

  const reset = () => {
    setEdited(undefined)
    setErrors({})
    save.reset()
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!dirty || !edited || save.isPending) return
    const found: Record<number, DayErrors> = {}
    edited.forEach((day, index) => {
      const problems = dayErrors(day)
      if (problems) found[index] = problems
    })
    setErrors(found)
    const first = Object.keys(found).map(Number)[0]
    if (first !== undefined) {
      document.getElementById(`hours-${first}-${found[first].open ? 'open' : 'close'}`)?.focus()
      return
    }
    save.mutate(toWeek(edited), {
      onSuccess: () => {
        setEdited(undefined)
        toast.success(t('hours_saved'))
      },
      // A validation answer is shown above the week; anything else is a toast.
      onError: (error) => {
        if (!isApiError(error, 'validation')) toast.error(errorMessage(error, t))
      },
    })
  }

  const askRemove = () =>
    void confirm({
      title: t('hours_remove_title'),
      message: t('hours_remove_text'),
      confirmLabel: t('hours_remove_confirm'),
      onConfirm: async () => {
        await save.mutateAsync(null)
        setEdited(undefined)
        setErrors({})
        toast.success(t('hours_removed'))
      },
    })

  return (
    <div className="max-w-3xl">
      {header}
      <form onSubmit={submit} noValidate className="space-y-6">
        <StatusCard hours={hours.data} now={now} />

        {!isAdmin && (
          <Callout tone="info" icon={<IconLock size={18} />}>
            {t('hours_admin_only')}
          </Callout>
        )}

        {days ? (
          <Card aria-labelledby="hours-week">
            <CardHeader id="hours-week" title={t('hours_week')} description={isAdmin ? t('hours_week_hint') : undefined} />
            {isApiError(save.error, 'validation') && (
              <Callout tone="danger" icon={<IconAlert size={18} />} className="mx-3 mt-3 sm:mx-4">
                {t('hours_invalid')}
              </Callout>
            )}
            <ul className="space-y-1 p-2 sm:p-3">
              {days.map((day, index) =>
                isAdmin ? (
                  <DayRow
                    key={index}
                    index={index}
                    day={day}
                    today={index === today}
                    errors={errors[index]}
                    disabled={save.isPending}
                    onChange={(patch) => update(index, patch)}
                    onApplyToAll={() => applyToAll(index)}
                  />
                ) : (
                  <ReadOnlyDay key={index} index={index} day={day} today={index === today} />
                ),
              )}
            </ul>
          </Card>
        ) : (
          <Card>
            <EmptyState
              icon={<IconClock size={26} />}
              title={t('hours_empty_title')}
              description={t('hours_empty_text')}
              action={
                isAdmin ? (
                  <Button icon={<IconPlus size={18} />} onClick={() => change(everyDay())}>
                    {t('hours_set')}
                  </Button>
                ) : undefined
              }
            />
          </Card>
        )}

        {/* Back to "no hours" (open at any time): a secondary action, asked first. */}
        {isAdmin && saved && (
          <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-line-strong px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] text-muted">{t('hours_remove_hint')}</p>
            <Button variant="danger-soft" size="sm" className="self-start sm:self-auto" onClick={askRemove}>
              {t('hours_remove')}
            </Button>
          </div>
        )}

        {isAdmin && (
          <div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-app/85 px-4 py-3 backdrop-blur-lg sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-2xl lg:border lg:bg-card/90 lg:px-5">
            <div className="flex items-center gap-2 sm:justify-end">
              {dirty && (
                <p className="mr-auto hidden items-center gap-2 text-[13px] font-medium text-muted sm:flex">
                  <span className="size-2 rounded-full bg-amber-500" aria-hidden="true" />
                  {t('hours_unsaved')}
                </p>
              )}
              <Button variant="secondary" className="flex-1 sm:flex-none" onClick={reset} disabled={!dirty || save.isPending}>
                {t('cancel')}
              </Button>
              <Button
                type="submit"
                className="flex-1 sm:flex-none"
                loading={save.isPending && save.variables !== null}
                disabled={!dirty}
              >
                {t('save_changes')}
              </Button>
            </div>
          </div>
        )}
      </form>
    </div>
  )
}

/** Open or closed right now (the server's answer), and when that changes — on the business's clock. */
function StatusCard({ hours, now }: { hours: WorkingHours; now: number }) {
  const { t, lang } = useI18n()
  const open = hours.open
  return (
    <section
      aria-labelledby="hours-status"
      className={cn(
        'flex items-center gap-4 rounded-2xl border p-4 shadow-card sm:p-5',
        open
          ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/20 dark:bg-emerald-500/[0.07]'
          : 'border-amber-200 bg-amber-50/70 dark:border-amber-500/20 dark:bg-amber-500/[0.07]',
      )}
    >
      <span
        className={cn(
          'relative flex size-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm',
          open ? 'bg-emerald-500 shadow-emerald-500/30' : 'bg-amber-500 shadow-amber-500/30',
        )}
      >
        <IconClock size={24} />
        {open && (
          <span className="absolute -right-1 -top-1 flex size-3.5" aria-hidden="true">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative size-3.5 rounded-full border-2 border-white bg-emerald-400 dark:border-slate-900" />
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="hours-status" className="text-base font-semibold text-fg sm:text-lg">
          {open ? t('hours_open_now') : t('hours_closed_now')}
        </h2>
        <p className="mt-0.5 text-sm text-fg-soft">{statusDetail(hours, lang, now)}</p>
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
          <IconGlobe size={13} className="shrink-0" />
          {zoneLabel(hours.timezone, lang)}
        </p>
      </div>
    </section>
  )
}

interface DayRowProps {
  index: number
  day: DayDraft
  today: boolean
  errors?: DayErrors
  disabled?: boolean
  onChange: (patch: Partial<DayDraft>) => void
  onApplyToAll: () => void
}

/**
 * One editable day. Phones: switch · day · copy on the first line, the times below. Wider screens: one line.
 * A close not after the open is the next day — a hint says so («ertasi kuni 02:00 gacha»).
 */
function DayRow({ index, day, today, errors, disabled, onChange, onApplyToAll }: DayRowProps) {
  const { t, lang } = useI18n()
  const label = dayName(index, lang)
  const note = overnightNote(day, lang)
  const error = errors?.open ?? errors?.close
  const noteId = `hours-${index}-note`

  const timeInput = (field: 'open' | 'close') => {
    const invalid = !!errors?.[field]
    return (
      <Input
        id={`hours-${index}-${field}`}
        type="time"
        value={day[field]}
        onChange={(event) => onChange({ [field]: event.target.value })}
        aria-label={t(field === 'open' ? 'hours_open_label' : 'hours_close_label', { day: label })}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid || (field === 'close' && note) ? noteId : undefined}
        disabled={disabled}
        className="w-[5.75rem]! px-2! font-semibold tabular"
      />
    )
  }

  return (
    <li
      className={cn(
        'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 rounded-2xl px-3 py-3 sm:grid-cols-[auto_9rem_minmax(0,1fr)_auto] sm:px-4',
        today && TODAY_ROW,
      )}
    >
      <Switch
        checked={day.working}
        onChange={(working) => onChange({ working })}
        label={t('hours_working_day', { day: label })}
        tone="green"
        disabled={disabled}
      />
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-semibold text-fg">
          <span className="truncate">{label}</span>
          {today && (
            <Badge tone="blue" size="xs">
              {t('today')}
            </Badge>
          )}
        </p>
        <p className={cn('text-xs font-medium', day.working ? 'text-emerald-600 dark:text-emerald-400' : 'text-faint')}>
          {day.working ? t('hours_open') : t('hours_day_off')}
        </p>
      </div>

      {day.working && (
        <div className="col-span-3 flex min-w-0 flex-wrap items-center gap-2 sm:col-span-1 sm:col-start-3 sm:row-start-1">
          {day.allDay ? (
            <span className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-50 px-3.5 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25">
              <IconClock size={16} />
              {t('hours_around_clock')}
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              {timeInput('open')}
              <span className="text-faint" aria-hidden="true">
                –
              </span>
              {timeInput('close')}
            </span>
          )}
          <button
            type="button"
            aria-pressed={day.allDay}
            aria-label={t('hours_all_day_label', { day: label })}
            onClick={() => onChange({ allDay: !day.allDay })}
            disabled={disabled}
            className={cn(
              'inline-flex h-8 shrink-0 items-center rounded-full px-3 text-xs font-semibold transition-colors disabled:opacity-50',
              day.allDay
                ? 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700'
                : 'bg-subtle text-fg-soft hover:bg-line hover:text-fg',
            )}
          >
            {t('hours_all_day')}
          </button>
        </div>
      )}

      {day.working && (
        <span className="col-start-3 row-start-1 sm:col-start-4">
          <Tooltip content={t('hours_apply_all')}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('hours_apply_all_label', { day: label })}
              onClick={onApplyToAll}
              disabled={disabled}
            >
              <IconCopy size={16} />
            </Button>
          </Tooltip>
        </span>
      )}

      {(error || note) && (
        <p
          id={noteId}
          className={cn(
            'col-span-3 flex items-center gap-1.5 text-xs font-medium sm:col-span-2 sm:col-start-3',
            error ? 'text-rose-600 dark:text-rose-400' : 'text-indigo-600 dark:text-indigo-300',
          )}
        >
          {error ? <IconAlert size={14} className="shrink-0" /> : <IconMoon size={14} className="shrink-0" />}
          {error ? t(error) : note}
        </p>
      )}
    </li>
  )
}

/** A day as managers see it (they cannot change the hours). */
function ReadOnlyDay({ index, day, today }: { index: number; day: DayDraft; today: boolean }) {
  const { t, lang } = useI18n()
  const note = overnightNote(day, lang)
  return (
    <li className={cn('flex items-center justify-between gap-3 rounded-2xl px-3 py-3 sm:px-4', today && TODAY_ROW)}>
      <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-fg">
        <span className="truncate">{dayName(index, lang)}</span>
        {today && (
          <Badge tone="blue" size="xs">
            {t('today')}
          </Badge>
        )}
      </p>
      <div className="shrink-0 text-right">
        <p className={cn('text-sm font-semibold tabular', day.working ? 'text-fg' : 'text-faint')}>
          {!day.working ? t('hours_day_off') : day.allDay ? t('hours_around_clock') : `${day.open} – ${day.close}`}
        </p>
        {note && <p className="text-xs font-medium text-indigo-600 dark:text-indigo-300">{note}</p>}
      </div>
    </li>
  )
}

// Working hours (docs/api.md → "Working hours"), worked out live on the business's clock: the same rules as the
// backend (apps/platform/hours.py), which refuses orders while the business is closed.
import type { Shift, WorkingHours } from '../api/types'
import type { I18n } from '../i18n/i18n'

const MINUTE = 60_000
/** The status is worked out again this often. */
const CLOCK_MS = 30_000
const DAY = 24 * 60 * MINUTE
/** How far the status looks: the longest closed stretch has to fit (a week off and a day around it). */
const HORIZON_DAYS = 8

/** A moment as the business's clock shows it: milliseconds of the UTC date with the same numbers. */
export type WallTime = number

export interface OpenStatus {
  open: boolean
  /** While open: when it closes (null: never). While closed: when it opens next (null: on no day). */
  next: WallTime | null
  now: WallTime
}

/** `date` on the clock of `timeZone` (the device's own clock if the zone is unknown). */
export function wallClock(date: Date, timeZone: string): WallTime {
  try {
    const parts: Record<string, number> = {}
    const format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    for (const part of format.formatToParts(date)) parts[part.type] = Number(part.value)
    return Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!)
  } catch {
    return date.getTime() - date.getTimezoneOffset() * MINUTE
  }
}

const minutes = (value: string) => {
  const [hours = 0, mins = 0] = value.split(':').map(Number)
  return hours * 60 + mins
}

/** Monday 0 … Sunday 6. */
export const weekday = (wall: WallTime) => (new Date(wall).getUTCDay() + 6) % 7

function shifts(week: (Shift | null)[], midnight: WallTime): [WallTime, WallTime][] {
  const result: [WallTime, WallTime][] = []
  for (let offset = -1; offset < HORIZON_DAYS; offset++) {
    const day = midnight + offset * DAY
    const shift = week[weekday(day)]
    if (!shift) continue
    const start = minutes(shift.open)
    let end = minutes(shift.close)
    if (end <= start) end += 24 * 60
    result.push([day + start * MINUTE, day + end * MINUTE])
  }
  return result
}

/** Open or closed at `date`, and when that changes; null when the business has no hours (open at any time). */
export function openStatus(hours: WorkingHours | null | undefined, date = new Date()): OpenStatus | null {
  if (!hours?.week) return null
  const now = wallClock(date, hours.timezone)
  const midnight = now - (now % DAY)
  const all = shifts(hours.week, midnight)
  const horizon = midnight + (HORIZON_DAYS - 1) * DAY

  const current = all.find(([start, end]) => start <= now && now < end)
  if (current) {
    let closes = current[1]
    for (;;) {
      const follow = all.find(([start, end]) => start <= closes && closes < end)
      if (!follow || closes >= horizon) break
      closes = follow[1]
    }
    return { open: true, next: closes < horizon ? closes : null, now }
  }
  const upcoming = all.map(([start]) => start).filter((start) => start > now)
  return { open: false, next: upcoming.length ? Math.min(...upcoming) : null, now }
}

const pad = (value: number) => String(value).padStart(2, '0')

/** "09:00" of a wall time. */
export const clockTime = (wall: WallTime) => {
  const date = new Date(wall)
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
}

/** "bugun 09:00 da" / "ertaga 09:00 da" / "seshanba 09:00 da" — when a closed business opens. */
function opensWhen(status: OpenStatus, t: I18n['t']): string {
  const days = Math.floor(status.next! / DAY) - Math.floor(status.now / DAY)
  const time = clockTime(status.next!)
  if (days === 0) return t('atToday', { time })
  if (days === 1) return t('atTomorrow', { time })
  return t('atDay', { day: t(`onDay_${weekday(status.next!)}` as 'onDay_0'), time })
}

/** The status in a few words: "Ochiq · 22:00 gacha", "Yopiq · ertaga 09:00 da ochiladi". */
export function statusLabel(status: OpenStatus, t: I18n['t']): string {
  if (status.open) {
    if (status.next === null) return t('openAllDay')
    const tomorrow = Math.floor(status.next / DAY) > Math.floor(status.now / DAY)
    return t('openUntil', { until: t(tomorrow ? 'untilTomorrow' : 'untilToday', { time: clockTime(status.next) }) })
  }
  return status.next === null ? t('closedNow') : t('closedOpens', { when: opensWhen(status, t) })
}

/** The notice of a closed business: "Hozir yopiqmiz — ertaga 09:00 da ochilamiz. Savatingiz saqlanib turadi." */
export function closedNotice(status: OpenStatus, t: I18n['t']): string {
  return status.next === null ? t('closedNoticeNoTime') : t('closedNotice', { when: opensWhen(status, t) })
}

/** "09:00 – 22:00" of a shift ("24 soat" for the whole day). */
export function shiftLabel(shift: Shift, t: I18n['t']): string {
  if (shift.open === '00:00' && shift.close === '24:00') return t('aroundTheClock')
  return `${shift.open} – ${shift.close}`
}

// --- the clock of the live status (useSyncExternalStore) -------------------------------------------
export function subscribeClock(onTick: () => void): () => void {
  const timer = window.setInterval(onTick, CLOCK_MS)
  return () => window.clearInterval(timer)
}

/** Changes every CLOCK_MS. */
export const clockTick = () => Math.floor(Date.now() / CLOCK_MS)

export const tickTime = (tick: number) => new Date(tick * CLOCK_MS)

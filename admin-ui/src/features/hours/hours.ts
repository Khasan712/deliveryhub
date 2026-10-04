/* Working hours in the editor (docs/api.md → "Working hours"): seven days Monday first, a close not after the open is
   on the next day, "00:00"–"24:00" is the whole day. Times are always shown on the business's clock (`timezone`). */
import type { Shift, Week, WorkingHours } from '../../api/types'
import { MONTHS_SHORT, WEEKDAYS_LONG, WEEKDAYS_ON, type DictKey } from '../../i18n/dict'
import { translate, type Lang } from '../../i18n/translate'

export const DEFAULT_SHIFT: Shift = { open: '09:00', close: '22:00' }
const ALL_DAY: Shift = { open: '00:00', close: '24:00' }
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const DAY = 86_400_000

/** One row of the editor. Its times are kept while the day is off or open 24 hours, so switching back restores them. */
export interface DayDraft {
  working: boolean
  allDay: boolean
  open: string
  close: string
}

export interface DayErrors {
  open?: DictKey
  close?: DictKey
}

export const isAllDay = (shift: Shift) => shift.open === ALL_DAY.open && shift.close === ALL_DAY.close

/** Monday-first day index → «Dushanba» / «Понедельник». */
export const dayName = (index: number, lang: Lang) => WEEKDAYS_LONG[lang][(index + 1) % 7]

/** Monday-first day index → «Dushanba» / «в понедельник» (inside a sentence). */
export const onDayName = (index: number, lang: Lang) => WEEKDAYS_ON[lang][(index + 1) % 7]

export function toDraft(week: Week): DayDraft[] {
  return week.map((shift) => {
    if (!shift) return { working: false, allDay: false, ...DEFAULT_SHIFT }
    if (isAllDay(shift)) return { working: true, allDay: true, ...DEFAULT_SHIFT }
    // A time input cannot show 24:00 — the same midnight is 00:00 of the next day.
    return { working: true, allDay: false, open: shift.open, close: shift.close === '24:00' ? '00:00' : shift.close }
  })
}

export function toWeek(days: DayDraft[]): Week {
  return days.map((day) => (!day.working ? null : day.allDay ? { ...ALL_DAY } : { open: day.open, close: day.close }))
}

/** A new schedule: every day open with the same hours. */
export function everyDay(shift: Shift = DEFAULT_SHIFT): DayDraft[] {
  return Array.from({ length: 7 }, () => ({ working: true, allDay: false, ...shift }))
}

/** The same hours (a close at 24:00 and at 00:00 is the same midnight). */
export function sameWeek(a: Week | null, b: Week | null): boolean {
  const normal = (week: Week | null) => (week ? toWeek(toDraft(week)) : null)
  return JSON.stringify(normal(a)) === JSON.stringify(normal(b))
}

/** The day closes after midnight («18:00 – 02:00»). */
export function isOvernight(day: DayDraft): boolean {
  return day.working && !day.allDay && TIME.test(day.open) && TIME.test(day.close) && day.close < day.open
}

/** «ertasi kuni 02:00 gacha» / «yarim tungacha» for a day that closes after midnight. */
export function overnightNote(day: DayDraft, lang: Lang): string | null {
  if (!isOvernight(day)) return null
  return day.close === '00:00' ? translate(lang, 'hours_until_midnight') : translate(lang, 'hours_next_day', { time: day.close })
}

/** Problems of a working day: an empty time, or the same open and close (the whole day is «24 soat»). */
export function dayErrors(day: DayDraft): DayErrors | null {
  if (!day.working || day.allDay) return null
  const errors: DayErrors = {}
  if (!TIME.test(day.open)) errors.open = 'field_required'
  if (!TIME.test(day.close)) errors.close = 'field_required'
  if (!errors.open && !errors.close && day.open === day.close) errors.close = 'hours_same_time'
  return errors.open || errors.close ? errors : null
}

interface Clock {
  /** Days since 1970-01-01 on that clock (to compare dates). */
  day: number
  /** Monday 0 … Sunday 6. */
  weekday: number
  month: number
  date: number
  /** «09:00». */
  time: string
}

const pad = (value: number) => String(value).padStart(2, '0')

/** A moment (a Date or epoch milliseconds) on the clock of `timeZone` (the device's clock if the zone is unknown). */
export function clockAt(moment: Date | number, timeZone: string): Clock {
  const date = new Date(moment)
  let parts: Record<string, number>
  try {
    const format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    })
    parts = Object.fromEntries(format.formatToParts(date).map((part) => [part.type, Number(part.value)]))
  } catch {
    parts = { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), hour: date.getHours(), minute: date.getMinutes() }
  }
  const midnight = Date.UTC(parts.year, parts.month - 1, parts.day)
  return {
    day: Math.round(midnight / DAY),
    weekday: (new Date(midnight).getUTCDay() + 6) % 7,
    month: parts.month - 1,
    date: parts.day,
    time: `${pad(parts.hour % 24)}:${pad(parts.minute)}`,
  }
}

/**
 * The status card's second line from the server's answer, on the business's clock: «22:00 da yopiladi»,
 * «Ertaga 09:00 da ochiladi», «Dushanba 09:00 da ochiladi». `now` — when the server answered.
 */
export function statusDetail(hours: WorkingHours, lang: Lang, now: Date | number = Date.now()): string {
  if (!hours.week) return translate(lang, 'hours_status_any_time')
  const at = hours.open ? hours.closes_at : hours.opens_at
  if (!at) return translate(lang, hours.open ? 'hours_status_always' : 'hours_status_never')
  const target = clockAt(Date.parse(at), hours.timezone)
  const days = target.day - clockAt(now, hours.timezone).day
  const [today, tomorrow, later] = hours.open
    ? (['hours_closes_today', 'hours_closes_tomorrow', 'hours_closes_day'] as const)
    : (['hours_opens_today', 'hours_opens_tomorrow', 'hours_opens_day'] as const)
  if (days <= 0) return translate(lang, today, { time: target.time })
  if (days === 1) return translate(lang, tomorrow, { time: target.time })
  // A week ahead the weekday alone would be ambiguous — the date is added.
  const weekday = onDayName(target.weekday, lang)
  const day = days < 7 ? weekday : `${weekday}, ${target.date} ${MONTHS_SHORT[lang][target.month]}`
  return translate(lang, later, { day, time: target.time })
}

/** «Toshkent vaqti bilan» / «Часовой пояс: Samarkand». */
export function zoneLabel(timeZone: string, lang: Lang): string {
  if (timeZone === 'Asia/Tashkent') return translate(lang, 'hours_zone_tashkent')
  return translate(lang, 'hours_zone', { zone: (timeZone.split('/').pop() ?? timeZone).replace(/_/g, ' ') })
}

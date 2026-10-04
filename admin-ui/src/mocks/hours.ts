/* Working hours of the mock API — the rules of the backend (apps/platform/hours.py, docs/api.md "Working hours"):
   seven shifts Monday first, `null` a day off, a close not after the open is on the next day, "00:00"–"24:00" is the
   whole day, back-to-back shifts count as one. The mock business is in Tashkent (UTC+5 all year, no daylight saving). */
import type { Shift, Week, WorkingHours } from '../api/types'

export const MOCK_TIMEZONE = 'Asia/Tashkent'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const OFFSET = 5 * 60 * MINUTE
/** How far the status looks: the longest closed stretch has to fit (a week off and a day around it). */
const HORIZON_DAYS = 8
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/

const minutes = (value: string) => {
  const [hours, mins] = value.split(':').map(Number)
  return hours * 60 + mins
}

/** Monday 0 … Sunday 6 of a Tashkent wall-clock time. */
const weekday = (wall: number) => (new Date(wall).getUTCDay() + 6) % 7

/** A Tashkent wall-clock time the way the API writes it: «2026-10-05T22:00:00+05:00». */
const iso = (wall: number) => new Date(wall).toISOString().replace(/\.\d{3}Z$/, '+05:00')

/** The week as the API takes it, checked; `undefined` for anything else (→ `fields.week: ["invalid"]`). */
export function parseWeek(value: unknown): Week | null | undefined {
  if (value === null) return null
  if (!Array.isArray(value) || value.length !== 7) return undefined
  const week: Week = []
  for (const day of value as unknown[]) {
    if (day === null) {
      week.push(null)
      continue
    }
    if (typeof day !== 'object' || Object.keys(day).sort().join() !== 'close,open') return undefined
    const { open, close } = day as Record<string, unknown>
    if (typeof open !== 'string' || !TIME.test(open)) return undefined
    if (typeof close !== 'string' || !(TIME.test(close) || close === '24:00')) return undefined
    if (open === close) return undefined
    week.push({ open, close })
  }
  return week
}

/** Whether the business is open at `date` and when that changes (null: never / on no day). */
export function hoursStatus(week: Week | null, date = new Date()): Pick<WorkingHours, 'open' | 'opens_at' | 'closes_at'> {
  if (!week) return { open: true, opens_at: null, closes_at: null }
  const now = date.getTime() + OFFSET
  const midnight = now - (now % DAY)
  const shifts: Array<[number, number]> = []
  for (let offset = -1; offset < HORIZON_DAYS; offset++) {
    const day = midnight + offset * DAY
    const shift: Shift | null = week[weekday(day)]
    if (!shift) continue
    const start = minutes(shift.open)
    let end = minutes(shift.close)
    if (end <= start) end += 24 * 60
    shifts.push([day + start * MINUTE, day + end * MINUTE])
  }
  const horizon = midnight + (HORIZON_DAYS - 1) * DAY

  const current = shifts.find(([start, end]) => start <= now && now < end)
  if (current) {
    let closes = current[1]
    while (closes < horizon) {
      const follow = shifts.find(([start, end]) => start <= closes && closes < end)
      if (!follow) break
      closes = follow[1]
    }
    return { open: true, opens_at: null, closes_at: closes < horizon ? iso(closes) : null }
  }
  const upcoming = shifts.map(([start]) => start).filter((start) => start > now)
  return { open: false, opens_at: upcoming.length ? iso(Math.min(...upcoming)) : null, closes_at: null }
}

export function workingHours(week: Week | null, date = new Date()): WorkingHours {
  return { week, timezone: MOCK_TIMEZONE, ...hoursStatus(week, date) }
}

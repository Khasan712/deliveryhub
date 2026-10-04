// Working hours of a business as our panel shows them (docs/api.md → "Working hours"): read-only, the status as the
// API worked it out when the page was loaded.
import type { WorkingHours } from '../api/types'

export const DAYS = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba']
const DAYS_LOWER = DAYS.map((day) => day.toLowerCase())

/** "2026-10-05", "22:00" and the weekday (Monday 0) of a moment on the business's clock. */
function clock(iso: string, timeZone: string) {
  const date = new Date(iso)
  const day = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
  const time = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date)
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(
    new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date),
  )
  return { day, time, weekday }
}

/** "Hozir ochiq · 22:00 gacha", "Hozir yopiq · ertaga 09:00 da ochiladi" — when the page was loaded. */
export function hoursStatus(hours: WorkingHours, now = new Date()): string {
  const today = clock(now.toISOString(), hours.timezone).day
  const tomorrow = clock(new Date(now.getTime() + 86_400_000).toISOString(), hours.timezone).day
  const when = (iso: string) => {
    const moment = clock(iso, hours.timezone)
    if (moment.day === today) return `bugun ${moment.time}`
    if (moment.day === tomorrow) return `ertaga ${moment.time}`
    return `${DAYS_LOWER[moment.weekday]} ${moment.time}`
  }
  if (hours.open) return hours.closes_at ? `Hozir ochiq · ${when(hours.closes_at)} gacha` : 'Hozir ochiq · 24 soat'
  return hours.opens_at ? `Hozir yopiq · ${when(hours.opens_at)} da ochiladi` : 'Hozir yopiq'
}

export const shiftText = (shift: { open: string; close: string }) =>
  shift.open === '00:00' && shift.close === '24:00' ? '24 soat' : `${shift.open} – ${shift.close}`

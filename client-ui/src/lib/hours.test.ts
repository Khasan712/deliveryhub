import { describe, expect, it } from 'vitest'
import type { Shift, WorkingHours } from '../api/types'
import { translate } from '../i18n/i18n'
import { closedNotice, openStatus, shiftLabel, statusLabel } from './hours'

const DAILY: Shift[] = Array.from({ length: 7 }, () => ({ open: '09:00', close: '22:00' }))
// Monday to Thursday 09:00–22:00, Friday and Saturday 18:00–02:00 (into the next night), Sunday off.
const WEEK: (Shift | null)[] = [...DAILY.slice(0, 4), { open: '18:00', close: '02:00' }, { open: '18:00', close: '02:00' }, null]

const hours = (week: WorkingHours['week']): WorkingHours => ({
  week,
  timezone: 'Asia/Tashkent',
  open: true,
  opens_at: null,
  closes_at: null,
})
/** A moment of the week of 5 October 2026 (Monday 5 … Sunday 11) on the clock of Tashkent. */
const at = (day: number, time: string) => new Date(`2026-10-${String(day).padStart(2, '0')}T${time}:00+05:00`)
const uz = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('uz', key, vars)
const ru = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('ru', key, vars)
const label = (week: WorkingHours['week'], moment: Date, t = uz) => statusLabel(openStatus(hours(week), moment)!, t)

describe('working hours', () => {
  it('says nothing without hours: orders are taken at any time', () => {
    expect(openStatus(hours(null), at(5, '03:00'))).toBeNull()
  })

  it('tells when a shop that is open closes and when a closed one opens', () => {
    expect(label(DAILY, at(5, '10:00'))).toBe('Ochiq · 22:00 gacha')
    expect(label(DAILY, at(5, '08:30'))).toBe('Yopiq · bugun 09:00 da ochiladi')
    expect(label(DAILY, at(5, '22:00'))).toBe('Yopiq · ertaga 09:00 da ochiladi')
    expect(label(DAILY, at(5, '22:00'), ru)).toBe('Закрыто · откроется завтра в 09:00')
  })

  it('keeps a night shift on the day it started', () => {
    expect(label(WEEK, at(9, '20:00'))).toBe('Ochiq · ertaga 02:00 gacha')
    expect(label(WEEK, at(10, '01:30'))).toBe('Ochiq · 02:00 gacha')
    expect(label(WEEK, at(9, '20:00'), ru)).toBe('Открыто · до 02:00 завтра')
    // Sunday is off: Saturday's night ends at 02:00, then Monday morning.
    expect(label(WEEK, at(11, '12:00'))).toBe('Yopiq · ertaga 09:00 da ochiladi')
  })

  it('names the day of a later opening', () => {
    const mondays = [{ open: '09:00', close: '12:00' }, null, null, null, null, null, null]
    expect(label(mondays, at(5, '13:00'))).toBe('Yopiq · dushanba 09:00 da ochiladi')
    expect(label(mondays, at(7, '13:00'), ru)).toBe('Закрыто · откроется в понедельник в 09:00')
  })

  it('around the clock and never', () => {
    expect(label(Array.from({ length: 7 }, () => ({ open: '00:00', close: '24:00' })), at(7, '04:00'))).toBe('Ochiq · 24 soat')
    const never = Array.from({ length: 7 }, () => null)
    expect(label(never, at(7, '04:00'))).toBe('Hozir yopiq')
    expect(closedNotice(openStatus(hours(never), at(7, '04:00'))!, uz)).toBe('Hozir yopiqmiz. Savatingiz saqlanib turadi.')
  })

  it('reads the business clock, not the device one', () => {
    // 04:30 UTC is 09:30 in Tashkent.
    expect(openStatus(hours(DAILY), new Date('2026-10-05T04:30:00Z'))?.open).toBe(true)
  })

  it('writes shifts the way people read them', () => {
    expect(shiftLabel({ open: '09:00', close: '22:00' }, uz)).toBe('09:00 – 22:00')
    expect(shiftLabel({ open: '00:00', close: '24:00' }, ru)).toBe('Круглосуточно')
  })
})

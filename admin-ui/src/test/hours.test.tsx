import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Week, WorkingHours } from '../api/types'
import {
  dayErrors,
  everyDay,
  isOvernight,
  overnightNote,
  sameWeek,
  statusDetail,
  toDraft,
  toWeek,
} from '../features/hours/hours'
import { store } from '../mocks/data'
import { hoursStatus } from '../mocks/hours'
import { renderApp } from './render'
import { recordRequests, server } from './server'

const DAY = { open: '09:00', close: '22:00' }
const LATE = { open: '09:00', close: '02:00' }
/** Monday, 5 October 2026, noon in Tashkent. */
const MONDAY_NOON = '2026-10-05T12:00:00+05:00'

describe('working hours helpers', () => {
  it('turns the API week into editor rows and back', () => {
    const week: Week = [DAY, null, { open: '00:00', close: '24:00' }, { open: '18:00', close: '24:00' }, LATE, LATE, DAY]
    const rows = toDraft(week)
    expect(rows[1]).toEqual({ working: false, allDay: false, open: '09:00', close: '22:00' })
    expect(rows[2]).toMatchObject({ working: true, allDay: true })
    // A time input cannot show 24:00: midnight is written as 00:00 (the same moment for the backend).
    expect(rows[3]).toEqual({ working: true, allDay: false, open: '18:00', close: '00:00' })
    expect(toWeek(rows)).toEqual([DAY, null, { open: '00:00', close: '24:00' }, { open: '18:00', close: '00:00' }, LATE, LATE, DAY])
    expect(sameWeek(week, toWeek(rows))).toBe(true)
    expect(sameWeek(week, null)).toBe(false)
    expect(toWeek(everyDay())).toEqual(Array(7).fill(DAY))
  })

  it('spots a day that closes after midnight and checks the times', () => {
    const day = { working: true, allDay: false, open: '18:00', close: '02:00' }
    expect(isOvernight(day)).toBe(true)
    expect(overnightNote(day, 'uz')).toBe('ertasi kuni 02:00 gacha')
    expect(overnightNote(day, 'ru')).toBe('до 02:00 следующего дня')
    expect(overnightNote({ ...day, close: '00:00' }, 'uz')).toBe('yarim tungacha')
    expect(overnightNote({ ...day, close: '23:00' }, 'uz')).toBeNull()
    expect(overnightNote({ ...day, allDay: true }, 'uz')).toBeNull()

    expect(dayErrors(day)).toBeNull()
    expect(dayErrors({ ...day, close: '18:00' })).toEqual({ close: 'hours_same_time' })
    expect(dayErrors({ ...day, open: '' })).toEqual({ open: 'field_required' })
    expect(dayErrors({ ...day, working: false, close: '' })).toBeNull()
    expect(dayErrors({ ...day, allDay: true, close: '18:00' })).toBeNull()
  })

  it('describes the status on the business clock: bugun / ertaga / a weekday', () => {
    const now = Date.parse(MONDAY_NOON)
    const hours = (patch: Partial<WorkingHours>): WorkingHours => ({
      week: [DAY, DAY, DAY, DAY, DAY, DAY, DAY],
      timezone: 'Asia/Tashkent',
      open: false,
      opens_at: null,
      closes_at: null,
      ...patch,
    })
    const open = (closes_at: string) => hours({ open: true, closes_at })
    const closed = (opens_at: string) => hours({ opens_at })

    expect(statusDetail(open('2026-10-05T22:00:00+05:00'), 'uz', now)).toBe('22:00 da yopiladi')
    expect(statusDetail(open('2026-10-05T22:00:00+05:00'), 'ru', now)).toBe('Закроется в 22:00')
    expect(statusDetail(open('2026-10-06T02:00:00+05:00'), 'uz', now)).toBe('Ertaga 02:00 da yopiladi')
    expect(statusDetail(closed('2026-10-05T18:00:00+05:00'), 'uz', now)).toBe('Bugun 18:00 da ochiladi')
    expect(statusDetail(closed('2026-10-06T09:00:00+05:00'), 'ru', now)).toBe('Откроется завтра в 09:00')
    expect(statusDetail(closed('2026-10-08T09:00:00+05:00'), 'uz', now)).toBe('Payshanba 09:00 da ochiladi')
    expect(statusDetail(closed('2026-10-08T09:00:00+05:00'), 'ru', now)).toBe('Откроется в четверг в 09:00')
    // A week ahead the weekday alone is ambiguous.
    expect(statusDetail(closed('2026-10-12T09:00:00+05:00'), 'uz', now)).toBe('Dushanba, 12 okt 09:00 da ochiladi')
    // 01:00 in Tashkent is still the previous evening in UTC — the business's own date decides "bugun".
    expect(statusDetail(closed('2026-10-06T09:00:00+05:00'), 'uz', Date.parse('2026-10-06T01:00:00+05:00'))).toBe(
      'Bugun 09:00 da ochiladi',
    )

    expect(statusDetail(hours({ week: null, open: true }), 'uz', now)).toBe(
      'Ish vaqti belgilanmagan — buyurtmalar istalgan vaqtda qabul qilinadi',
    )
    expect(statusDetail(hours({ open: true }), 'uz', now)).toBe('Kecha-kunduz ishlaydi')
    expect(statusDetail(hours({}), 'ru', now)).toBe('Все дни выходные — заказы не принимаются')
  })

  it('works the status out like the backend in the mock API', () => {
    const week: Week = [DAY, DAY, DAY, DAY, LATE, LATE, null]
    // Saturday 01:00 — still Friday's night shift.
    expect(hoursStatus(week, new Date('2026-10-10T01:00:00+05:00'))).toEqual({
      open: true,
      opens_at: null,
      closes_at: '2026-10-10T02:00:00+05:00',
    })
    // Sunday is off: from Sunday 03:00 the next opening is Monday 09:00.
    expect(hoursStatus(week, new Date('2026-10-11T03:00:00+05:00'))).toMatchObject({
      open: false,
      opens_at: '2026-10-12T09:00:00+05:00',
    })
    // Back-to-back shifts count as one.
    const night: Week = [{ open: '18:00', close: '24:00' }, { open: '00:00', close: '02:00' }, null, null, null, null, null]
    expect(hoursStatus(night, new Date('2026-10-05T20:00:00+05:00')).closes_at).toBe('2026-10-06T02:00:00+05:00')
    expect(hoursStatus(null)).toEqual({ open: true, opens_at: null, closes_at: null })
  })
})

/** The row of a weekday in the editor (admin) — found by its open / day-off switch. */
function dayRow(day: string) {
  return screen.getByRole('switch', { name: `${day} — ish kuni` }).closest('li')!
}

describe('working hours page', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(MONDAY_NOON))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows whether the shop is open now and the week, with today highlighted', async () => {
    renderApp('/hours')

    expect(await screen.findByRole('heading', { name: 'Hozir ochiq' })).toBeInTheDocument()
    expect(screen.getByText('22:00 da yopiladi')).toBeInTheDocument()
    expect(screen.getByText('Toshkent vaqti bilan')).toBeInTheDocument()

    expect(within(dayRow('Dushanba')).getByText('Bugun')).toBeInTheDocument()
    expect(within(dayRow('Seshanba')).queryByText('Bugun')).not.toBeInTheDocument()
    expect(within(dayRow('Dushanba')).getByLabelText('Dushanba: ochilish vaqti')).toHaveValue('09:00')
    // Friday and Saturday close at 02:00 at night.
    expect(within(dayRow('Juma')).getByText('ertasi kuni 02:00 gacha')).toBeInTheDocument()
    expect(within(dayRow('Shanba')).getByText('ertasi kuni 02:00 gacha')).toBeInTheDocument()
    expect(within(dayRow('Payshanba')).queryByText(/ertasi kuni/)).not.toBeInTheDocument()

    expect(screen.getByRole('button', { name: "O'zgarishlarni saqlash" })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Bekor qilish' })).toBeDisabled()
  })

  it('switches a day off, hints at an overnight close and saves the whole week', async () => {
    const patches = recordRequests('patch', '/api/v1/business')
    const { user } = renderApp('/hours')
    await screen.findByRole('heading', { name: 'Hozir ochiq' })

    const sunday = screen.getByRole('switch', { name: 'Yakshanba — ish kuni' })
    await user.click(sunday)
    expect(sunday).toHaveAttribute('aria-checked', 'false')
    expect(within(dayRow('Yakshanba')).getByText('Dam olish')).toBeInTheDocument()
    expect(within(dayRow('Yakshanba')).queryByLabelText('Yakshanba: yopilish vaqti')).not.toBeInTheDocument()

    const thursdayClose = screen.getByLabelText('Payshanba: yopilish vaqti')
    await user.clear(thursdayClose)
    await user.type(thursdayClose, '02:00')
    expect(thursdayClose).toHaveValue('02:00')
    expect(within(dayRow('Payshanba')).getByText('ertasi kuni 02:00 gacha')).toBeInTheDocument()
    expect(screen.getByText("Saqlanmagan o'zgarishlar bor")).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: "O'zgarishlarni saqlash" }))

    expect(await screen.findByText('Ish vaqti saqlandi')).toBeInTheDocument()
    expect(patches[0].body).toEqual({ week: [DAY, DAY, DAY, LATE, LATE, LATE, null] })
    expect(store.db.hours).toEqual([DAY, DAY, DAY, LATE, LATE, LATE, null])
    await waitFor(() => expect(screen.getByRole('button', { name: "O'zgarishlarni saqlash" })).toBeDisabled())
  })

  it("applies one day's hours to every day", async () => {
    const patches = recordRequests('patch', '/api/v1/business')
    store.db.hours = [DAY, DAY, DAY, DAY, LATE, LATE, null]
    const { user } = renderApp('/hours')
    await screen.findByRole('heading', { name: 'Hozir ochiq' })

    await user.click(screen.getByRole('button', { name: "Juma: hamma kunlarga qo'llash" }))

    expect(await screen.findByText("Juma vaqti hamma kunlarga qo'llandi")).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Yakshanba — ish kuni' })).toHaveAttribute('aria-checked', 'true')
    for (const day of ['Dushanba', 'Chorshanba', 'Yakshanba']) {
      expect(screen.getByLabelText(`${day}: yopilish vaqti`)).toHaveValue('02:00')
    }
    await user.click(screen.getByRole('button', { name: "O'zgarishlarni saqlash" }))
    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0].body).toEqual({ week: Array(7).fill(LATE) })
  })

  it('cancels unsaved changes', async () => {
    const { user } = renderApp('/hours')
    await screen.findByRole('heading', { name: 'Hozir ochiq' })

    await user.click(screen.getByRole('button', { name: 'Seshanba: 24 soat' }))
    expect(within(dayRow('Seshanba')).getByText('Kecha-kunduz')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: "O'zgarishlarni saqlash" })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Bekor qilish' }))
    expect(screen.getByLabelText('Seshanba: ochilish vaqti')).toHaveValue('09:00')
    expect(screen.getByRole('button', { name: "O'zgarishlarni saqlash" })).toBeDisabled()
  })

  it('checks the times before saving and shows a rejected week', async () => {
    // The server rejects the week (the recorder, added later, sees the request first and lets it through).
    server.use(
      http.patch('/api/v1/business', () =>
        HttpResponse.json({ error: 'validation', fields: { week: ['invalid'] } }, { status: 400 }),
      ),
    )
    const patches = recordRequests('patch', '/api/v1/business')
    const { user } = renderApp('/hours')
    await screen.findByRole('heading', { name: 'Hozir ochiq' })

    const mondayClose = screen.getByLabelText('Dushanba: yopilish vaqti')
    await user.clear(mondayClose)
    await user.type(mondayClose, '09:00')
    await user.click(screen.getByRole('button', { name: "O'zgarishlarni saqlash" }))

    expect(within(dayRow('Dushanba')).getByText('Vaqtlar bir xil — kecha-kunduz ishlasa, «24 soat»ni tanlang')).toBeInTheDocument()
    expect(mondayClose).toHaveAttribute('aria-invalid', 'true')
    expect(mondayClose).toHaveFocus()
    expect(patches).toHaveLength(0)

    // Around the clock is the "24 soat" option; it clears the problem.
    await user.click(screen.getByRole('button', { name: 'Dushanba: 24 soat' }))
    expect(within(dayRow('Dushanba')).queryByText(/Vaqtlar bir xil/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: "O'zgarishlarni saqlash" }))
    expect(await screen.findByText("Ish vaqtini saqlab bo'lmadi — vaqtlarni tekshiring")).toBeInTheDocument()
    expect(patches).toHaveLength(1)
    expect(patches[0].body).toMatchObject({ week: [{ open: '00:00', close: '24:00' }, DAY, DAY, DAY, LATE, LATE, { open: '10:00', close: '22:00' }] })
  })

  it('is read-only for managers', async () => {
    const patches = recordRequests('patch', '/api/v1/business')
    renderApp('/hours', { as: 'manager' })

    const nav = await screen.findByRole('navigation', { name: 'Admin panel' })
    expect(within(nav).getByRole('link', { name: 'Ish vaqti' })).toHaveAttribute('href', '/hours')
    expect(await screen.findByText("Ish vaqtini faqat admin o'zgartira oladi")).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Hozir ochiq' })).toBeInTheDocument()

    const week = screen.getByRole('region', { name: 'Haftalik jadval' })
    expect(within(week).getAllByText('09:00 – 22:00')).toHaveLength(4)
    expect(within(week).getAllByText('ertasi kuni 02:00 gacha')).toHaveLength(2)
    expect(within(week).getByText('Bugun')).toBeInTheDocument()
    expect(screen.queryAllByRole('switch')).toHaveLength(0)
    expect(screen.queryByLabelText('Dushanba: ochilish vaqti')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: "O'zgarishlarni saqlash" })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ish vaqtini olib tashlash' })).not.toBeInTheDocument()
    expect(patches).toHaveLength(0)
  })

  it('offers to set hours when there are none, and can go back to none', async () => {
    store.db.hours = null
    const patches = recordRequests('patch', '/api/v1/business')
    const { user } = renderApp('/hours')

    expect(await screen.findByText('Ish vaqti belgilanmagan — buyurtmalar istalgan vaqtda qabul qilinadi')).toBeInTheDocument()
    expect(screen.getByText('Ish vaqti belgilanmagan')).toBeInTheDocument()
    expect(screen.getByText(/Hozir do'kon istalgan vaqtda buyurtma qabul qiladi/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ish vaqtini belgilash' }))
    expect(screen.getAllByRole('switch')).toHaveLength(7)
    expect(screen.getByLabelText('Yakshanba: ochilish vaqti')).toHaveValue('09:00')
    expect(screen.getByLabelText('Yakshanba: yopilish vaqti')).toHaveValue('22:00')
    await user.click(screen.getByRole('button', { name: "O'zgarishlarni saqlash" }))

    expect(await screen.findByText('Ish vaqti saqlandi')).toBeInTheDocument()
    expect(patches[0].body).toEqual({ week: Array(7).fill(DAY) })
    expect(await screen.findByText('22:00 da yopiladi')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ish vaqtini olib tashlash' }))
    const dialog = await screen.findByRole('dialog', { name: 'Ish vaqti olib tashlansinmi?' })
    await user.click(within(dialog).getByRole('button', { name: 'Ha, olib tashlash' }))

    expect(await screen.findByText('Ish vaqti olib tashlandi — buyurtmalar istalgan vaqtda qabul qilinadi')).toBeInTheDocument()
    expect(patches[1].body).toEqual({ week: null })
    expect(store.db.hours).toBeNull()
    expect(await screen.findByRole('button', { name: 'Ish vaqtini belgilash' })).toBeInTheDocument()
  })

  it('shows the empty state without the button to managers', async () => {
    store.db.hours = null
    renderApp('/hours', { as: 'manager' })
    expect(await screen.findByText('Ish vaqti belgilanmagan')).toBeInTheDocument()
    expect(screen.getByText("Ish vaqtini faqat admin o'zgartira oladi")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ish vaqtini belgilash' })).not.toBeInTheDocument()
  })

  it('speaks Russian too', async () => {
    renderApp('/hours', { lang: 'ru' })
    expect(await screen.findByRole('heading', { name: 'Сейчас открыто' })).toBeInTheDocument()
    expect(screen.getByText('Закроется в 22:00')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Понедельник — рабочий день' })).toBeInTheDocument()
    expect(screen.getAllByText('до 02:00 следующего дня')).toHaveLength(2)
  })
})

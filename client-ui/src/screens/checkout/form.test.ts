import { describe, expect, it } from 'vitest'
import { distanceKm, formatKm } from '../../lib/geo'
import { writeStorage } from '../../lib/storage'
import { branches, MAP_MOVE } from '../../test/fixtures'
import { branchChoices, EMPTY_FORM, initialForm, orderBody, pickupBranch, validate, type CheckoutForm } from './form'

const pickup: CheckoutForm = { ...EMPTY_FORM, name: 'Aziz', phone: '901234567', delivery_type: 'pickup' }
const [yunusobod, , chilonzor] = branches

describe('branches at checkout', () => {
  it('measures straight-line distances like the backend (haversine, 6371 km)', () => {
    expect(distanceKm(MAP_MOVE, { lat: 41.275, lng: 69.204 })).toBeCloseTo(1.179, 3)
    expect(distanceKm(MAP_MOVE, { lat: 41.3409, lng: 69.2862 })).toBeCloseTo(9.248, 3)
    expect(distanceKm(MAP_MOVE, MAP_MOVE)).toBe(0)
    expect(formatKm(1.179)).toBe('1,2')
    expect(formatKm(9.25)).toBe('9,3')
    expect(formatKm(12)).toBe('12,0')
    // Next door is still a distance.
    expect(formatKm(0.02)).toBe('0,1')
  })

  it('puts the nearest branch first and the ones without a point last', () => {
    const rows = (from: typeof MAP_MOVE | null) =>
      branchChoices(branches, from).map(({ branch, km, nearest }) => [branch.name, km === null ? null : formatKm(km), nearest])
    expect(rows(MAP_MOVE)).toEqual([
      ['Chilonzor', '1,2', true],
      ['Yunusobod', '9,2', false],
      ['Sergeli', null, false],
    ])
    // Without the customer's point: the server's order, no distances, no "nearest".
    expect(rows(null)).toEqual([
      ['Yunusobod', null, false],
      ['Sergeli', null, false],
      ['Chilonzor', null, false],
    ])
    // A single branch is not the nearest of anything.
    expect(branchChoices([yunusobod!], MAP_MOVE)[0]).toMatchObject({ nearest: false })
  })

  it('needs a branch for a pickup from 2+ and names it only for pickup', () => {
    expect(validate(pickup, branches)).toEqual({ branch_id: 'branchRequired' })
    // A choice remembered from before that is no longer among the branches does not count.
    expect(validate({ ...pickup, branch_id: 99 }, branches)).toEqual({ branch_id: 'branchRequired' })
    expect(validate({ ...pickup, branch_id: 3 }, branches)).toEqual({})
    expect(validate(pickup, [chilonzor!])).toEqual({})
    expect(validate(pickup, [])).toEqual({})
    expect(validate({ ...pickup, delivery_type: 'delivery', address: 'Chilonzor 9' }, branches)).toEqual({})

    expect(pickupBranch({ ...pickup, branch_id: 3 }, branches)).toBe(chilonzor)
    expect(pickupBranch(pickup, [chilonzor!])).toBe(chilonzor)
    expect(orderBody({ ...pickup, branch_id: 1 }, [], 'uz', 'web', branches).branch_id).toBe(1)
    // The only branch is named too; without branches, nothing.
    expect(orderBody(pickup, [], 'uz', 'web', [chilonzor!]).branch_id).toBe(3)
    expect(orderBody(pickup, [], 'uz', 'web', [])).not.toHaveProperty('branch_id')
    // Delivery never names one: the business sends it to a branch.
    const delivery: CheckoutForm = { ...pickup, delivery_type: 'delivery', address: 'Chilonzor 9', branch_id: 1 }
    expect(orderBody(delivery, [], 'uz', 'web', branches)).not.toHaveProperty('branch_id')
  })

  it('brings the chosen branch back with the saved contact details and drops junk', () => {
    writeStorage('contact', { name: 'Aziz', delivery_type: 'pickup', branch_id: 3 })
    expect(initialForm()).toMatchObject({ name: 'Aziz', delivery_type: 'pickup', branch_id: 3 })
    writeStorage('contact', { name: 'Aziz', branch_id: '3' })
    expect(initialForm().branch_id).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import type { BusinessCard } from '../api/types'
import { brandColor, prefersLightText } from './color'
import { platformDomain } from './domain'
import { errorMessage, fieldErrors } from './errors'
import { formatDateTime, formatPrice, hostOf, initialOf } from './format'
import { parsePoint } from './map'
import { loginPath, safeNext } from './paths'
import { formatPhone, normalizePhone } from './phone'
import { svgDataUrl } from './svg'

describe('format', () => {
  it('formats money in so‘m with grouped thousands', () => {
    expect(formatPrice(505000)).toBe('505 000 so\'m')
    expect(formatPrice(0)).toBe('0 so\'m')
  })
  it('shows a link as a bare host', () => {
    expect(hostOf('https://burger-house.portex.uz/')).toBe('burger-house.portex.uz')
  })
  it('writes dates in Uzbek', () => {
    const now = new Date(2026, 9, 2)
    expect(formatDateTime(new Date(2026, 9, 9, 19, 40).toISOString(), now)).toBe('9-oktabr, 19:40')
    expect(formatDateTime(new Date(2027, 0, 1, 8, 5).toISOString(), now)).toBe('1-yanvar 2027, 08:05')
  })
  it('takes the first letter for avatars', () => {
    expect(initialOf(' burger')).toBe('B')
    expect(initialOf('ёқимли')).toBe('Ё')
  })
})

describe('phone', () => {
  it('normalizes loosely typed numbers like the backend', () => {
    expect(normalizePhone('90 123 45 67')).toBe('+998901234567')
    expect(normalizePhone('+998 (90) 123-45-67')).toBe('+998901234567')
    expect(normalizePhone('12345')).toBeNull()
    expect(formatPhone('+998901234567')).toBe('+998 90 123 45 67')
    expect(formatPhone('hello')).toBe('hello')
  })
})

describe('color', () => {
  it('falls back to indigo and picks readable text', () => {
    expect(brandColor('')).toBe('#6366f1')
    expect(brandColor('#FF6B00')).toBe('#ff6b00')
    expect(prefersLightText('#6366f1')).toBe(true)
    expect(prefersLightText('#ff6b00')).toBe(true)
    expect(prefersLightText('#fde047')).toBe(false)
  })
})

describe('paths', () => {
  it('keeps the return path and only allows our own paths after login', () => {
    expect(loginPath('/b/burger-house')).toBe('/login?next=%2Fb%2Fburger-house')
    expect(loginPath('/')).toBe('/login')
    expect(safeNext('/b/x?tab=1')).toBe('/b/x?tab=1')
    expect(safeNext('//evil.example')).toBe('/')
    expect(safeNext('https://evil.example')).toBe('/')
    expect(safeNext('/login?next=/')).toBe('/')
    expect(safeNext(null)).toBe('/')
  })
})

describe('errors', () => {
  it('maps API codes to Uzbek messages', () => {
    expect(errorMessage(new ApiError(400, 'invalid_token'))).toBe("Token noto'g'ri yoki Telegram javob bermadi")
    expect(errorMessage(new ApiError(0, 'network'))).toMatch(/aloqa yo'q/)
    expect(errorMessage(new ApiError(429, 'too_many_requests', { retry_after: 30 }))).toMatch(/30 soniyadan/)
    expect(errorMessage(new ApiError(418, 'teapot'))).toMatch(/Kutilmagan xatolik \(418\)/)
  })
  it('maps validation fields', () => {
    const error = new ApiError(400, 'validation', { fields: { slug: ['slug_taken'], owner_phone: ['invalid'], name: ['required'] } })
    expect(fieldErrors(error)).toEqual({
      slug: 'Bu manzil boshqa biznesda ishlatilgan.',
      owner_phone: "Telefon raqami noto'g'ri",
      name: "To'ldirilishi shart",
    })
  })
})

describe('svgDataUrl', () => {
  it('turns inline SVG (no xmlns) into an image URL', () => {
    const url = svgDataUrl('<svg viewBox="0 0 29 29"><path d="M0 0h1"/></svg>')
    expect(url).toMatch(/^data:image\/svg\+xml;charset=utf-8,/)
    expect(decodeURIComponent(url ?? '')).toContain('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29">')
  })
  it('keeps an existing xmlns and rejects non-SVG', () => {
    const url = svgDataUrl('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>')
    expect(decodeURIComponent(url ?? '')).toContain('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    expect(svgDataUrl('<img src=x onerror=alert(1)>')).toBeNull()
  })
})

describe('platformDomain', () => {
  const card = { slug: 'burger', links: { shop: 'https://burger.example.uz/' } } as BusinessCard

  it('prefers the domain the API reports', () => {
    expect(platformDomain([card], 'portex.uz')).toBe('portex.uz')
  })
  it('falls back to the shop link of an existing business', () => {
    expect(platformDomain([card])).toBe('example.uz')
  })
})

describe('map', () => {
  it('reads a point typed or pasted into the search', () => {
    expect(parsePoint('41.311081, 69.279737')).toEqual({ lat: 41.311081, lng: 69.279737 })
    expect(parsePoint(' 41.3111 69.2797 ')).toEqual({ lat: 41.3111, lng: 69.2797 })
    expect(parsePoint('https://www.google.com/maps/@41.2995,69.2401,17z')).toEqual({ lat: 41.2995, lng: 69.2401 })
    expect(parsePoint('https://maps.google.com/?q=41.2995,69.2401')).toEqual({ lat: 41.2995, lng: 69.2401 })
    // Yandex writes the longitude first.
    expect(parsePoint('https://yandex.uz/maps/?ll=69.240562%2C41.299496&z=16')).toEqual({ lat: 41.299496, lng: 69.240562 })
    expect(parsePoint('https://yandex.uz/maps/?pt=69.24,41.29&z=17')).toEqual({ lat: 41.29, lng: 69.24 })
  })
  it('leaves addresses and impossible points to the geocoder', () => {
    expect(parsePoint('Chilonzor 9')).toBeNull()
    expect(parsePoint('Amir Temur 15, 2')).toBeNull()
    expect(parsePoint('91.5, 69.2')).toBeNull()
  })
})

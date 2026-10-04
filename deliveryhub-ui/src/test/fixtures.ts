import type { BusinessDetail, PlatformUser } from '../api/types'

export const DOMAIN = 'portex.uz'

/** Where a click on the test map lands (Chilonzor): src/test/fakeMap.tsx. */
export const MAP_CLICK = { lat: 41.2856, lng: 69.2035 }

export const STAFF: PlatformUser = { id: 1, phone_number: '+998901234567', first_name: 'Xasan' }
export const STAFF_PASSWORD = 'platform-secret'

export function makeBusiness(overrides: Partial<BusinessDetail> = {}): BusinessDetail {
  const slug = overrides.slug ?? 'burger-house'
  return {
    slug,
    name: 'Burger House',
    status: 'active',
    logo: null,
    brand_color: '#ff6b00',
    tagline: 'Eng mazali burgerlar',
    created_at: '2026-09-28T10:00:00+05:00',
    links: { shop: `https://${slug}.${DOMAIN}/`, admin: `https://${slug}-admin.${DOMAIN}/` },
    stats: { orders_today: 2, revenue_today: 505000, orders_total: 11, customers: 7 },
    bots: { client: { username: 'burger_house_bot', alive: true, created_via: 'managed' }, admin: null },
    support_phone: '+998712001122',
    address: "Amir Temur ko'chasi, 15",
    lat: 41.311081,
    lng: 69.279737,
    delivery_time: '30–45',
    min_order: 0,
    owner: { name: 'Aziz', phone: '+998901112233' },
    platform_bot: { username: 'deliveryhub_bot' },
    missing_roles: ['admin'],
    ...overrides,
  }
}

/** Three businesses of every kind: with/without logo, alive/stopped bots, active/suspended. */
export function sampleBusinesses(): BusinessDetail[] {
  return [
    makeBusiness(),
    makeBusiness({
      slug: 'pizza-palace',
      name: 'Pizza Palace',
      logo: '/media/pizza_palace/logos/pizza.png',
      brand_color: '#16a34a',
      tagline: '',
      stats: { orders_today: 5, revenue_today: 1_200_000, orders_total: 140, customers: 52 },
      bots: {
        client: { username: 'pizza_palace_bot', alive: true, created_via: 'token' },
        admin: { username: 'pizza_staff_bot', alive: false, created_via: 'managed' },
      },
      missing_roles: [],
    }),
    makeBusiness({
      slug: 'sushi-bar',
      name: 'Sushi Bar',
      status: 'suspended',
      // Opened before businesses were put on the map.
      address: '',
      lat: null,
      lng: null,
      brand_color: '',
      stats: { orders_today: 0, revenue_today: 0, orders_total: 3, customers: 2 },
      bots: { client: null, admin: null },
      missing_roles: ['client', 'admin'],
    }),
  ]
}

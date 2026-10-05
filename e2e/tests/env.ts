import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Settings of the throwaway stack `make e2e` starts (e2e/.stack.env), when it is there. */
function stackEnv(): Record<string, string> {
  const file = fileURLToPath(new URL('../.stack.env', import.meta.url))
  if (!existsSync(file)) return {}
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => line.includes('=') && !line.startsWith('#'))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  )
}

const stack = stackEnv()
const port = process.env.E2E_PORT ?? stack.WEB_PORT ?? '8200'

/** Addresses of the parts, as the web container serves them locally (`*.localhost` → 127.0.0.1). */
export const urls = {
  platform: `http://hub.localhost:${port}`,
  /** Our page for businesses: the bare domain in production, localhost here. */
  landing: `http://localhost:${port}`,
  admin: (slug: string) => `http://${slug}-admin.localhost:${port}`,
  shop: (slug: string) => `http://${slug}.localhost:${port}`,
}

interface Account {
  phone: string
  password: string
}

/** Our panel's account: E2E_PLATFORM_PHONE / E2E_PLATFORM_PASSWORD, else the one of the throwaway stack. */
export function platformAccount(): Account {
  const phone = process.env.E2E_PLATFORM_PHONE ?? stack.PLATFORM_ADMIN_PHONE
  const password = process.env.E2E_PLATFORM_PASSWORD ?? stack.PLATFORM_ADMIN_PASSWORD
  if (!phone || !password) throw new Error('Run the tests with `make e2e` (or set E2E_PLATFORM_PHONE / E2E_PLATFORM_PASSWORD)')
  return { phone, password }
}

/** A business of this run (`e2e-<stamp>`). */
export function newBusiness() {
  const stamp = Date.now().toString(36)
  const digits = String(Date.now()).slice(-7)
  return {
    name: `E2E Burger ${stamp}`,
    slug: `e2e-${stamp}`,
    owner: { name: 'E2E Egasi', phone: `+99890${digits}`, password: `e2e-pass-${stamp}` },
    place: { point: '41.311081, 69.279737', address: "Amir Temur ko'chasi, 15, Toshkent" },
  }
}

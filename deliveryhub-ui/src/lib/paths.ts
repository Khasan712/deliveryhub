// Panel addresses (the same as the old Django panel: /, /new, /b/<slug>, /login).

export const businessPath = (slug: string) => `/b/${encodeURIComponent(slug)}`

/** A page of a business's admin panel: ('https://x-admin.portex.uz/', '/branches') → 'https://x-admin.portex.uz/branches'. */
export function adminPageUrl(adminUrl: string, path: string): string {
  try {
    return new URL(path, adminUrl).href
  } catch {
    return `${adminUrl.replace(/\/+$/, '')}${path}`
  }
}

/** The login page address that brings the user back to `pathname` afterwards. */
export function loginPath(pathname: string, search = ''): string {
  const back = pathname + search
  return back === '/' ? '/login' : `/login?next=${encodeURIComponent(back)}`
}

/** Where to go after signing in: only our own paths (never `//other.host` or the login page itself). */
export function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/'
  if (next === '/login' || next.startsWith('/login?') || next.startsWith('/login/')) return '/'
  return next
}

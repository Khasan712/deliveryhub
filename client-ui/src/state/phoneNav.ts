import { useLocation } from 'react-router'
import { TABLET_QUERY, useMediaQuery } from '../lib/useMediaQuery'

/**
 * A phone has its main menu at the bottom, where the thumb is (components/TabBar.tsx) — on the website, in our app
 * and in the Telegram Mini App alike. Telegram's MainButton then stays off the screens with that bar (no two bars at
 * the bottom): the menu's next step is the page's own bar, as on the website.
 */
export function usePhoneNav(): boolean {
  return !useMediaQuery(TABLET_QUERY)
}

/** Screens with a bar of their own at the bottom (the checkout's «Buyurtma berish»). */
const OWN_BAR = new Set(['/checkout'])

/** The phone's menu bar is on screen (the page leaves room for it). */
export function useTabBar(): boolean {
  const phone = usePhoneNav()
  const { pathname } = useLocation()
  return phone && !OWN_BAR.has(pathname)
}

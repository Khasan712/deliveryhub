import { useLocation } from 'react-router'
import { isTelegram } from '../lib/telegram'
import { TABLET_QUERY, useMediaQuery } from '../lib/useMediaQuery'

/**
 * A phone has its main menu at the bottom, where the thumb is (components/TabBar.tsx) — not inside Telegram, whose
 * own bar at the bottom holds the cart's MainButton (the header keeps its icons there).
 */
export function usePhoneNav(): boolean {
  const wide = useMediaQuery(TABLET_QUERY)
  return !wide && !isTelegram()
}

/** Screens with a bar of their own at the bottom (the checkout's «Buyurtma berish»). */
const OWN_BAR = new Set(['/checkout'])

/** The phone's menu bar is on screen (the page leaves room for it). */
export function useTabBar(): boolean {
  const phone = usePhoneNav()
  const { pathname } = useLocation()
  return phone && !OWN_BAR.has(pathname)
}

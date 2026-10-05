/**
 * Telegram Mini App integration (https://core.telegram.org/bots/webapps).
 * The SDK (telegram-web-app.js) is loaded by index.html only inside Telegram; everything here is a no-op
 * on the website. The SDK itself exposes the theme as `--tg-theme-*` CSS variables, which index.css maps
 * onto the design tokens.
 */

export interface TelegramThemeParams {
  bg_color?: string
  text_color?: string
  hint_color?: string
  link_color?: string
  button_color?: string
  button_text_color?: string
  secondary_bg_color?: string
  header_bg_color?: string
  bottom_bar_bg_color?: string
  accent_text_color?: string
  section_bg_color?: string
  section_header_text_color?: string
  section_separator_color?: string
  subtitle_text_color?: string
  destructive_text_color?: string
}

export interface TelegramBottomButtonParams {
  text?: string
  color?: string
  text_color?: string
  has_shine_effect?: boolean
  is_active?: boolean
  is_visible?: boolean
}

export interface TelegramBottomButton {
  isVisible: boolean
  isActive: boolean
  isProgressVisible: boolean
  setParams(params: TelegramBottomButtonParams): TelegramBottomButton
  onClick(callback: () => void): TelegramBottomButton
  offClick(callback: () => void): TelegramBottomButton
  show(): TelegramBottomButton
  hide(): TelegramBottomButton
  showProgress(leaveActive?: boolean): TelegramBottomButton
  hideProgress(): TelegramBottomButton
}

export interface TelegramBackButton {
  isVisible: boolean
  onClick(callback: () => void): TelegramBackButton
  offClick(callback: () => void): TelegramBackButton
  show(): TelegramBackButton
  hide(): TelegramBackButton
}

export interface TelegramHapticFeedback {
  impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void
  notificationOccurred(type: 'error' | 'success' | 'warning'): void
  selectionChanged(): void
}

export interface TelegramLocationData {
  latitude: number
  longitude: number
}

export interface TelegramLocationManager {
  isInited: boolean
  isLocationAvailable: boolean
  isAccessRequested: boolean
  isAccessGranted: boolean
  init(callback?: () => void): void
  getLocation(callback: (data: TelegramLocationData | null) => void): void
  openSettings(): void
}

export interface TelegramContactResult {
  status?: 'sent' | 'cancelled'
  responseUnsafe?: { contact?: { phone_number?: string; first_name?: string; last_name?: string } }
}

export interface TelegramWebAppUser {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  language_code?: string
}

export interface TelegramWebApp {
  initData: string
  initDataUnsafe: { user?: TelegramWebAppUser; start_param?: string }
  version: string
  platform: string
  colorScheme: 'light' | 'dark'
  themeParams: TelegramThemeParams
  MainButton: TelegramBottomButton
  BackButton: TelegramBackButton
  HapticFeedback?: TelegramHapticFeedback
  LocationManager?: TelegramLocationManager
  ready(): void
  expand(): void
  isVersionAtLeast(version: string): boolean
  setHeaderColor(color: string): void
  setBackgroundColor(color: string): void
  setBottomBarColor?(color: string): void
  disableVerticalSwipes?(): void
  onEvent(event: string, handler: (...args: unknown[]) => void): void
  offEvent(event: string, handler: (...args: unknown[]) => void): void
  openLink(url: string): void
  openTelegramLink(url: string): void
  enableClosingConfirmation?(): void
  disableClosingConfirmation?(): void
  requestContact?(callback?: (shared: boolean, result?: TelegramContactResult) => void): void
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp }
    __dhTelegramSdk?: Promise<void>
  }
}

/** The Mini App object, only when the page really runs inside Telegram (signed `initData`). */
export function telegram(): TelegramWebApp | null {
  const webApp = typeof window === 'undefined' ? undefined : window.Telegram?.WebApp
  return webApp?.initData ? webApp : null
}

export const isTelegram = () => telegram() !== null

/** Opened as a Mini App (index.html saw Telegram's launch parameters) — known before the SDK has loaded. */
export const isTelegramLaunch = () => document.documentElement.hasAttribute('data-tg')

function supports(webApp: TelegramWebApp, version: string): boolean {
  try {
    return webApp.isVersionAtLeast(version)
  } catch {
    return false
  }
}

/** Waits (max `timeoutMs`) for the SDK that index.html started loading inside Telegram. */
export async function waitForTelegramSdk(timeoutMs = 4000): Promise<void> {
  const sdk = window.__dhTelegramSdk
  if (!sdk) return
  await Promise.race([sdk, new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))])
}

// --- theme -----------------------------------------------------------------------------------

type Listener = () => void
const themeListeners = new Set<Listener>()

export function subscribeTelegramTheme(listener: Listener): () => void {
  themeListeners.add(listener)
  return () => {
    themeListeners.delete(listener)
  }
}

export const telegramColorScheme = (): 'light' | 'dark' | null => telegram()?.colorScheme ?? null

/** Paints the Telegram header, background and bottom bar with the page background colour. */
export function setTelegramChromeColor(hex: string): void {
  const webApp = telegram()
  if (!webApp || !/^#[0-9a-f]{6}$/i.test(hex)) return
  try {
    if (supports(webApp, '6.9')) webApp.setHeaderColor(hex)
    if (supports(webApp, '6.1')) webApp.setBackgroundColor(hex)
    if (supports(webApp, '7.10')) webApp.setBottomBarColor?.(hex)
  } catch {
    /* old client */
  }
}

/** Inside Telegram external links open through the client (in-app browser), elsewhere in a new tab. */
export function openExternal(url: string): boolean {
  const webApp = telegram()
  if (!webApp) return false
  try {
    webApp.openLink(url)
    return true
  } catch {
    return false
  }
}

/** Asks before the Mini App is closed (e.g. with a half-filled checkout). Returns the undo function. */
export function confirmClosing(): () => void {
  const webApp = telegram()
  if (!webApp || !supports(webApp, '6.2')) return () => {}
  try {
    webApp.enableClosingConfirmation?.()
  } catch {
    return () => {}
  }
  return () => {
    try {
      webApp.disableClosingConfirmation?.()
    } catch {
      /* ignore */
    }
  }
}

// --- haptics ---------------------------------------------------------------------------------

export type HapticKind = 'light' | 'medium' | 'select' | 'success' | 'error' | 'warning'

export function haptic(kind: HapticKind): void {
  const feedback = telegram()?.HapticFeedback
  if (!feedback) return
  try {
    if (kind === 'light' || kind === 'medium') feedback.impactOccurred(kind)
    else if (kind === 'select') feedback.selectionChanged()
    else feedback.notificationOccurred(kind)
  } catch {
    /* unsupported */
  }
}

// --- main button -----------------------------------------------------------------------------

export interface MainButtonConfig {
  text: string
  onClick: () => void
  disabled?: boolean
  progress?: boolean
  shine?: boolean
  /** Keep the button hidden while this owner is on top (e.g. a sheet with its own buttons). */
  hidden?: boolean
}

interface MainButtonEntry {
  priority: number
  order: number
  config: MainButtonConfig | null
}

const mainButtonEntries = new Map<number, MainButtonEntry>()
let mainButtonIds = 0
let mainButtonOrder = 0
let activeMainButton: MainButtonEntry | null = null
let mainButtonState = ''

function topMainButton(): MainButtonEntry | null {
  let best: MainButtonEntry | null = null
  for (const entry of mainButtonEntries.values()) {
    if (!entry.config) continue
    if (!best || entry.priority > best.priority || (entry.priority === best.priority && entry.order > best.order)) {
      best = entry
    }
  }
  return best
}

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback
}

function syncMainButton(): void {
  const webApp = telegram()
  if (!webApp) return
  activeMainButton = topMainButton()
  const config = activeMainButton?.config
  const button = webApp.MainButton
  const state =
    config && !config.hidden
      ? JSON.stringify([config.text, config.disabled, config.progress, config.shine, cssVar('--brand', '')])
      : 'hidden'
  if (state === mainButtonState) return
  mainButtonState = state
  try {
    if (!config || config.hidden) {
      button.hideProgress()
      button.setParams({ is_visible: false })
      return
    }
    button.setParams({
      text: config.text,
      color: cssVar('--brand', '#ff5a1f'),
      text_color: cssVar('--brand-ink', '#ffffff'),
      is_active: !config.disabled && !config.progress,
      is_visible: true,
      has_shine_effect: Boolean(config.shine),
    })
    if (config.progress) button.showProgress(false)
    else button.hideProgress()
  } catch {
    /* old client */
  }
}

export const mainButton = {
  register(priority: number): number {
    const id = ++mainButtonIds
    mainButtonEntries.set(id, { priority, order: ++mainButtonOrder, config: null })
    return id
  },
  update(id: number, config: MainButtonConfig | null): void {
    const entry = mainButtonEntries.get(id)
    if (!entry) return
    if (config && !entry.config) entry.order = ++mainButtonOrder
    entry.config = config
    syncMainButton()
  },
  unregister(id: number): void {
    mainButtonEntries.delete(id)
    syncMainButton()
  },
  /** What the button shows now (null when hidden). */
  current: (): MainButtonConfig | null => {
    const config = topMainButton()?.config
    return config && !config.hidden ? config : null
  },
}

// --- start-up --------------------------------------------------------------------------------

let initialised = false

export function initTelegram(): TelegramWebApp | null {
  const webApp = telegram()
  if (!webApp || initialised) return webApp
  initialised = true
  document.documentElement.setAttribute('data-tg', '')
  try {
    webApp.ready()
    webApp.expand()
    if (supports(webApp, '7.7')) webApp.disableVerticalSwipes?.()
  } catch {
    /* old client */
  }
  webApp.MainButton.onClick(() => {
    const config = activeMainButton?.config
    if (config && !config.hidden && !config.disabled && !config.progress) config.onClick()
  })
  webApp.onEvent('themeChanged', () => themeListeners.forEach((listener) => listener()))
  return webApp
}

/** Test helper: forget the start-up state between tests. */
export function resetTelegramForTests(): void {
  initialised = false
  mainButtonEntries.clear()
  activeMainButton = null
  mainButtonState = ''
  document.documentElement.removeAttribute('data-tg')
}

import { useEffect } from 'react'

/**
 * Lifts the toasts above a bar fixed to the bottom of the screen (the phone's menu, the sale's cart bar) while it
 * is shown. `offset` — a CSS length from the bottom edge, the bar's height included (ToastProvider reads it).
 */
export function useToastOffset(offset: string | false) {
  useEffect(() => {
    if (!offset) return
    const root = document.documentElement
    root.style.setProperty('--toast-offset', offset)
    return () => {
      root.style.removeProperty('--toast-offset')
    }
  }, [offset])
}

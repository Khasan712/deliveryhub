/** The brand color of a business without one: what its shop shows then (client-ui `DEFAULT_BRAND`). */
export const DEFAULT_BRAND_COLOR = '#ff5a1f'

export const BRAND_PRESETS: { value: string; name: string }[] = [
  { value: '#6366f1', name: 'Indigo' },
  { value: '#7c3aed', name: 'Binafsha' },
  { value: '#db2777', name: 'Pushti' },
  { value: '#dc2626', name: 'Qizil' },
  { value: '#ff6b00', name: "To'q sariq" },
  { value: '#f59e0b', name: 'Sariq' },
  { value: '#16a34a', name: 'Yashil' },
  { value: '#0d9488', name: 'Feruza' },
  { value: '#0284c7', name: 'Moviy' },
  { value: '#0f172a', name: 'Qora' },
]

export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value)
}

export function brandColor(value: string | null | undefined): string {
  return value && isHexColor(value) ? value.toLowerCase() : DEFAULT_BRAND_COLOR
}

/** Whether white text reads well on the color (WCAG relative luminance); otherwise use dark text. */
export function prefersLightText(hex: string): boolean {
  const channels = [1, 3, 5].map((start) => {
    const value = parseInt(brandColor(hex).slice(start, start + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  const [r = 0, g = 0, b = 0] = channels
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  // The initials are large and bold, so white stays down to a 2.5:1 contrast (brand orange keeps white text).
  return 1.05 / (luminance + 0.05) >= 2.5
}

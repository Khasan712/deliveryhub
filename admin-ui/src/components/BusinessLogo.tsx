import { useState } from 'react'
import { cn } from '../lib/cn'
import { initials } from '../lib/format'
import { readableTextColor } from '../lib/color'

interface BusinessLogoProps {
  name: string
  logo?: string | null
  brandColor?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const SIZES = {
  sm: 'size-8 rounded-lg text-xs',
  md: 'size-9 rounded-xl text-sm',
  lg: 'size-12 rounded-xl text-base',
  xl: 'size-16 rounded-2xl text-xl',
}

/** The business logo, or its initials on the brand colour. */
export function BusinessLogo({ name, logo, brandColor, size = 'md', className }: BusinessLogoProps) {
  const [failed, setFailed] = useState(false)
  if (logo && !failed) {
    return (
      <img
        src={logo}
        alt=""
        onError={() => setFailed(true)}
        className={cn('shrink-0 bg-white object-cover ring-1 ring-black/5', SIZES[size], className)}
      />
    )
  }
  const color = brandColor && /^#[0-9a-f]{6}$/i.test(brandColor) ? brandColor : '#ff5a1f'  // the shop's own default
  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex shrink-0 items-center justify-center font-bold shadow-sm', SIZES[size], className)}
      style={{ backgroundColor: color, color: readableTextColor(color) }}
    >
      {initials(name)}
    </span>
  )
}

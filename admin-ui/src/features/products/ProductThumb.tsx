import { useState } from 'react'
import { IconImage, IconSnowflake } from '../../components/icons'
import { cn } from '../../lib/cn'

const SIZES = {
  sm: 'size-10 rounded-lg',
  md: 'size-12 rounded-xl',
  lg: 'size-16 rounded-xl',
}

interface ProductThumbProps {
  src: string | null | undefined
  size?: keyof typeof SIZES
  className?: string
  /** Frozen product: a muted photo with a snowflake in the corner. */
  frozen?: boolean
}

export function ProductThumb({ src, size = 'md', className, frozen }: ProductThumbProps) {
  const [failed, setFailed] = useState(false)
  const image =
    src && !failed ? (
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={cn(
          'shrink-0 bg-subtle object-cover ring-1 ring-line transition-[filter,opacity]',
          SIZES[size],
          frozen && 'opacity-60 grayscale',
          className,
        )}
      />
    ) : (
      <span className={cn('flex shrink-0 items-center justify-center bg-subtle text-faint ring-1 ring-line', SIZES[size], className)}>
        <IconImage size={size === 'sm' ? 16 : 20} />
      </span>
    )
  if (!frozen) return image
  return (
    <span className="relative flex shrink-0">
      {image}
      <span
        aria-hidden="true"
        className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-sky-500 text-white shadow-sm ring-2 ring-card"
      >
        <IconSnowflake size={12} strokeWidth={2.5} />
      </span>
    </span>
  )
}

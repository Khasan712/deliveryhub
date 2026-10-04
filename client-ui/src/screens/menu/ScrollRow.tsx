import { Children, useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { useI18n } from '../../i18n/i18n'
import { cn } from '../../lib/cn'
import { prefersReducedMotion } from '../../lib/motion'

/**
 * One row of cards that scrolls sideways: swiped on phones and trackpads, and with arrows where there is a mouse
 * (they hide at the ends). On phones the row runs from edge to edge of the screen; in the columns of wide
 * screens it stays inside the menu.
 */
export function ScrollRow({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const row = useRef<HTMLDivElement>(null)
  const [ends, setEnds] = useState({ start: true, end: true })
  const count = Children.count(children)

  useEffect(() => {
    const element = row.current
    if (!element) return undefined
    const update = () => {
      const start = element.scrollLeft <= 2
      const end = element.scrollLeft >= element.scrollWidth - element.clientWidth - 2
      setEnds((current) => (current.start === start && current.end === end ? current : { start, end }))
    }
    update()
    element.addEventListener('scroll', update, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(element)
    return () => {
      element.removeEventListener('scroll', update)
      observer?.disconnect()
    }
  }, [count])

  const scroll = (direction: 1 | -1) => {
    const element = row.current
    if (!element) return
    // Most of a screenful: the card cut at the edge comes in whole (the row snaps to cards).
    element.scrollTo({
      left: element.scrollLeft + direction * element.clientWidth * 0.85,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
  }

  return (
    <div className="relative">
      <div
        ref={row}
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pt-0.5 pb-3 md:-mx-6 md:scroll-px-6 md:gap-4 md:px-6 lg:-mx-1.5 lg:scroll-px-1.5 lg:px-1.5"
      >
        {children}
      </div>
      <Arrow direction={-1} label={t('scrollLeft')} hidden={ends.start} onClick={() => scroll(-1)} />
      <Arrow direction={1} label={t('scrollRight')} hidden={ends.end} onClick={() => scroll(1)} />
    </div>
  )
}

function Arrow({ direction, label, hidden, onClick }: { direction: 1 | -1; label: string; hidden: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={hidden}
      onClick={onClick}
      className={cn(
        // On the middle of the photos (cards 240px wide, 264px from lg: photos 4:3); only with a mouse.
        'absolute top-[93px] z-[1] hidden size-11 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface text-ink shadow-card transition-[opacity,background-color] duration-200 hover:bg-surface-2 md:pointer-fine:grid lg:top-[101px]',
        direction < 0 ? '-left-3' : '-right-3',
        hidden && 'pointer-events-none opacity-0',
      )}
    >
      <Icon name={direction < 0 ? 'chevron-left' : 'chevron-right'} className="size-5" />
    </button>
  )
}

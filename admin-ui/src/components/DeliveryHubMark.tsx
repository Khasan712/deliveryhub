import { cn } from '../lib/cn'

/**
 * DeliveryHub's mark: a shopping bag on its way (leaning forward, speed lines behind it) on the carrot-orange square —
 * the same as on our page for businesses, our panel and the app icon. Size and corners come with `className`.
 */
export function DeliveryHubMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center bg-linear-to-br from-[#ff8a1f] to-[#e4500a] shadow-md shadow-primary-700/30 ring-1 ring-inset ring-white/15',
        className,
      )}
    >
      <svg viewBox="0 0 32 32" className="size-full" fill="none" stroke="#fff" strokeLinecap="round">
        <g transform="rotate(8 17.5 18) translate(2.2 0)">
          <path d="M12.3 12.6v-1.5a3.7 3.7 0 0 1 7.4 0v1.5" strokeWidth="2" />
          <path d="M9.4 12.6h13.2l-.95 10.7a2.1 2.1 0 0 1-2.1 1.9h-7.1a2.1 2.1 0 0 1-2.1-1.9z" fill="#fff" stroke="none" />
        </g>
        <path d="M6.2 15.4h3.4M4.4 18.6h5.2M6.6 21.8h3" strokeWidth="1.9" />
      </svg>
    </span>
  )
}

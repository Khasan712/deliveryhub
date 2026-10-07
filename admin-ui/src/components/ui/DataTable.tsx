import type { MouseEvent, ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { cn } from '../../lib/cn'
import { DESKTOP_QUERY, useMediaQuery } from '../../lib/useMediaQuery'
import { Skeleton } from './Skeleton'
import { ErrorState } from './States'

export interface Column<T> {
  key: string
  header: ReactNode
  cell: (row: T) => ReactNode
  className?: string
  align?: 'left' | 'right' | 'center'
  /** Hide the column on narrow screens. */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl'
  /** Skeleton width while loading. */
  skeleton?: string
}

interface DataTableProps<T> {
  columns: Array<Column<T>>
  rows: T[] | undefined
  rowKey: (row: T) => string | number
  loading?: boolean
  /** Refetching while showing previous data. */
  fetching?: boolean
  error?: unknown
  onRetry?: () => void
  empty?: ReactNode
  /** Clicking a row opens this address (links inside the row keep working). */
  rowHref?: (row: T) => string
  /** Card layout used below the `md` breakpoint instead of the table. */
  mobileCard?: (row: T) => ReactNode
  /** The cards' list: rows divided by lines (default), or e.g. separate cards with gaps. */
  mobileListClassName?: string
  skeletonRows?: number
  caption: string
  footer?: ReactNode
  rowClassName?: (row: T) => string | undefined
}

const HIDE: Record<NonNullable<Column<unknown>['hideBelow']>, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
}

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' }

function isInteractive(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('a, button, input, select, textarea, label, [role="switch"]')
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  fetching,
  error,
  onRetry,
  empty,
  rowHref,
  mobileCard,
  mobileListClassName = 'divide-y divide-line',
  skeletonRows = 6,
  caption,
  footer,
  rowClassName,
}: DataTableProps<T>) {
  const navigate = useNavigate()
  const desktop = useMediaQuery(DESKTOP_QUERY)
  const showSkeleton = loading && !rows
  const showError = !!error && !rows
  const isEmpty = !showSkeleton && !showError && rows?.length === 0
  const cards = !!mobileCard && !desktop

  const onRowClick = (event: MouseEvent<HTMLTableRowElement>, row: T) => {
    if (!rowHref || isInteractive(event.target)) return
    const selection = window.getSelection?.()
    if (selection && selection.toString().length > 0) return
    const href = rowHref(row)
    if (event.metaKey || event.ctrlKey) window.open(href, '_blank', 'noopener')
    else navigate(href)
  }

  return (
    <div className="relative">
      {fetching && !showSkeleton && (
        <div className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden" aria-hidden="true">
          <div className="h-full w-1/3 animate-progress rounded-full bg-primary-500/80" />
        </div>
      )}

      {showError ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : isEmpty ? (
        empty
      ) : cards ? (
        <ul className={cn(mobileListClassName, fetching && 'opacity-70 transition-opacity')} aria-label={caption}>
          {showSkeleton
            ? Array.from({ length: Math.min(skeletonRows, 5) }, (_, index) => (
                <li key={index} className="flex items-center gap-3 px-4 py-4">
                  <Skeleton className="size-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </li>
              ))
            : rows?.map((row) => <li key={rowKey(row)}>{mobileCard?.(row)}</li>)}
        </ul>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className={cn('w-full border-collapse text-sm', fetching && 'opacity-70 transition-opacity')}>
              <caption className="sr-only">{caption}</caption>
              <thead>
                <tr className="border-b border-line bg-subtle/60">
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      scope="col"
                      className={cn(
                        'whitespace-nowrap px-5 py-3 text-[11.5px] font-semibold uppercase tracking-wider text-muted first:pl-5',
                        ALIGN[column.align ?? 'left'],
                        column.hideBelow && HIDE[column.hideBelow],
                        column.className,
                      )}
                    >
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {showSkeleton
                  ? Array.from({ length: skeletonRows }, (_, index) => (
                      <tr key={index}>
                        {columns.map((column) => (
                          <td
                            key={column.key}
                            className={cn('px-5 py-4', column.hideBelow && HIDE[column.hideBelow])}
                          >
                            <Skeleton className={cn('h-4', column.skeleton ?? 'w-24', column.align === 'right' && 'ml-auto')} />
                          </td>
                        ))}
                      </tr>
                    ))
                  : rows?.map((row) => (
                      <tr
                        key={rowKey(row)}
                        onClick={rowHref ? (event) => onRowClick(event, row) : undefined}
                        className={cn(
                          'group transition-colors',
                          rowHref && 'cursor-pointer hover:bg-hover',
                          rowClassName?.(row),
                        )}
                      >
                        {columns.map((column) => (
                          <td
                            key={column.key}
                            className={cn(
                              'px-5 py-3.5 align-middle',
                              ALIGN[column.align ?? 'left'],
                              column.hideBelow && HIDE[column.hideBelow],
                              column.className,
                            )}
                          >
                            {column.cell(row)}
                          </td>
                        ))}
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {footer}
    </div>
  )
}

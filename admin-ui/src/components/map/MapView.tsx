import { lazy, Suspense } from 'react'
import { cn } from '../../lib/cn'
import { Spinner } from '../ui/Spinner'
import type { MapCanvasProps } from './MapCanvas'

// MapLibre (~1 MB) is its own chunk, loaded the first time a map is shown.
const MapCanvas = lazy(() => import('./MapCanvas'))

/** A map in a rounded frame; `className` gives it its height. */
export function MapView({ className, ...props }: MapCanvasProps & { className?: string }) {
  return (
    <div className={cn('relative isolate overflow-hidden rounded-xl bg-subtle ring-1 ring-line', className)}>
      <Suspense
        fallback={
          <div className="grid size-full place-items-center text-faint">
            <Spinner size={22} />
          </div>
        }
      >
        <MapCanvas {...props} />
      </Suspense>
    </div>
  )
}

import { useEffect, useEffectEvent } from 'react'
import type { MapCanvasProps } from '../components/map/MapCanvas'
import { MAP_MOVE } from './fixtures'

/**
 * jsdom has no WebGL: tests get this map instead. "Moving" it lands on MAP_MOVE; a flight (search result, the
 * customer's location) lands on its target at once.
 */
export default function FakeMap({ label, target, onMoveStart, onMoveEnd }: MapCanvasProps) {
  const move = (point: MapCanvasProps['center']) => {
    onMoveStart()
    onMoveEnd(point)
  }
  const land = useEffectEvent(move)
  useEffect(() => {
    if (target) land(target.point)
  }, [target])
  return (
    <section aria-label={label}>
      <button type="button" onClick={() => move(MAP_MOVE)}>
        Xaritani surish
      </button>
    </section>
  )
}

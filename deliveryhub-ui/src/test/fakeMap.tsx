import type { MapCanvasProps } from '../components/map/MapCanvas'
import { MAP_CLICK } from './fixtures'

/** jsdom has no WebGL: tests get this map instead — a button stands for a click on it. */
export default function FakeMap({ point, onPick, label }: MapCanvasProps) {
  return (
    <section aria-label={label}>
      <button type="button" onClick={() => onPick(MAP_CLICK)}>
        Xaritaga bosish
      </button>
      {point && <p>Belgi: {`${point.lat}, ${point.lng}`}</p>}
    </section>
  )
}

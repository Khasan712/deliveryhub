import type { MapCanvasProps } from '../components/map/MapCanvas'
import { MAP_CLICK } from './fixtures'

/** jsdom has no WebGL: tests get this map instead — the places as a list, a button stands for a click on the map. */
export default function FakeMap({ label, pins = [], point, onPick, onPinClick, line }: MapCanvasProps) {
  return (
    <section aria-label={label}>
      {onPick && (
        <button type="button" onClick={() => onPick(MAP_CLICK)}>
          Xaritaga bosish
        </button>
      )}
      {point && <p>Belgi: {`${point.lat}, ${point.lng}`}</p>}
      <ul aria-label="Xaritadagi joylar">
        {pins.map((pin) => (
          <li key={pin.id} data-tone={pin.tone}>
            {onPinClick && pin.tone !== 'customer' ? (
              <button type="button" onClick={() => onPinClick(pin.id)}>{`Xaritada: ${pin.label}`}</button>
            ) : (
              pin.label
            )}
            {pin.detail && ` · ${pin.detail}`}
          </li>
        ))}
      </ul>
      {line && <p>Chiziq: {line.map((place) => `${place.lat}, ${place.lng}`).join(' → ')}</p>}
    </section>
  )
}

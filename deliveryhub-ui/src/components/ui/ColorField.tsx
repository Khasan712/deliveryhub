import { useId, useState } from 'react'
import { BRAND_PRESETS, DEFAULT_BRAND_COLOR, isHexColor, prefersLightText } from '../../lib/color'
import { cx } from '../../lib/cx'
import { CheckIcon } from '../icons'
import { FieldError } from './Field'
import { inputClass } from './styles'

interface ColorFieldProps {
  value: string
  onChange: (color: string) => void
  label?: string
  error?: string | null
  /** Id of the HEX input (to focus it on errors). */
  id?: string
}

/** Brand color: preset swatches (radio buttons), the system color picker and a HEX field. */
export function ColorField({ value, onChange, label = 'Rang', error, id }: ColorFieldProps) {
  const name = useId()
  const autoHexId = useId()
  const hexId = id ?? autoHexId
  const errorId = useId()
  const [hex, setHex] = useState(value)
  const [shown, setShown] = useState(value)
  const current = value.toLowerCase()
  const isPreset = BRAND_PRESETS.some((preset) => preset.value === current)

  // Keep the HEX field in sync when a swatch or the picker changes the color.
  if (shown !== value) {
    setShown(value)
    setHex(value)
  }

  const swatchClass =
    'block size-8 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08)] transition peer-checked:ring-2 peer-checked:ring-slate-900 peer-checked:ring-offset-2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-indigo-500 hover:scale-110'

  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <legend className="text-sm font-semibold text-slate-700">{label}</legend>
      <div className="mt-2 flex flex-wrap items-center gap-2.5">
        {BRAND_PRESETS.map((preset) => (
          <label key={preset.value} className="relative" title={preset.name}>
            <input
              type="radio"
              name={name}
              value={preset.value}
              checked={current === preset.value}
              onChange={() => onChange(preset.value)}
              className="peer sr-only"
            />
            <span className={swatchClass} style={{ backgroundColor: preset.value }} />
            {current === preset.value && (
              <CheckIcon
                size={16}
                strokeWidth={3}
                className={cx(
                  'pointer-events-none absolute inset-0 m-auto',
                  prefersLightText(preset.value) ? 'text-white' : 'text-slate-900',
                )}
              />
            )}
            <span className="sr-only">{preset.name}</span>
          </label>
        ))}
        <label className="relative" title="Boshqa rang">
          <input
            type="color"
            value={isHexColor(value) ? value : DEFAULT_BRAND_COLOR}
            onChange={(event) => onChange(event.target.value)}
            className="peer absolute inset-0 size-8 cursor-pointer opacity-0"
          />
          <span
            className={cx(
              'block size-8 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08)] transition peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-indigo-500',
              !isPreset && 'ring-2 ring-slate-900 ring-offset-2',
            )}
            style={{
              background: isPreset
                ? 'conic-gradient(from 180deg, #ef4444, #f59e0b, #22c55e, #06b6d4, #6366f1, #d946ef, #ef4444)'
                : value,
            }}
          />
          <span className="sr-only">Boshqa rang</span>
        </label>
        <label htmlFor={hexId} className="sr-only">
          Rang kodi (HEX)
        </label>
        <div className="w-28">
          <input
            id={hexId}
            value={hex}
            maxLength={7}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => {
              const next = event.target.value.trim()
              const withHash = next.startsWith('#') ? next : `#${next}`
              setHex(next)
              if (isHexColor(withHash)) onChange(withHash.toLowerCase())
            }}
            onBlur={() => setHex(value)}
            className={inputClass(false, 'h-9 font-mono text-sm uppercase')}
          />
        </div>
      </div>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </fieldset>
  )
}

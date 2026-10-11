import type { Ref } from 'react'
import { ExternalLink } from '../../components/ExternalLink'
import { Icon } from '../../components/Icon'
import { useI18n } from '../../i18n/i18n'
import { cn } from '../../lib/cn'
import { mapUrl } from '../../lib/format'
import { formatKm } from '../../lib/geo'
import type { BranchChoice } from './form'

const LABEL_ID = 'checkout-branch-label'
const ERROR_ID = 'checkout-branch-error'

interface BranchPickerProps {
  choices: BranchChoice[]
  value: number | null
  onChange: (id: number) => void
  error?: string
  /** The first branch of the list: focused when none is chosen yet. */
  firstRef?: Ref<HTMLInputElement>
}

/**
 * «Qaysi filialdan olib ketasiz?» — the branches of the business as radio cards: name, address and, once the
 * customer's point is known, the straight-line distance (the nearest first). Each one opens on a map.
 */
export function BranchPicker({ choices, value, onChange, error, firstRef }: BranchPickerProps) {
  const { t } = useI18n()
  const measured = choices.some((choice) => choice.km !== null)

  return (
    <div className="mt-4">
      <p id={LABEL_ID} className="mb-1.5 text-[13px] font-bold text-ink-2">
        {t('pickupBranch')}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={LABEL_ID}
        aria-required="true"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? ERROR_ID : undefined}
        className="space-y-2"
      >
        {choices.map(({ branch, km, nearest }, index) => {
          const selected = branch.id === value
          const nameId = `checkout-branch-${branch.id}`
          return (
            <div
              key={branch.id}
              className={cn(
                'flex items-stretch rounded-2xl border-[1.5px] transition-colors duration-150',
                selected ? 'border-brand bg-brand-soft' : error ? 'border-red/70 bg-surface-2' : 'border-transparent bg-surface-2',
              )}
            >
              <label
                className={cn(
                  'flex min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-2xl p-3',
                  'has-[:focus-visible]:outline-[2.5px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand has-[:focus-visible]:outline-solid',
                )}
              >
                <input
                  ref={index === 0 ? firstRef : undefined}
                  type="radio"
                  name="checkout-branch"
                  value={branch.id}
                  checked={selected}
                  onChange={() => onChange(branch.id)}
                  aria-labelledby={nameId}
                  aria-describedby={`${nameId}-details`}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-px grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors',
                    selected ? 'border-brand bg-brand' : 'border-muted/50 bg-surface',
                  )}
                >
                  {selected && <span className="size-2 rounded-full bg-brand-ink" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span id={nameId} className="block text-[15px] leading-snug font-extrabold">
                    {branch.name}
                  </span>
                  <span id={`${nameId}-details`} className="mt-0.5 block text-[13px] leading-snug font-semibold text-muted">
                    {branch.address}
                    {km !== null && (
                      <span className="sr-only">
                        {branch.address && ', '}
                        {t('km', { km: formatKm(km) })}
                        {nearest && `, ${t('nearest')}`}
                      </span>
                    )}
                  </span>
                </span>
                {km !== null && (
                  <span aria-hidden="true" className="flex shrink-0 flex-col items-end gap-1 pt-px">
                    <span className="tabular text-[13px] font-extrabold whitespace-nowrap">{t('km', { km: formatKm(km) })}</span>
                    {nearest && (
                      <span className="rounded-full bg-green-soft px-2 py-0.5 text-[11px] font-extrabold whitespace-nowrap text-green">
                        {t('nearest')}
                      </span>
                    )}
                  </span>
                )}
              </label>
              {branch.lat !== null && branch.lng !== null && (
                <ExternalLink
                  href={mapUrl(branch.lat, branch.lng)}
                  aria-label={t('branchOnMap', { name: branch.name })}
                  className="grid w-11 shrink-0 place-items-center rounded-r-2xl text-brand-text transition-colors hover:bg-brand-soft"
                >
                  <Icon name="map" className="size-[18px]" />
                </ExternalLink>
              )}
            </div>
          )
        })}
      </div>
      {error && (
        <p id={ERROR_ID} role="alert" className="mt-1.5 flex items-center gap-1.5 text-[12.5px] font-bold text-red">
          <Icon name="alert" className="size-3.5" />
          {error}
        </p>
      )}
      {measured && <p className="mt-2 text-xs font-semibold text-muted">{t('distanceNote')}</p>}
    </div>
  )
}

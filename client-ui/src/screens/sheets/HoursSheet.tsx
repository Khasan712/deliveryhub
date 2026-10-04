import { Sheet, SheetBody, SheetGrabber, SheetHeader } from '../../components/Sheet'
import { useI18n } from '../../i18n/i18n'
import { cn } from '../../lib/cn'
import { shiftLabel, statusLabel, weekday } from '../../lib/hours'
import { useCatalog } from '../../state/catalog'
import { useOpenStatus } from '../../state/hooks'
import { useNav } from '../../state/nav'

/** The week of working hours, today first in the eye (opened from the status chip of the banner). */
export function HoursSheet() {
  const { sheet, closeSheet } = useNav()
  const status = useOpenStatus()
  return (
    <Sheet open={sheet?.type === 'hours' && status !== null} onClose={closeSheet}>
      <HoursWeek />
    </Sheet>
  )
}

function HoursWeek() {
  const { t } = useI18n()
  const { business } = useCatalog()
  const status = useOpenStatus()
  const week = business?.working_hours.week
  if (!week || !status) return null
  const today = weekday(status.now)

  return (
    <>
      <SheetGrabber />
      <SheetHeader
        title={t('workingHours')}
        subtitle={
          <span className={cn('inline-flex items-center gap-1.5 font-bold', status.open ? 'text-green' : 'text-red')}>
            <span className="size-2 rounded-full bg-current" aria-hidden="true" />
            {statusLabel(status, t)}
          </span>
        }
      />
      <SheetBody>
        <ul className="pb-3">
          {week.map((shift, index) => (
            <li
              key={index}
              aria-current={index === today ? 'date' : undefined}
              className={cn(
                'flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-[15px]',
                index === today ? 'bg-brand-soft font-extrabold text-brand-text' : 'font-semibold',
              )}
            >
              <span>
                {t(`weekday_${index}` as 'weekday_0')}
                {index === today && <span className="ml-1.5 text-[12.5px] font-bold opacity-80">· {t('today')}</span>}
              </span>
              <span className={cn('tabular', !shift && 'text-muted')}>{shift ? shiftLabel(shift, t) : t('dayOff')}</span>
            </li>
          ))}
        </ul>
      </SheetBody>
    </>
  )
}

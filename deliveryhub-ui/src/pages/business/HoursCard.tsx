import type { BusinessDetail } from '../../api/types'
import { ClockIcon } from '../../components/icons'
import { Card } from '../../components/ui/Card'
import { cx } from '../../lib/cx'
import { DAYS, hoursStatus, shiftText } from '../../lib/hours'

/** The working hours the business set in its admin panel — shown here, changed only there. */
export function HoursCard({ business }: { business: BusinessDetail }) {
  const hours = business.working_hours
  return (
    <Card
      title="Ish vaqti"
      titleId="business-hours"
      description="Biznes o'zi admin panelda belgilaydi; bu yerda faqat ko'rinadi."
      icon={<ClockIcon size={18} />}
    >
      {hours.week ? (
        <>
          <p
            className={cx(
              'mb-3 inline-flex items-center gap-2 rounded-lg px-2.5 py-1 text-[13px] font-bold',
              hours.open ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700',
            )}
          >
            <span className={cx('size-2 rounded-full', hours.open ? 'bg-emerald-500' : 'bg-red-500')} aria-hidden="true" />
            {hoursStatus(hours)}
          </p>
          <dl className="divide-y divide-slate-100 text-sm">
            {hours.week.map((shift, index) => (
              <div key={DAYS[index]} className="flex items-center justify-between py-2">
                <dt className="font-semibold text-slate-600">{DAYS[index]}</dt>
                <dd className={cx('font-mono text-[13px] font-semibold', shift ? 'text-slate-900' : 'text-slate-400')}>
                  {shift ? shiftText(shift) : 'Dam olish'}
                </dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <p className="rounded-xl bg-slate-50 px-3.5 py-3 text-sm text-slate-600 ring-1 ring-slate-200/70">
          Ish vaqti belgilanmagan — do'kon istalgan vaqtda buyurtma qabul qiladi.
        </p>
      )}
    </Card>
  )
}

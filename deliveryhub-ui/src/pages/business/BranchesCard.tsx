import { useState } from 'react'
import { useUpdateBusiness } from '../../api/queries'
import type { BusinessDetail } from '../../api/types'
import { BranchesIcon, ExternalIcon } from '../../components/icons'
import { Card } from '../../components/ui/Card'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { buttonClass } from '../../components/ui/styles'
import { Switch } from '../../components/ui/Switch'
import { useToast } from '../../components/ui/toast'
import { errorMessage } from '../../lib/errors'
import { adminPageUrl } from '../../lib/paths'

const LABEL_ID = 'branches-switch-label'
const HELP_ID = 'branches-switch-help'

/**
 * Whether the business may open branches — a permission our staff grants. The owner adds the branches in the admin
 * panel and sends orders to them; turning it off keeps them (orders are just not split any more).
 */
export function BranchesCard({ business }: { business: BusinessDetail }) {
  const update = useUpdateBusiness(business.slug)
  const toast = useToast()
  const [confirmingOff, setConfirmingOff] = useState(false)
  const enabled = business.branches_enabled
  const { total, active } = business.branches

  const save = async (next: boolean) => {
    const updated = await update.mutateAsync({ patch: { branches_enabled: next }, logo: null })
    const counts = updated.branches
    if (next) {
      toast.success('Filial ochishga ruxsat berildi', {
        description:
          counts.active >= 2
            ? `${counts.active} ta faol filial: yetkazib berish buyurtmalari endi avval bosh ofisga keladi.`
            : undefined,
      })
    } else {
      toast.success("Filial ochishga ruxsat o'chirildi", {
        description: counts.total > 0 ? 'Filiallar saqlanib qoldi.' : undefined,
      })
    }
  }

  const change = (next: boolean) => {
    // Branches in use stop splitting the orders: ask first.
    if (!next && total > 0) {
      setConfirmingOff(true)
      return
    }
    save(next).catch((error: unknown) => toast.error("Saqlab bo'lmadi", { description: errorMessage(error) }))
  }

  return (
    <Card title="Filiallar" titleId="business-branches" icon={<BranchesIcon size={18} />}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p id={LABEL_ID} className="font-bold text-slate-900">
            Filial ochishga ruxsat
          </p>
          <p id={HELP_ID} className="mt-1 text-sm leading-relaxed text-slate-500">
            Biznes egasi filiallarni admin paneldagi «Filiallar» bo'limida qo'shadi. 2 va undan ortiq faol filial
            bo'lsa, yetkazib berish buyurtmalari avval bosh ofisga (admin va menejerlarga) keladi, ular har birini
            eng yaqin filialga yuboradi; olib ketishda mijoz filialni o'zi tanlaydi.
          </p>
        </div>
        <Switch
          checked={enabled}
          onChange={change}
          labelledBy={LABEL_ID}
          describedBy={HELP_ID}
          loading={update.isPending}
          className="mt-0.5"
        />
      </div>

      {enabled ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl bg-slate-50 px-3.5 py-3 ring-1 ring-slate-200/70">
          <p className="text-sm font-bold text-slate-800">
            {total > 0 ? `${total} ta filial (${active} faol)` : "Hali filial qo'shilmagan"}
          </p>
          <a
            href={adminPageUrl(business.links.admin, '/branches')}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass({ variant: 'secondary', size: 'sm' })}
          >
            Admin paneldagi filiallar
            <ExternalIcon size={13} className="text-slate-400" />
            <span className="sr-only">(yangi oynada)</span>
          </a>
        </div>
      ) : (
        total > 0 && (
          <p className="mt-4 rounded-xl bg-slate-50 px-3.5 py-3 text-sm text-slate-600 ring-1 ring-slate-200/70">
            {total} ta filial saqlangan — ruxsat qayta yoqilsa, yana ishlaydi.
          </p>
        )
      )}

      <ConfirmDialog
        open={confirmingOff}
        onClose={() => setConfirmingOff(false)}
        title="Filial ochishga ruxsat o'chirilsinmi?"
        description={
          <>
            {total} ta filial saqlanib qoladi, lekin buyurtmalar filiallarga taqsimlanmaydi va filial adminlari barcha
            buyurtmalarni ko'radi. Ruxsat qayta yoqilsa, filiallar yana ishlaydi.
          </>
        }
        confirmLabel="Ruxsatni o'chirish"
        tone="danger"
        onConfirm={() => save(false)}
      />
    </Card>
  )
}

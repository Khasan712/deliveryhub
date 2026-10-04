import { useState, type FormEvent } from 'react'
import { useUpdateBusiness } from '../../api/queries'
import type { BusinessDetail } from '../../api/types'
import { AlertIcon, MapPinIcon } from '../../components/icons'
import { LocationPicker } from '../../components/map/LocationPicker'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { useToast } from '../../components/ui/toast'
import { errorMessage, fieldErrors } from '../../lib/errors'
import type { Point } from '../../lib/map'

const SEARCH_ID = 'location-search'
const ADDRESS_ID = 'location-address'

function pointOf(business: BusinessDetail): Point | null {
  return business.lat !== null && business.lng !== null ? { lat: business.lat, lng: business.lng } : null
}

/** Where customers pick up their orders: the business's place on the map and its address. */
export function LocationCard({ business }: { business: BusinessDetail }) {
  const update = useUpdateBusiness(business.slug)
  const toast = useToast()
  const [saved, setSaved] = useState({ address: business.address, point: pointOf(business) })
  const [address, setAddress] = useState(saved.address)
  const [point, setPoint] = useState(saved.point)
  const [errors, setErrors] = useState<{ location?: string; address?: string }>({})
  const dirty = address.trim() !== saved.address || point?.lat !== saved.point?.lat || point?.lng !== saved.point?.lng

  const reset = () => {
    setAddress(saved.address)
    setPoint(saved.point)
    setErrors({})
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const found: typeof errors = {}
    if (!point) found.location = 'Xaritada biznes joyini belgilang'
    if (!address.trim()) found.address = 'Biznes manzilini kiriting'
    setErrors(found)
    if (found.location) document.getElementById(SEARCH_ID)?.focus()
    else if (found.address) document.getElementById(ADDRESS_ID)?.focus()
    if (!point || found.address || !dirty) return

    try {
      const patch = { address: address.trim(), lat: point.lat, lng: point.lng }
      const updated = await update.mutateAsync({ patch, logo: null })
      const next = { address: updated.address, point: pointOf(updated) }
      setSaved(next)
      setAddress(next.address)
      setPoint(next.point)
      toast.success('Joylashuv saqlandi')
    } catch (error) {
      const message = fieldErrors(error).address
      if (message) {
        setErrors({ address: message })
        document.getElementById(ADDRESS_ID)?.focus()
      } else {
        toast.error("Joylashuvni saqlab bo'lmadi", { description: errorMessage(error) })
      }
    }
  }

  return (
    <Card
      title="Joylashuv"
      titleId="business-location"
      description="Mijozlar buyurtmani shu yerdan olib ketadi; yetkazishda ham xarita shu atrofdan ochiladi."
      icon={<MapPinIcon size={18} />}
    >
      {!saved.point && (
        <p className="mb-4 flex items-start gap-2.5 rounded-xl bg-amber-50 px-3.5 py-3 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">
          <AlertIcon size={18} className="mt-px shrink-0" />
          Biznes hali xaritada belgilanmagan: mijozlar «Olib ketish»da manzilni ko'rmaydi.
        </p>
      )}
      <form noValidate onSubmit={submit} aria-labelledby="business-location">
        <LocationPicker
          id={SEARCH_ID}
          addressId={ADDRESS_ID}
          point={point}
          address={address}
          onPointChange={(next) => {
            setPoint(next)
            setErrors((current) => ({ ...current, location: undefined }))
          }}
          onAddressChange={(next) => {
            setAddress(next)
            setErrors((current) => ({ ...current, address: undefined }))
          }}
          locationError={errors.location}
          addressError={errors.address}
        />
        <div className="mt-4 flex justify-end gap-2">
          {dirty && (
            <Button variant="ghost" onClick={reset} disabled={update.isPending}>
              Bekor qilish
            </Button>
          )}
          <Button type="submit" variant="dark" loading={update.isPending} disabled={!dirty}>
            {update.isPending ? 'Saqlanmoqda…' : 'Joylashuvni saqlash'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

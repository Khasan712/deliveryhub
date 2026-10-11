import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { isApiError } from '../../api/client'
import { errorMessage, mapFieldErrors } from '../../api/errors'
import { useBranch, useBranches, useSaveBranch } from '../../api/queries'
import type { BranchInput } from '../../api/types'
import { NotFound } from '../../auth/SystemScreens'
import { useToast } from '../../components/feedback/feedback'
import { IconMapPin, IconPhone, IconStore, IconTrash } from '../../components/icons'
import { LocationPicker } from '../../components/map/LocationPicker'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { Field, Input } from '../../components/ui/Form'
import { PageHeader } from '../../components/ui/PageHeader'
import { Skeleton } from '../../components/ui/Skeleton'
import { ErrorState } from '../../components/ui/States'
import { Switch } from '../../components/ui/Switch'
import { useI18n } from '../../i18n/context'
import { formatFullDateTime } from '../../lib/format'
import { toPoint, type MapPin, type Point } from '../../lib/map'
import { useUnsavedChanges } from '../../lib/useUnsavedChanges'
import { useBranchActions } from './useBranchActions'

interface FormState {
  name: string
  address: string
  phone: string
  point: Point | null
  is_active: boolean
}

const EMPTY: FormState = { name: '', address: '', phone: '', point: null, is_active: true }

type Errors = Partial<Record<'name' | 'address' | 'phone' | 'point', string>>

const samePoint = (a: Point | null, b: Point | null) => a?.lat === b?.lat && a?.lng === b?.lng

/** A branch's name, its place on the map and the address customers read, its phone and whether it works. */
export function BranchFormPage() {
  const { id } = useParams()
  const editing = id !== undefined
  const { t, lang } = useI18n()
  const toast = useToast()
  const navigate = useNavigate()
  const branch = useBranch(id)
  const branches = useBranches()
  const save = useSaveBranch()
  const actions = useBranchActions()

  const [form, setForm] = useState<FormState>(EMPTY)
  const [initial, setInitial] = useState<FormState>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const loaded = useRef(false)

  // Fill the form once — a background refetch must not overwrite what the user is typing.
  useEffect(() => {
    if (!branch.data || loaded.current) return
    loaded.current = true
    const values: FormState = {
      name: branch.data.name,
      address: branch.data.address,
      phone: branch.data.phone,
      point: toPoint(branch.data.lat, branch.data.lng),
      is_active: branch.data.is_active,
    }
    setForm(values)
    setInitial(values)
  }, [branch.data])

  // The other branches on the picker's map, for orientation.
  const others = useMemo<MapPin[]>(
    () =>
      (branches.data ?? []).flatMap((item) => {
        const point = toPoint(item.lat, item.lng)
        return point && String(item.id) !== id ? [{ id: String(item.id), point, label: item.name, tone: 'muted' as const }] : []
      }),
    [branches.data, id],
  )

  const dirty =
    form.name !== initial.name ||
    form.address !== initial.address ||
    form.phone !== initial.phone ||
    form.is_active !== initial.is_active ||
    !samePoint(form.point, initial.point)
  const allowLeave = useUnsavedChanges(dirty)

  if (editing && isApiError(branch.error) && branch.error.status === 404) return <NotFound />

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    const field = key as keyof Errors
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const validate = (): Errors => {
    const found: Errors = {}
    if (!form.name.trim()) found.name = t('field_required')
    if (!form.point) found.point = t('branch_location_required')
    if (!form.address.trim()) found.address = t('field_required')
    return found
  }

  const focusFirst = (found: Errors) => {
    const first = (['name', 'point', 'address', 'phone'] as const).find((key) => found[key])
    if (first) document.getElementById(`branch-${first}`)?.focus()
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found = validate()
    setErrors(found)
    setFormError(null)
    if (Object.keys(found).length || !form.point) {
      focusFirst(found)
      return
    }
    const body: BranchInput = {
      name: form.name.trim(),
      address: form.address.trim(),
      lat: form.point.lat,
      lng: form.point.lng,
      phone: form.phone.trim(),
    }
    if (editing) body.is_active = form.is_active

    save.mutate(
      { id, body },
      {
        onSuccess: () => {
          allowLeave()
          toast.success(editing ? t('branch_saved') : t('branch_created'))
          navigate('/branches')
        },
        onError: (error) => {
          const mapped = mapFieldErrors(error, t, { lat: 'point', lng: 'point' }) as Errors
          setErrors(mapped)
          if (!Object.keys(mapped).length) setFormError(errorMessage(error, t))
          else focusFirst(mapped)
        },
      },
    )
  }

  const back = { to: '/branches', label: t('back_to_branches') }
  const title = editing ? t('edit_branch') : t('add_branch')

  if (editing && !branch.data) {
    return (
      <div className="max-w-3xl">
        <PageHeader back={back} title={title} />
        {branch.error ? (
          <Card>
            <ErrorState error={branch.error} onRetry={() => void branch.refetch()} />
          </Card>
        ) : (
          <Skeleton className="h-[36rem] rounded-2xl" />
        )}
      </div>
    )
  }

  const askDelete = async () => {
    if (!branch.data) return
    if (await actions.askDelete(branch.data)) {
      allowLeave()
      navigate('/branches')
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        back={back}
        title={title}
        description={editing && branch.data ? `${branch.data.name} · ${formatFullDateTime(branch.data.created_at, lang)}` : t('branches_subtitle')}
        actions={
          editing ? (
            <Button variant="danger-soft" icon={<IconTrash size={16} />} onClick={() => void askDelete()}>
              {t('delete')}
            </Button>
          ) : undefined
        }
      />

      <form onSubmit={submit} noValidate className="space-y-6">
        {formError && (
          <p
            role="alert"
            className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300"
          >
            {formError}
          </p>
        )}

        <Card>
          <CardHeader title={t('basic_info')} icon={<SectionIcon><IconStore size={18} /></SectionIcon>} />
          <div className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-2">
            <Field id="branch-name" label={t('branch_name')} error={errors.name} required>
              {(props) => (
                <Input
                  {...props}
                  value={form.name}
                  onChange={(event) => set('name', event.target.value)}
                  placeholder={t('branch_name_placeholder')}
                  maxLength={100}
                  autoComplete="off"
                />
              )}
            </Field>
            <Field id="branch-phone" label={t('phone')} error={errors.phone} hint={t('branch_phone_hint')}>
              {(props) => (
                <Input
                  {...props}
                  type="tel"
                  inputMode="tel"
                  placeholder="+998 71 200 11 22"
                  leading={<IconPhone size={18} />}
                  value={form.phone}
                  onChange={(event) => set('phone', event.target.value)}
                  maxLength={30}
                  autoComplete="off"
                />
              )}
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader
            title={t('branch_location')}
            description={t('branch_location_hint')}
            icon={<SectionIcon><IconMapPin size={18} /></SectionIcon>}
          />
          <div className="space-y-5 p-5">
            <LocationPicker
              id="branch-point"
              point={form.point}
              onPointChange={(point) => set('point', point)}
              address={form.address}
              onAddressChange={(address) => set('address', address)}
              pins={others}
              error={errors.point}
            />
            <Field id="branch-address" label={t('address')} error={errors.address} hint={t('branch_address_hint')} required>
              {(props) => (
                <Input
                  {...props}
                  value={form.address}
                  onChange={(event) => set('address', event.target.value)}
                  placeholder={t('branch_address_placeholder')}
                  maxLength={255}
                  autoComplete="off"
                />
              )}
            </Field>
          </div>
        </Card>

        {editing && (
          <Card>
            <div className="flex items-center justify-between gap-4 p-5">
              <div>
                <p className="text-sm font-semibold text-fg">{form.is_active ? t('active') : t('inactive')}</p>
                <p id="branch-active-hint" className="mt-0.5 text-[13px] text-muted">
                  {t('branch_active_hint')}
                </p>
              </div>
              <Switch
                checked={form.is_active}
                onChange={(value) => set('is_active', value)}
                label={t('active')}
                aria-describedby="branch-active-hint"
                tone="green"
              />
            </div>
          </Card>
        )}

        {/* On a phone the bar stays above the bottom menu. */}
        <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 -mx-4 border-t border-line bg-app/85 px-4 py-3 backdrop-blur-lg sm:-mx-6 sm:px-6 lg:bottom-0 lg:mx-0 lg:rounded-2xl lg:border lg:bg-card/90 lg:px-5">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <ButtonLink to="/branches" variant="secondary">
              {t('cancel')}
            </ButtonLink>
            <Button type="submit" loading={save.isPending} disabled={editing && !dirty}>
              {editing ? t('save_changes') : t('create_branch')}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}

function SectionIcon({ children }: { children: ReactNode }) {
  return <span className="flex size-9 items-center justify-center rounded-xl bg-subtle text-muted ring-1 ring-line">{children}</span>
}

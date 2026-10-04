import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useBlocker, useNavigate } from 'react-router'
import { useBusinesses, useCreateBusiness, useSlugCheck } from '../api/queries'
import type { SlugError } from '../api/types'
import { Avatar } from '../components/Avatar'
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  DashboardIcon,
  ErrorCircleIcon,
  InfoIcon,
  KeyIcon,
  MapPinIcon,
  PaletteIcon,
  PhoneIcon,
  RefreshIcon,
  SparklesIcon,
  StoreIcon,
  UserIcon,
  WalletIcon,
} from '../components/icons'
import { LogoField } from '../components/LogoField'
import { LocationPicker } from '../components/map/LocationPicker'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ColorField } from '../components/ui/ColorField'
import { ConfirmDialog } from '../components/ui/Dialog'
import { Field, FieldError } from '../components/ui/Field'
import { MoneyInput } from '../components/ui/MoneyInput'
import { Spinner } from '../components/ui/Spinner'
import { useToast } from '../components/ui/toast'
import { DEFAULT_BRAND_COLOR, isHexColor } from '../lib/color'
import { cx } from '../lib/cx'
import { platformDomain } from '../lib/domain'
import { errorMessage, fieldErrors, fieldMessage } from '../lib/errors'
import { formatPrice } from '../lib/format'
import type { Point } from '../lib/map'
import { useDebouncedValue, useFilePreview } from '../lib/hooks'
import { businessPath } from '../lib/paths'
import { formatPhone, normalizePhone } from '../lib/phone'
import { isSlugShapeValid, normalizeSlugInput, SLUG_MIN, slugify } from '../lib/slug'
import { buttonClass, cardClass, inputClass } from '../components/ui/styles'

const INITIAL = {
  name: '',
  slug: '',
  tagline: '',
  address: '',
  support_phone: '',
  delivery_time: '30–45',
  min_order: '0',
  brand_color: DEFAULT_BRAND_COLOR,
  owner_name: '',
  owner_phone: '',
  owner_password: '',
}

type Values = typeof INITIAL
type FieldName = keyof Values | 'logo' | 'location'
type Errors = Partial<Record<FieldName, string>>

/** Error focus order = the order of the fields on the page. */
const FIELDS: FieldName[] = [
  'name',
  'slug',
  'tagline',
  'location',
  'address',
  'support_phone',
  'delivery_time',
  'min_order',
  'brand_color',
  'logo',
  'owner_name',
  'owner_phone',
  'owner_password',
]
const fieldId = (field: FieldName) => `new-${field.replace('_', '-')}`
/** API limits: the owner's password (empty → generated) and the minimal order. */
const PASSWORD_MIN = 8
const MAX_MIN_ORDER = 100_000_000

type SlugState = 'idle' | 'short' | 'checking' | 'available' | 'unknown' | SlugError

/** Live availability of the address: debounced `check-slug` calls, cached per slug. */
function useSlugAvailability(slug: string): SlugState {
  const debounced = useDebouncedValue(slug, 350)
  const shapeOk = isSlugShapeValid(slug)
  const settled = debounced === slug
  const check = useSlugCheck(debounced, shapeOk && settled)

  if (!slug) return 'idle'
  if (!shapeOk) return slug.length < SLUG_MIN ? 'short' : 'slug_invalid'
  if (!settled) return 'checking'
  if (check.data) return check.data.available ? 'available' : check.data.error
  if (check.isError) return 'unknown'
  return 'checking'
}

const NO_LOCATION = 'Xaritada biznes joyini belgilang'

function validate(values: Values, slugState: SlugState, point: Point | null): Errors {
  const errors: Errors = {}
  if (!values.name.trim()) errors.name = 'Biznes nomini kiriting'
  if (!values.slug) errors.slug = 'Manzilni kiriting'
  else if (!isSlugShapeValid(values.slug)) errors.slug = fieldMessage('slug', 'slug_invalid')
  else if (slugState.startsWith('slug_')) errors.slug = fieldMessage('slug', slugState)
  if (!point) errors.location = NO_LOCATION
  if (!values.address.trim()) errors.address = 'Biznes manzilini kiriting'
  if (!isHexColor(values.brand_color)) errors.brand_color = fieldMessage('brand_color', 'invalid')
  if (!values.owner_name.trim()) errors.owner_name = 'Egasining ismini kiriting'
  if (!values.owner_phone.trim()) errors.owner_phone = 'Telefon raqamini kiriting'
  else if (!normalizePhone(values.owner_phone)) errors.owner_phone = fieldMessage('owner_phone', 'invalid')
  const password = values.owner_password.trim()
  if (password && password.length < PASSWORD_MIN) errors.owner_password = fieldMessage('owner_password', 'min_length')
  if (Number(values.min_order || '0') > MAX_MIN_ORDER) errors.min_order = 'Juda katta qiymat'
  return errors
}

export function BusinessCreatePage() {
  const navigate = useNavigate()
  const toast = useToast()
  const create = useCreateBusiness()
  const businesses = useBusinesses()
  const domain = platformDomain(businesses.data?.results, businesses.data?.domain)

  const [values, setValues] = useState(INITIAL)
  const [slugEdited, setSlugEdited] = useState(false)
  const [logo, setLogo] = useState<File | null>(null)
  const [point, setPoint] = useState<Point | null>(null)
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const formErrorRef = useRef<HTMLDivElement>(null)
  const created = useRef(false)
  const slugState = useSlugAvailability(values.slug)

  const dirty =
    logo !== null || point !== null || (Object.keys(INITIAL) as (keyof Values)[]).some((key) => values[key] !== INITIAL[key])
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !created.current && currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    if (!dirty) return undefined
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const clearError = (field: FieldName) =>
    setErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })

  const set = (field: keyof Values) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
    clearError(field)
  }

  const setName = (name: string) => {
    setValues((current) => ({ ...current, name, slug: slugEdited ? current.slug : slugify(name) }))
    clearError('name')
    if (!slugEdited) clearError('slug')
  }

  const setSlug = (raw: string) => {
    const slug = normalizeSlugInput(raw)
    // Clearing the field by hand hands the address back to the name.
    setSlugEdited(slug !== '')
    setValues((current) => ({ ...current, slug }))
    clearError('slug')
  }

  const slugFromName = () => {
    setSlugEdited(false)
    setValues((current) => ({ ...current, slug: slugify(current.name) }))
    clearError('slug')
  }

  const focusFirst = (found: Errors) => {
    const first = FIELDS.find((field) => found[field])
    if (first) document.getElementById(fieldId(first))?.focus()
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (create.isPending) return
    const slug = values.slug.replace(/^-+|-+$/g, '')
    const ready = { ...values, slug }
    const found = validate(ready, slugState, point)
    setValues(ready)
    setErrors(found)
    setFormError(null)
    if (Object.keys(found).length > 0 || !point) {
      focusFirst(found)
      return
    }

    try {
      const { business, credentials } = await create.mutateAsync({
        input: {
          name: ready.name.trim(),
          slug,
          tagline: ready.tagline.trim(),
          address: ready.address.trim(),
          lat: point.lat,
          lng: point.lng,
          support_phone: ready.support_phone.trim(),
          delivery_time: ready.delivery_time.trim(),
          min_order: Number(ready.min_order || '0'),
          brand_color: ready.brand_color,
          owner_name: ready.owner_name.trim(),
          owner_phone: normalizePhone(ready.owner_phone) ?? ready.owner_phone.trim(),
          owner_password: ready.owner_password.trim(),
        },
        logo,
      })
      created.current = true
      toast.success(`${business.name} ochildi`, { description: 'Endi botlarni ulang.' })
      // The credentials travel in the history state: shown once on the business page, gone after a reload.
      navigate(businessPath(business.slug), { state: { credentials } })
    } catch (error) {
      const fields = fieldErrors(error) as Errors & { lat?: string; lng?: string }
      // The point is one control here: a missing coordinate means "put the business on the map".
      if (fields.lat || fields.lng) {
        fields.location = NO_LOCATION
        delete fields.lat
        delete fields.lng
      }
      const known = Object.fromEntries(Object.entries(fields).filter(([field]) => FIELDS.includes(field as FieldName)))
      if (Object.keys(known).length > 0) {
        setErrors(known)
        focusFirst(known)
      }
      if (Object.keys(known).length === 0 || Object.keys(known).length < Object.keys(fields).length) {
        setFormError(Object.keys(fields).length > 0 ? Object.values(fields).join('. ') : errorMessage(error))
        requestAnimationFrame(() => formErrorRef.current?.focus())
      }
    }
  }

  const minOrder = Number(values.min_order || '0')

  return (
    <div className="animate-enter">
      <title>Yangi biznes · DeliveryHub</title>
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold text-slate-500 transition hover:text-slate-900"
      >
        <ArrowLeftIcon size={16} />
        Bizneslar
      </Link>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Yangi biznes</h1>
      <p className="mt-1 max-w-2xl text-slate-500">
        Do'kon, Mini App va admin panel darhol tayyor bo'ladi; botlar keyingi sahifada ikki bosishda yaratiladi.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:gap-8">
        <form noValidate onSubmit={submit} aria-label="Yangi biznes" className="min-w-0 space-y-5">
          {formError && (
            <div
              ref={formErrorRef}
              tabIndex={-1}
              role="alert"
              className="flex items-start gap-2.5 rounded-2xl bg-red-50 px-4 py-3 font-semibold text-red-700 ring-1 ring-red-200 focus:outline-hidden"
            >
              <ErrorCircleIcon size={20} className="mt-0.5 shrink-0" />
              {formError}
            </div>
          )}

          <Card
            title="Biznes"
            titleId="new-section-business"
            description="Nomi va manzili — mijozlar do'konni shu manzilda ochadi."
            icon={<StoreIcon size={18} />}
          >
            <div className="grid gap-4">
              <Field id={fieldId('name')} label="Nomi" error={errors.name}>
                {(control) => (
                  <input
                    {...control}
                    value={values.name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={120}
                    placeholder="Burger House"
                    autoComplete="off"
                    className={inputClass(Boolean(errors.name))}
                  />
                )}
              </Field>

              <SlugField
                value={values.slug}
                domain={domain}
                state={slugState}
                error={errors.slug}
                onChange={setSlug}
                onBlur={() => setValues((current) => ({ ...current, slug: current.slug.replace(/^-+|-+$/g, '') }))}
                canReset={slugEdited && values.name.trim() !== '' && values.slug !== slugify(values.name)}
                onReset={slugFromName}
              />

              <Field id={fieldId('tagline')} label="Qisqa shior" optional error={errors.tagline}>
                {(control) => (
                  <input
                    {...control}
                    value={values.tagline}
                    onChange={(event) => set('tagline')(event.target.value)}
                    maxLength={200}
                    placeholder="Eng mazali burgerlar 30 daqiqada"
                    className={inputClass(Boolean(errors.tagline))}
                  />
                )}
              </Field>
            </div>
          </Card>

          <Card
            title="Joylashuv"
            titleId="new-section-location"
            description="Mijozlar buyurtmani shu yerdan olib ketadi; yetkazishda ham xarita shu atrofdan ochiladi."
            icon={<MapPinIcon size={18} />}
          >
            <LocationPicker
              id={fieldId('location')}
              addressId={fieldId('address')}
              point={point}
              address={values.address}
              onPointChange={(next) => {
                setPoint(next)
                clearError('location')
              }}
              onAddressChange={set('address')}
              locationError={errors.location}
              addressError={errors.address}
            />
          </Card>

          <Card
            title="Do'kon sozlamalari"
            titleId="new-section-shop"
            description="Do'kon sahifasida va buyurtma berishda ko'rinadi."
            icon={<ClockIcon size={18} />}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id={fieldId('support_phone')}
                label="Aloqa telefoni"
                optional
                error={errors.support_phone}
                className="sm:col-span-2"
              >
                {(control) => (
                  <input
                    {...control}
                    type="tel"
                    inputMode="tel"
                    value={values.support_phone}
                    onChange={(event) => set('support_phone')(event.target.value)}
                    onBlur={() => set('support_phone')(formatPhone(values.support_phone.trim()))}
                    maxLength={30}
                    placeholder="+998 71 200 00 00"
                    className={inputClass(Boolean(errors.support_phone))}
                  />
                )}
              </Field>
              <Field id={fieldId('delivery_time')} label="Yetkazish vaqti (daqiqa)" error={errors.delivery_time}>
                {(control) => (
                  <input
                    {...control}
                    value={values.delivery_time}
                    onChange={(event) => set('delivery_time')(event.target.value)}
                    maxLength={20}
                    placeholder="30–45"
                    className={inputClass(Boolean(errors.delivery_time))}
                  />
                )}
              </Field>
              <Field id={fieldId('min_order')} label="Minimal buyurtma (so'm)" error={errors.min_order}>
                {(control) => (
                  <MoneyInput
                    {...control}
                    value={values.min_order}
                    onValueChange={set('min_order')}
                    invalid={Boolean(errors.min_order)}
                    placeholder="0"
                  />
                )}
              </Field>
            </div>
          </Card>

          <Card
            title="Brend"
            titleId="new-section-brand"
            description="Do'kon, Mini App va admin panel shu rang va logo bilan ochiladi."
            icon={<PaletteIcon size={18} />}
          >
            <div className="grid gap-5">
              <ColorField
                id={fieldId('brand_color')}
                value={values.brand_color}
                onChange={set('brand_color')}
                error={errors.brand_color}
              />
              <LogoField
                id={fieldId('logo')}
                file={logo}
                onChange={(file) => {
                  setLogo(file)
                  clearError('logo')
                }}
                name={values.name}
                color={values.brand_color}
                optional
                error={errors.logo}
              />
            </div>
          </Card>

          <Card
            title="Egasi — admin panelga kirish"
            titleId="new-section-owner"
            description="Biznes egasi admin panelga shu telefon va parol bilan kiradi."
            icon={<UserIcon size={18} />}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id={fieldId('owner_name')} label="Ismi" error={errors.owner_name}>
                {(control) => (
                  <input
                    {...control}
                    value={values.owner_name}
                    onChange={(event) => set('owner_name')(event.target.value)}
                    maxLength={120}
                    placeholder="Aziz"
                    autoComplete="off"
                    className={inputClass(Boolean(errors.owner_name))}
                  />
                )}
              </Field>
              <Field id={fieldId('owner_phone')} label="Telefoni (login)" error={errors.owner_phone}>
                {(control) => (
                  <input
                    {...control}
                    type="tel"
                    inputMode="tel"
                    value={values.owner_phone}
                    onChange={(event) => set('owner_phone')(event.target.value)}
                    onBlur={() => set('owner_phone')(formatPhone(values.owner_phone.trim()))}
                    placeholder="+998 90 123 45 67"
                    autoComplete="off"
                    className={inputClass(Boolean(errors.owner_phone))}
                  />
                )}
              </Field>
              <Field
                id={fieldId('owner_password')}
                label="Parol"
                optional="bo'sh qoldirsangiz, yaratib beriladi"
                hint="Kamida 8 belgi. Parol yaratilgandan keyin bir marta ko'rsatiladi."
                error={errors.owner_password}
                className="sm:col-span-2"
              >
                {(control) => (
                  <input
                    {...control}
                    value={values.owner_password}
                    onChange={(event) => set('owner_password')(event.target.value)}
                    maxLength={128}
                    autoComplete="off"
                    spellCheck={false}
                    className={inputClass(Boolean(errors.owner_password), 'h-11 font-mono text-[15px]')}
                  />
                )}
              </Field>
            </div>
          </Card>

          <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-end gap-3 border-t border-slate-200/80 bg-white/85 px-4 py-3 backdrop-blur-lg sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
            <Link to="/" className={buttonClass({ variant: 'ghost', size: 'lg' })}>
              Bekor qilish
            </Link>
            <Button type="submit" size="lg" loading={create.isPending}>
              {create.isPending ? 'Yaratilmoqda…' : 'Biznesni ochish'}
            </Button>
          </div>
        </form>

        <aside aria-label="Oldindan ko'rish" className="hidden lg:block">
          <div className="sticky top-24 space-y-5">
            <Preview values={values} logo={logo} domain={domain} minOrder={minOrder} />
            <NextSteps />
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        title="Sahifadan chiqilsinmi?"
        description="Kiritilgan ma'lumotlar saqlanmaydi."
        confirmLabel="Chiqish"
        cancelLabel="Qolish"
        tone="danger"
        onConfirm={() => blocker.proceed?.()}
      />
    </div>
  )
}

interface SlugFieldProps {
  value: string
  domain: string
  state: SlugState
  error?: string
  onChange: (value: string) => void
  onBlur: () => void
  canReset: boolean
  onReset: () => void
}

function SlugField({ value, domain, state, error, onChange, onBlur, canReset, onReset }: SlugFieldProps) {
  const id = fieldId('slug')
  const invalid = Boolean(error) || state.startsWith('slug_')

  return (
    <div>
      <div className="flex items-end justify-between gap-2">
        <label htmlFor={id} className="block text-sm font-semibold text-slate-700">
          Manzil (subdomen)
        </label>
        {canReset && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 rounded-md text-xs font-bold text-indigo-600 hover:text-indigo-800"
          >
            <RefreshIcon size={13} />
            Nomdan olish
          </button>
        )}
      </div>
      <div
        className={cx(
          'mt-1.5 flex h-11 overflow-hidden rounded-xl bg-white shadow-[0_1px_2px_rgb(15_23_42/0.04)] ring-1 ring-inset transition focus-within:ring-2',
          invalid ? 'ring-red-300 focus-within:ring-red-500' : 'ring-slate-300/90 focus-within:ring-indigo-500',
        )}
      >
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          maxLength={30}
          placeholder="burger-house"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={invalid || undefined}
          aria-describedby={`${id}-status`}
          className="min-w-0 flex-1 bg-transparent px-3.5 font-mono text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-hidden"
        />
        <span className="hidden max-w-[45%] items-center truncate border-l border-slate-200 bg-slate-50 px-3 font-mono text-sm text-slate-500 sm:flex">
          .{domain}
        </span>
      </div>
      <div id={`${id}-status`} aria-live="polite" aria-atomic="true">
        <SlugStatus state={state} error={error} />
      </div>
      {value && (
        <div className="mt-2.5 flex flex-wrap gap-2 text-xs">
          <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-lg bg-slate-100 px-2.5 py-1.5 font-mono text-slate-700">
            <StoreIcon size={14} className="shrink-0 text-slate-500" />
            {value}.{domain}
          </span>
          <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-lg bg-slate-100 px-2.5 py-1.5 font-mono text-slate-700">
            <DashboardIcon size={14} className="shrink-0 text-slate-500" />
            {value}-admin.{domain}
          </span>
        </div>
      )}
    </div>
  )
}

function StatusLine({ className, icon, children }: { className: string; icon: ReactNode; children: ReactNode }) {
  return (
    <p className={cx('mt-1.5 flex items-center gap-1.5 text-[13px] font-semibold', className)}>
      {icon}
      {children}
    </p>
  )
}

function SlugStatus({ state, error }: { state: SlugState; error?: string }) {
  if (error) return <FieldError>{error}</FieldError>
  switch (state) {
    case 'idle':
      return (
        <p className="mt-1.5 text-xs text-slate-500">
          Nomdan avtomatik yaratiladi: kichik lotin harflari, raqamlar va chiziqcha.
        </p>
      )
    case 'short':
      return <p className="mt-1.5 text-xs text-slate-500">Kamida {SLUG_MIN} belgi.</p>
    case 'checking':
      return (
        <StatusLine className="text-slate-500" icon={<Spinner size={14} />}>
          Tekshirilmoqda…
        </StatusLine>
      )
    case 'available':
      return (
        <StatusLine className="text-emerald-600" icon={<CheckCircleIcon size={15} />}>
          Manzil bo'sh
        </StatusLine>
      )
    case 'unknown':
      return (
        <StatusLine className="text-amber-700" icon={<InfoIcon size={15} />}>
          Manzilni tekshirib bo'lmadi — saqlashda tekshiriladi.
        </StatusLine>
      )
    default:
      return <FieldError>{fieldMessage('slug', state)}</FieldError>
  }
}

function Preview({ values, logo, domain, minOrder }: { values: Values; logo: File | null; domain: string; minOrder: number }) {
  const logoUrl = useFilePreview(logo)

  const color = isHexColor(values.brand_color) ? values.brand_color : DEFAULT_BRAND_COLOR
  const slug = values.slug || 'manzil'
  const rows = [
    { icon: <StoreIcon size={15} />, label: "Do'kon", value: `${slug}.${domain}`, mono: true },
    { icon: <DashboardIcon size={15} />, label: 'Admin panel', value: `${slug}-admin.${domain}`, mono: true },
    { icon: <MapPinIcon size={15} />, label: 'Manzil', value: values.address.trim() || '—' },
    { icon: <ClockIcon size={15} />, label: 'Yetkazish', value: values.delivery_time ? `${values.delivery_time} daqiqa` : '—' },
    { icon: <WalletIcon size={15} />, label: 'Min. buyurtma', value: minOrder ? formatPrice(minOrder) : "yo'q" },
    { icon: <PhoneIcon size={15} />, label: 'Aloqa', value: values.support_phone || '—' },
  ]

  return (
    <div className={cx(cardClass, 'overflow-hidden')}>
      <div
        className="h-20 transition-colors duration-300"
        style={{ backgroundColor: color, backgroundImage: 'linear-gradient(135deg, rgb(255 255 255 / 0.25), rgb(0 0 0 / 0.15))' }}
      />
      <div className="px-5 pb-5">
        <div className="-mt-8 flex items-end gap-3">
          <div className="rounded-[1.15rem] bg-white p-1 shadow-sm">
            <Avatar name={values.name || 'Biznes'} logo={logoUrl} color={color} size="lg" />
          </div>
        </div>
        <p className="mt-3 truncate text-lg font-extrabold tracking-tight">{values.name || 'Biznes nomi'}</p>
        <p className="truncate text-sm text-slate-500">{values.tagline || 'Qisqa shior'}</p>
        <dl className="mt-4 space-y-2.5 border-t border-slate-100 pt-4 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center gap-2.5">
              <dt className="flex shrink-0 items-center gap-2 text-slate-500">
                <span className="text-slate-400">{row.icon}</span>
                {row.label}
              </dt>
              <dd className={cx('ml-auto min-w-0 truncate font-semibold text-slate-800', row.mono && 'font-mono text-[13px]')}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

function NextSteps() {
  const steps = [
    { icon: <SparklesIcon size={16} />, text: "Do'kon, Mini App va admin panel darhol ishga tushadi" },
    { icon: <KeyIcon size={16} />, text: "Egasining kirish ma'lumotlari bir marta ko'rsatiladi" },
    { icon: <CheckCircleIcon size={16} />, text: 'Botlar keyingi sahifada ikki bosishda yaratiladi' },
  ]
  return (
    <div className="rounded-2xl bg-linear-to-br from-indigo-50 to-violet-50 p-5 ring-1 ring-indigo-100">
      <p className="text-sm font-extrabold text-indigo-950">Keyin nima bo'ladi</p>
      <ol className="mt-3 space-y-3">
        {steps.map((step, index) => (
          <li key={step.text} className="flex items-start gap-3 text-sm text-slate-700">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white text-indigo-600 ring-1 ring-indigo-100">
              {step.icon}
            </span>
            <span className="pt-1">
              <span className="sr-only">{index + 1}. </span>
              {step.text}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

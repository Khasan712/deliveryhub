import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { isApiError } from '../../api/client'
import { errorMessage, mapFieldErrors } from '../../api/errors'
import { useCategories, useCreateUnit, useProduct, useSaveCategory, useSaveProduct, useUnits } from '../../api/queries'
import type { NamePair } from '../../api/types'
import { NotFound } from '../../auth/SystemScreens'
import { FrozenBadge } from '../../components/badges'
import { NamePairModal } from '../../components/NamePairModal'
import { useToast } from '../../components/feedback/feedback'
import { IconPlus, IconSnowflake } from '../../components/icons'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { Field, Input, Select, Textarea } from '../../components/ui/Form'
import { PageHeader } from '../../components/ui/PageHeader'
import { Skeleton } from '../../components/ui/Skeleton'
import { ErrorState } from '../../components/ui/States'
import { Switch } from '../../components/ui/Switch'
import { useI18n } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { formatDateTime, formatFullDateTime } from '../../lib/format'
import { useUnsavedChanges } from '../../lib/useUnsavedChanges'
import { ImagePicker } from './ImagePicker'
import {
  EMPTY_PRODUCT_FORM,
  formatPriceInput,
  productRequestBody,
  productToForm,
  validateProductForm,
  type ProductFormErrors,
  type ProductFormState,
} from './productForm'

export function ProductFormPage() {
  const { id } = useParams()
  const editing = id !== undefined
  const { t, name, lang } = useI18n()
  const toast = useToast()
  const navigate = useNavigate()
  const product = useProduct(id)
  const categories = useCategories()
  const units = useUnits()
  const save = useSaveProduct(id)
  const createUnit = useCreateUnit()
  const saveCategory = useSaveCategory()

  const [form, setForm] = useState<ProductFormState>(EMPTY_PRODUCT_FORM)
  const [initial, setInitial] = useState<ProductFormState>(EMPTY_PRODUCT_FORM)
  const [file, setFile] = useState<File | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [errors, setErrors] = useState<ProductFormErrors>({})
  const [quickAdd, setQuickAdd] = useState<'unit' | 'category' | null>(null)
  const loaded = useRef(false)

  // Fill the form once — a background refetch must not overwrite what the user is typing.
  useEffect(() => {
    if (!product.data || loaded.current) return
    loaded.current = true
    const values = productToForm(product.data)
    setForm(values)
    setInitial(values)
  }, [product.data])

  const dirty =
    !!file || removeImage || (Object.keys(form) as Array<keyof ProductFormState>).some((key) => form[key] !== initial[key])
  const allowLeave = useUnsavedChanges(dirty)

  if (editing && isApiError(product.error) && product.error.status === 404) return <NotFound />

  const set = <K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }))
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found = validateProductForm(form, t)
    setErrors(found)
    const first = (['name_uz', 'name_ru', 'price'] as const).find((key) => found[key])
    if (first) {
      document.getElementById(`product-${first}`)?.focus()
      return
    }
    save.mutate(productRequestBody(form, file, removeImage), {
      onSuccess: () => {
        allowLeave()
        toast.success(editing ? t('product_saved') : t('product_created'))
        navigate('/products')
      },
      onError: (error) => {
        const mapped = mapFieldErrors(error, t) as ProductFormErrors
        setErrors(mapped)
        if (!Object.keys(mapped).length) toast.error(errorMessage(error, t))
      },
    })
  }

  const back = { to: '/products', label: t('back_to_products') }
  const title = editing ? t('edit_product') : t('add_product')
  // Since when the saved product is frozen (shown while the toggle stays on).
  const frozenAt = form.frozen && product.data?.frozen ? product.data.frozen_at : null

  if (editing && !product.data) {
    return (
      <>
        <PageHeader back={back} title={title} />
        {product.error ? (
          <Card>
            <ErrorState error={product.error} onRetry={() => void product.refetch()} />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3" aria-busy="true">
            <Skeleton className="h-96 rounded-2xl lg:col-span-2" />
            <Skeleton className="aspect-square rounded-2xl" />
          </div>
        )}
      </>
    )
  }

  const quickAddButton = (kind: 'unit' | 'category') => (
    <button
      type="button"
      onClick={() => setQuickAdd(kind)}
      className="inline-flex items-center gap-1 rounded-md text-xs font-semibold text-primary-600 hover:underline dark:text-primary-400"
    >
      <IconPlus size={14} />
      {kind === 'unit' ? t('quick_add_unit') : t('quick_add_category')}
    </button>
  )

  return (
    <>
      <PageHeader
        back={back}
        title={title}
        meta={product.data?.frozen ? <FrozenBadge size="sm" /> : undefined}
        description={
          editing && product.data
            ? `${name(product.data)} · ${formatFullDateTime(product.data.created_at, lang)}`
            : t('products_subtitle')
        }
      />

      <form onSubmit={submit} noValidate>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader title={t('basic_info')} />
              <div className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-2">
                <Field id="product-name_uz" label={t('name_uz')} error={errors.name_uz} required>
                  {(props) => (
                    <Input
                      {...props}
                      value={form.name_uz}
                      onChange={(event) => set('name_uz', event.target.value)}
                      maxLength={255}
                      autoComplete="off"
                    />
                  )}
                </Field>
                <Field id="product-name_ru" label={t('name_ru')} error={errors.name_ru} required>
                  {(props) => (
                    <Input
                      {...props}
                      value={form.name_ru}
                      onChange={(event) => set('name_ru', event.target.value)}
                      maxLength={255}
                      autoComplete="off"
                    />
                  )}
                </Field>
                <Field id="product-price" label={t('price')} error={errors.price} required>
                  {(props) => (
                    <Input
                      {...props}
                      inputMode="numeric"
                      placeholder={t('price_placeholder')}
                      value={form.price}
                      onChange={(event) => set('price', formatPriceInput(event.target.value))}
                      className="font-semibold tabular"
                      trailing={<span className="pr-2 text-[13px] font-medium text-muted">{t('currency')}</span>}
                    />
                  )}
                </Field>
                <div className="hidden sm:block" aria-hidden="true" />
                <Field
                  id="product-category_id"
                  label={t('category')}
                  error={errors.category_id}
                  labelAction={quickAddButton('category')}
                >
                  {(props) => (
                    <Select {...props} value={form.category_id} onChange={(event) => set('category_id', event.target.value)}>
                      <option value="">{t('no_category')}</option>
                      {categories.data?.map((category) => (
                        <option key={category.id} value={String(category.id)}>
                          {name(category)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field id="product-unit_id" label={t('measure')} error={errors.unit_id} labelAction={quickAddButton('unit')}>
                  {(props) => (
                    <Select {...props} value={form.unit_id} onChange={(event) => set('unit_id', event.target.value)}>
                      <option value="">{t('no_unit')}</option>
                      {units.data?.map((unit) => (
                        <option key={unit.id} value={String(unit.id)}>
                          {name(unit)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <div
                  className={cn(
                    'flex items-center justify-between gap-4 rounded-2xl border p-4 transition-colors sm:col-span-2',
                    form.frozen ? 'border-sky-200 bg-sky-50/70 dark:border-sky-500/25 dark:bg-sky-500/10' : 'border-line',
                  )}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors',
                        form.frozen ? 'bg-sky-500 text-white shadow-sm shadow-sky-500/30' : 'bg-subtle text-faint',
                      )}
                    >
                      <IconSnowflake size={18} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-fg">{t('frozen_field')}</p>
                      <p id="product-frozen-hint" className="mt-0.5 text-[13px] leading-relaxed text-muted">
                        {t('frozen_field_hint')}
                      </p>
                      {frozenAt && (
                        <p className="mt-1.5 text-xs font-medium text-sky-700 dark:text-sky-300">
                          {t('frozen_since', { date: formatDateTime(frozenAt, lang) })}
                        </p>
                      )}
                    </div>
                  </div>
                  <Switch
                    checked={form.frozen}
                    onChange={(value) => set('frozen', value)}
                    label={t('frozen_field')}
                    aria-describedby="product-frozen-hint"
                  />
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title={t('description')} />
              <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-2">
                <Field id="product-desc_uz" label={t('description_uz')} error={errors.desc_uz}>
                  {(props) => (
                    <Textarea {...props} rows={5} value={form.desc_uz} onChange={(event) => set('desc_uz', event.target.value)} />
                  )}
                </Field>
                <Field id="product-desc_ru" label={t('description_ru')} error={errors.desc_ru}>
                  {(props) => (
                    <Textarea {...props} rows={5} value={form.desc_ru} onChange={(event) => set('desc_ru', event.target.value)} />
                  )}
                </Field>
              </div>
            </Card>
          </div>

          <Card className="self-start lg:sticky lg:top-24">
            <CardHeader title={t('product_image')} />
            <div className="p-5">
              <ImagePicker
                currentUrl={product.data?.image ?? null}
                file={file}
                removed={removeImage}
                onFile={setFile}
                onRemove={setRemoveImage}
                error={errors.image}
                onError={(message) => setErrors((current) => ({ ...current, image: message ?? undefined }))}
                disabled={save.isPending}
              />
            </div>
          </Card>
        </div>

        <div className="sticky bottom-0 z-20 -mx-4 mt-6 border-t border-line bg-app/85 px-4 py-3 backdrop-blur-lg sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-2xl lg:border lg:bg-card/90 lg:px-5">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <ButtonLink to="/products" variant="secondary">
              {t('cancel')}
            </ButtonLink>
            <Button type="submit" loading={save.isPending} disabled={editing && !dirty}>
              {editing ? t('save_changes') : t('create_product')}
            </Button>
          </div>
        </div>
      </form>

      <NamePairModal
        open={quickAdd !== null}
        onClose={() => setQuickAdd(null)}
        title={quickAdd === 'unit' ? t('quick_add_unit') : t('quick_add_category')}
        description={quickAdd === 'unit' ? t('units_example') : undefined}
        submitLabel={t('create')}
        onSubmit={async (values: NamePair) => {
          if (quickAdd === 'unit') {
            const unit = await createUnit.mutateAsync(values)
            set('unit_id', String(unit.id))
            toast.success(t('unit_created'))
          } else {
            const category = await saveCategory.mutateAsync({ body: values })
            set('category_id', String(category.id))
            toast.success(t('category_created'))
          }
        }}
      />
    </>
  )
}

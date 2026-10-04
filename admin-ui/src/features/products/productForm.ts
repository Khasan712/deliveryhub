import type { Product } from '../../api/types'
import type { DictKey } from '../../i18n/dict'
import { formatNumber, parseAmount } from '../../lib/format'

export interface ProductFormState {
  name_uz: string
  name_ru: string
  price: string
  desc_uz: string
  desc_ru: string
  unit_id: string
  category_id: string
  /** Not available right now: customers cannot order it, staff still sell it at the point of sale. */
  frozen: boolean
}

export type ProductFormErrors = Partial<Record<keyof ProductFormState | 'image', string>>

export const EMPTY_PRODUCT_FORM: ProductFormState = {
  name_uz: '',
  name_ru: '',
  price: '',
  desc_uz: '',
  desc_ru: '',
  unit_id: '',
  category_id: '',
  frozen: false,
}

export const MAX_PRICE = 1_000_000_000

export function productToForm(product: Product): ProductFormState {
  return {
    name_uz: product.name_uz ?? '',
    name_ru: product.name_ru ?? '',
    price: formatNumber(product.price).replace(/ /g, ' '),
    desc_uz: product.desc_uz ?? '',
    desc_ru: product.desc_ru ?? '',
    unit_id: product.unit ? String(product.unit.id) : '',
    category_id: product.category ? String(product.category.id) : '',
    frozen: product.frozen === true,
  }
}

/** Price as the user types: digits only, grouped by thousands («35000» → «35 000»). */
export function formatPriceInput(value: string): string {
  const digits = value.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

/** Client-side checks before the request (the server validates again). */
export function validateProductForm(form: ProductFormState, t: (key: DictKey) => string): ProductFormErrors {
  const errors: ProductFormErrors = {}
  if (!form.name_uz.trim()) errors.name_uz = t('field_required')
  if (!form.name_ru.trim()) errors.name_ru = t('field_required')
  const price = parseAmount(form.price)
  if (!form.price.trim()) errors.price = t('field_required')
  else if (price === null || price < 0) errors.price = t('field_price_invalid')
  else if (price > MAX_PRICE) errors.price = t('field_max_value')
  return errors
}

/** JSON body, or multipart when a new image file is attached. `image: null` removes the current image. */
export function productRequestBody(
  form: ProductFormState,
  file: File | null,
  removeImage: boolean,
): Record<string, unknown> | FormData {
  const fields = {
    name_uz: form.name_uz.trim(),
    name_ru: form.name_ru.trim(),
    price: parseAmount(form.price) ?? 0,
    desc_uz: form.desc_uz.trim(),
    desc_ru: form.desc_ru.trim(),
    unit_id: form.unit_id ? Number(form.unit_id) : null,
    category_id: form.category_id ? Number(form.category_id) : null,
    frozen: form.frozen,
  }
  if (file) {
    const body = new FormData()
    // In multipart an empty value means "no unit / category"; booleans travel as "true" / "false".
    for (const [key, value] of Object.entries(fields)) body.append(key, value === null ? '' : String(value))
    body.append('image', file)
    return body
  }
  return removeImage ? { ...fields, image: null } : fields
}

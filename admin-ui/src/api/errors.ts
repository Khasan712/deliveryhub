import type { DictKey } from '../i18n/dict'
import type { Vars } from '../i18n/translate'
import { ApiError } from './client'

type T = (key: DictKey, vars?: Vars) => string

/** A human message for any request error (toasts, error states). */
export function errorMessage(error: unknown, t: T, overrides: Partial<Record<string, DictKey>> = {}): string {
  if (!(error instanceof ApiError)) return t('error_generic')
  const override = overrides[error.code]
  if (override) return t(override)
  switch (error.code) {
    case 'network':
      return t('error_network')
    case 'csrf_failed':
      return t('error_csrf')
    case 'forbidden':
      return t('error_forbidden')
    case 'not_found':
      return t('error_not_found')
    case 'validation':
      return t('error_validation')
    case 'business_suspended':
      return t('error_suspended')
    case 'unknown_host':
      return t('error_unknown_host')
    case 'cannot_delete_self':
      return t('cannot_delete_self')
    case 'cannot_change_self':
      return t('self_locked')
    case 'bot_missing':
      return t('tg_bot_missing')
    case 'product_not_found':
      return t('products_missing')
    case 'branches_disabled':
      return t('error_branches_disabled')
    case 'branch_in_use':
      return t('branch_in_use_text')
    case 'too_many_requests':
    case 'too_soon': {
      const seconds = error.retryAfter
      return seconds ? t('error_rate_limited', { seconds }) : t('error_rate_limited_short')
    }
  }
  if (error.status === 403) return t('error_forbidden')
  if (error.status === 404) return t('error_not_found')
  if (error.status === 429) return t('error_rate_limited_short')
  if (error.status >= 500) return t('error_server')
  return t('error_generic')
}

const FIELD_CODES: Record<string, DictKey> = {
  required: 'field_required',
  blank: 'field_required',
  null: 'field_required',
  invalid: 'field_invalid',
  invalid_phone: 'field_invalid_phone',
  max_length: 'field_max_length',
  min_length: 'field_min_length',
  min_value: 'field_min_value',
  max_value: 'field_max_value',
  unique: 'field_unique',
  does_not_exist: 'field_does_not_exist',
  invalid_image: 'field_image_type',
  inactive: 'field_branch_inactive',
  branches_disabled: 'error_branches_disabled',
}

/** Field error codes from the API (`required`, `unique`, …) → localized text. */
export function fieldErrorMessage(code: string, t: T): string {
  const key = FIELD_CODES[code]
  return key ? t(key) : t('field_invalid')
}

/** `{"phone": ["required"]}` → `{"phone": "Majburiy maydon"}`, renaming API fields to form fields when needed. */
export function mapFieldErrors(
  error: unknown,
  t: T,
  rename: Record<string, string> = {},
): Record<string, string> {
  if (!(error instanceof ApiError) || error.code !== 'validation') return {}
  const result: Record<string, string> = {}
  for (const [field, codes] of Object.entries(error.fields)) {
    const name = rename[field] ?? field
    if (codes.length) result[name] = fieldErrorMessage(codes[0], t)
  }
  return result
}

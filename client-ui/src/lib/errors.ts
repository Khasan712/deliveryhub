import { isApiError } from '../api/client'
import type { MessageKey } from '../i18n/messages'

const ERROR_MESSAGES: Record<string, MessageKey> = {
  network: 'errNetwork',
  invalid_phone: 'invalidPhone',
  invalid_code: 'errInvalidCode',
  code_expired: 'errCodeExpired',
  too_many_attempts: 'errTooManyAttempts',
  too_many_requests: 'errTooMany',
  too_soon: 'errTooSoon',
  sms_failed: 'errSms',
  telegram_unavailable: 'errTelegram',
  invalid_init_data: 'errTelegramAuth',
  product_not_found: 'productGone',
  business_suspended: 'shopSuspended',
}

/** The dictionary key of a friendly message for an API / network error. */
export function errorMessageKey(error: unknown): MessageKey {
  return (isApiError(error) && ERROR_MESSAGES[error.code]) || 'errGeneric'
}

/** Field error codes of `{"error": "validation", "fields": {...}}` → dictionary keys. */
export function fieldErrorKey(field: string, codes: string[] | string | undefined): MessageKey {
  const code = Array.isArray(codes) ? codes[0] : codes
  // A pickup from a business with 2+ branches: none chosen, or one that no longer takes orders.
  if (field === 'branch_id') {
    return code === undefined || code === 'required' || code === 'blank' || code === 'null' ? 'branchRequired' : 'branchUnavailable'
  }
  if (code === 'required' || code === 'blank' || code === 'null') return 'required'
  if (code === 'max_length') return 'tooLong'
  if (field === 'phone') return 'invalidPhone'
  if (field === 'address' && (code === 'invalid' || code === undefined)) return 'addressOrLocation'
  return 'invalidValue'
}

import { ApiError } from '../api/client'

/** API error codes → what we tell the user. */
const MESSAGES: Record<string, string> = {
  network: "Server bilan aloqa yo'q. Internetni tekshirib, qayta urinib ko'ring.",
  server_error: "Serverda xatolik yuz berdi. Birozdan so'ng qayta urinib ko'ring.",
  bad_response: "Server kutilmagan javob qaytardi. Birozdan so'ng qayta urinib ko'ring.",
  invalid_credentials: "Telefon yoki parol noto'g'ri",
  auth_required: 'Sessiya tugadi — qayta kiring.',
  forbidden: "Bu amal uchun ruxsat yo'q.",
  csrf_failed: "Xavfsizlik tekshiruvidan o'tmadi. Sahifani yangilab, qayta urinib ko'ring.",
  not_found: 'Topilmadi.',
  method_not_allowed: "Bu amal qo'llab-quvvatlanmaydi.",
  too_many_requests: "Juda ko'p urinish. Birozdan so'ng qayta urinib ko'ring.",
  validation: "Ma'lumotlarni tekshiring.",
  slug_invalid: 'Manzil 3–30 belgi: kichik lotin harflari, raqamlar va chiziqcha (masalan, burger-house).',
  slug_reserved: 'Bu manzil band qilingan, boshqasini tanlang.',
  slug_taken: 'Bu manzil boshqa biznesda ishlatilgan.',
  invalid_token: "Token noto'g'ri yoki Telegram javob bermadi",
  bot_in_use: 'Bu bot boshqa biznesga ulangan',
  platform_bot_missing: "Havola yaratib bo'lmadi. Platforma boti tokenini tekshiring.",
  owner_missing: 'Egasining admin akkaunti topilmadi.',
  business_active: "Avval biznesni to'xtating — faqat to'xtatilgan biznes o'chiriladi.",
  confirmation_required: 'Tasdiqlash uchun biznes manzilini aynan yozing.',
  unknown_host: "Bu manzil platformada ro'yxatdan o'tmagan. Panel manzilini tekshiring.",
  geocoder_unavailable: "Manzil qidiruvi hozir ishlamayapti — joyni xaritada o'zingiz belgilang.",
}

const FIELD_CODES: Record<string, string> = {
  required: "To'ldirilishi shart",
  blank: "To'ldirilishi shart",
  null: "To'ldirilishi shart",
  invalid: "Noto'g'ri qiymat",
  max_length: 'Juda uzun',
  min_length: 'Juda qisqa',
  min_value: 'Juda kichik qiymat',
  max_value: 'Juda katta qiymat',
  unique: 'Bu qiymat band',
  does_not_exist: 'Topilmadi',
  invalid_image: "Rasm fayli noto'g'ri",
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const retryAfter = error.data.retry_after
    if (error.code === 'too_many_requests' && typeof retryAfter === 'number' && retryAfter > 0) {
      return `Juda ko'p urinish. ${Math.ceil(retryAfter)} soniyadan so'ng qayta urinib ko'ring.`
    }
    if (error.status >= 502 && error.status <= 504 && !(error.code in MESSAGES)) return MESSAGES.network ?? ''
    return MESSAGES[error.code] ?? `Kutilmagan xatolik (${error.status || error.code}). Qayta urinib ko'ring.`
  }
  return "Kutilmagan xatolik yuz berdi. Qayta urinib ko'ring."
}

/** The message for one field error code (`fields.owner_phone: ["invalid"]`). */
export function fieldMessage(field: string, code: string): string {
  if (code.startsWith('slug_') && MESSAGES[code]) return MESSAGES[code]
  if (code === 'invalid') {
    if (field.includes('phone')) return "Telefon raqami noto'g'ri"
    if (field === 'brand_color') return "Rang #RRGGBB ko'rinishida bo'lsin"
    if (field === 'logo') return "Rasm fayli noto'g'ri"
    if (field === 'min_order') return 'Butun son kiriting'
    if (field === 'token') return MESSAGES.invalid_token ?? ''
  }
  if (code === 'min_length' && field.includes('password')) return "Kamida 8 belgi (yoki bo'sh qoldiring)"
  return FIELD_CODES[code] ?? MESSAGES[code] ?? "Noto'g'ri qiymat"
}

/** The first message of every field of a `validation` error; `{}` for other errors. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {}
  const result: Record<string, string> = {}
  for (const [field, codes] of Object.entries(error.fields)) {
    const code = codes[0]
    if (code) result[field] = fieldMessage(field, code)
  }
  return result
}

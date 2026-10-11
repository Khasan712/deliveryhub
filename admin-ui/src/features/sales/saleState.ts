import type { CartItem, SaleForm, SaleStatus } from '../../api/types'
import { addOne, DEFAULT_SALE_FORM, setQty, statusFor } from './cart'
import type { VoiceEngine, VoiceUiPatch } from './voice/controller'
import type { ApplyOutcome, FormField, Snapshot } from './voiceResult'

export interface VoiceUi {
  state: 'idle' | 'starting' | 'listening' | 'processing' | 'done'
  engine: VoiceEngine
  caption: string
  transcript: string
  reply: string
  unmatched: string[]
  error: string
  seconds: number
  submit: boolean
  resultEngine: '' | 'gemini' | 'local'
}

export interface SaleState {
  items: CartItem[]
  form: SaleForm
  /** The head office: the branch the sale is for (`null` — later / the only one). */
  branch: number | null
  statusAuto: boolean
  /** Fields filled by the AI (badge) until the user edits them. */
  aiFields: Partial<Record<FormField, true>>
  undo: Snapshot | null
  voice: VoiceUi
}

export const INITIAL_VOICE: VoiceUi = {
  state: 'idle',
  engine: '',
  caption: '',
  transcript: '',
  reply: '',
  unmatched: [],
  error: '',
  seconds: 0,
  submit: false,
  resultEngine: '',
}

export const INITIAL_SALE: SaleState = {
  items: [],
  form: DEFAULT_SALE_FORM,
  branch: null,
  statusAuto: true,
  aiFields: {},
  undo: null,
  voice: INITIAL_VOICE,
}

type TextField = Exclude<FormField, 'delivery_type' | 'payment_method' | 'status'>

export type SaleAction =
  | { type: 'add'; productId: number }
  | { type: 'qty'; productId: number; quantity: number }
  | { type: 'text'; field: TextField; value: string }
  | { type: 'delivery'; value: SaleForm['delivery_type'] }
  | { type: 'payment'; value: SaleForm['payment_method'] }
  | { type: 'status'; value: SaleStatus }
  | { type: 'branch'; value: number | null }
  | { type: 'reset' }
  | { type: 'voice'; patch: VoiceUiPatch }
  | {
      type: 'apply'
      outcome: ApplyOutcome
      before: Snapshot
      reply: string
      transcript: string
      unmatched: string[]
      submit: boolean
      engine: 'gemini' | 'local'
    }
  | { type: 'undo' }

function touch(aiFields: SaleState['aiFields'], field: FormField): SaleState['aiFields'] {
  if (!aiFields[field]) return aiFields
  const next = { ...aiFields }
  delete next[field]
  return next
}

export function saleReducer(state: SaleState, action: SaleAction): SaleState {
  switch (action.type) {
    case 'add':
      return { ...state, items: addOne(state.items, action.productId) }
    case 'qty':
      return { ...state, items: setQty(state.items, action.productId, action.quantity) }
    case 'text':
      return {
        ...state,
        form: { ...state.form, [action.field]: action.value },
        aiFields: touch(state.aiFields, action.field),
      }
    case 'delivery': {
      // The status follows the delivery type until it is chosen explicitly.
      const form = { ...state.form, delivery_type: action.value }
      if (state.statusAuto) form.status = statusFor(action.value)
      return { ...state, form, aiFields: touch(state.aiFields, 'delivery_type') }
    }
    case 'payment':
      return {
        ...state,
        form: { ...state.form, payment_method: action.value },
        aiFields: touch(state.aiFields, 'payment_method'),
      }
    case 'status':
      return {
        ...state,
        form: { ...state.form, status: action.value },
        statusAuto: false,
        aiFields: touch(state.aiFields, 'status'),
      }
    case 'branch':
      return { ...state, branch: action.value }
    case 'reset':
      return {
        ...INITIAL_SALE,
        voice: {
          ...state.voice,
          state: 'idle',
          caption: '',
          transcript: '',
          reply: '',
          unmatched: [],
          error: '',
          submit: false,
        },
      }
    case 'voice':
      return { ...state, voice: { ...state.voice, ...action.patch } }
    case 'apply': {
      const { outcome } = action
      const aiFields = { ...state.aiFields }
      for (const field of outcome.changedFields) aiFields[field] = true
      return {
        ...state,
        items: outcome.next.items,
        form: outcome.next.form,
        statusAuto: outcome.next.statusAuto,
        aiFields,
        undo: action.before,
        voice: {
          ...state.voice,
          state: 'done',
          transcript: action.transcript,
          reply: action.reply,
          unmatched: action.unmatched,
          submit: action.submit && outcome.next.items.length > 0,
          resultEngine: action.engine,
          error: '',
        },
      }
    }
    case 'undo': {
      if (!state.undo) return state
      return {
        ...state,
        items: state.undo.items,
        form: state.undo.form,
        statusAuto: state.undo.statusAuto,
        aiFields: {},
        undo: null,
        voice: { ...state.voice, state: 'idle', reply: '', transcript: '', unmatched: [], submit: false },
      }
    }
  }
}

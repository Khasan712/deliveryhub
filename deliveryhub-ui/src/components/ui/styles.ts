import { cx } from '../../lib/cx'

// Class names shared by components that render different elements (button, link, input…).

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'soft' | 'dark' | 'danger' | 'danger-solid' | 'success'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'text-white bg-linear-to-br from-brand-600 to-brand-700 shadow-[0_1px_2px_rgb(15_23_42/0.12),0_6px_16px_-6px_rgb(234_88_12/0.5),inset_0_1px_0_rgb(255_255_255/0.2)] hover:brightness-110 active:brightness-95',
  secondary:
    'bg-white text-slate-700 ring-1 ring-inset ring-slate-300/80 shadow-[0_1px_2px_rgb(15_23_42/0.05)] hover:bg-slate-50 hover:text-slate-900',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
  dark: 'bg-slate-900 text-white shadow-[0_1px_2px_rgb(15_23_42/0.2)] hover:bg-slate-800',
  danger: 'bg-white text-red-600 ring-1 ring-inset ring-red-200 hover:bg-red-50 hover:ring-red-300',
  'danger-solid': 'bg-red-600 text-white shadow-[0_1px_2px_rgb(15_23_42/0.15)] hover:bg-red-700',
  success: 'bg-emerald-600 text-white shadow-[0_1px_2px_rgb(15_23_42/0.15)] hover:bg-emerald-700',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 rounded-lg px-3 text-[13px]',
  md: 'h-10 gap-2 rounded-xl px-4 text-sm',
  lg: 'h-12 gap-2 rounded-xl px-5 text-[15px]',
}

export function buttonClass({
  variant = 'primary',
  size = 'md',
  block = false,
}: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean } = {}) {
  return cx(
    'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-bold transition duration-150',
    'disabled:pointer-events-none disabled:opacity-55 aria-disabled:pointer-events-none aria-disabled:opacity-55',
    VARIANTS[variant],
    SIZES[size],
    block && 'w-full',
  )
}

/**
 * A text field. Height and font size come with `extra` (default `h-11 text-[15px]`) so callers never pass two
 * values for the same property — class order in the stylesheet, not in the attribute, would decide.
 */
export function inputClass(invalid = false, extra = 'h-11 text-[15px]') {
  return cx(
    'block w-full rounded-xl px-3.5 text-slate-900 shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition',
    'ring-1 ring-inset placeholder:text-slate-400 focus:outline-hidden focus:ring-2',
    'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500',
    invalid
      ? 'bg-red-50/40 ring-red-300 focus:ring-red-500'
      : 'bg-white ring-slate-300/90 hover:ring-slate-400/80 focus:ring-brand-500',
    extra,
  )
}

export const cardClass = 'rounded-2xl bg-white ring-1 ring-slate-200/80 shadow-card'

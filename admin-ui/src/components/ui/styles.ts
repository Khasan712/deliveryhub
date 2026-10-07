import { cn } from '../../lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger' | 'danger-soft' | 'telegram'
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'

const BUTTON_BASE =
  'relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap font-semibold ' +
  'transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-150 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-y-px ' +
  'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-cta text-white shadow-sm shadow-cta/25 hover:bg-cta-hover focus-visible:outline-primary-500 dark:shadow-none',
  secondary:
    'border border-line-strong bg-card text-fg-soft shadow-xs hover:border-faint/60 hover:bg-hover hover:text-fg',
  ghost: 'text-muted hover:bg-subtle hover:text-fg',
  subtle: 'bg-subtle text-fg-soft hover:bg-line hover:text-fg',
  danger: 'bg-rose-600 text-white shadow-sm shadow-rose-600/25 hover:bg-rose-700 focus-visible:outline-rose-500',
  'danger-soft':
    'text-rose-600 hover:bg-rose-50 focus-visible:outline-rose-500 dark:text-rose-400 dark:hover:bg-rose-500/10',
  telegram: 'bg-sky-500 text-white shadow-sm shadow-sky-500/25 hover:bg-sky-600 focus-visible:outline-sky-500',
}

const BUTTON_SIZES: Record<ButtonSize, string> = {
  xs: 'h-7 rounded-lg px-2.5 text-xs',
  sm: 'h-8 rounded-lg px-3 text-[13px]',
  md: 'h-10 rounded-xl px-4 text-sm',
  lg: 'h-12 rounded-xl px-5 text-[15px]',
  icon: 'size-10 rounded-xl',
  'icon-sm': 'size-8 rounded-lg',
}

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)
}

export const controlClass =
  'block w-full rounded-xl border border-line-strong bg-card px-3.5 text-sm text-fg shadow-xs placeholder:text-faint ' +
  'transition-[border-color,box-shadow,background-color] duration-150 ' +
  'hover:border-faint/70 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/15 ' +
  'disabled:cursor-not-allowed disabled:bg-subtle disabled:opacity-70 ' +
  'aria-[invalid=true]:border-rose-500 aria-[invalid=true]:focus:ring-rose-500/15 dark:bg-subtle/40'

export const cardClass = 'rounded-2xl border border-line bg-card shadow-card'

export type Tone = 'gray' | 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'sky' | 'fuchsia' | 'indigo'

export const TONES: Record<Tone, { badge: string; dot: string; soft: string }> = {
  gray: {
    badge: 'bg-slate-100 text-slate-700 ring-slate-500/15 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-400/20',
    dot: 'bg-slate-400',
    soft: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  },
  blue: {
    badge: 'bg-blue-50 text-blue-700 ring-blue-600/15 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/25',
    dot: 'bg-blue-500',
    soft: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300',
  },
  green: {
    badge:
      'bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25',
    dot: 'bg-emerald-500',
    soft: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
  },
  amber: {
    badge: 'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/25',
    dot: 'bg-amber-500',
    soft: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
  },
  red: {
    badge: 'bg-rose-50 text-rose-700 ring-rose-600/15 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/25',
    dot: 'bg-rose-500',
    soft: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300',
  },
  violet: {
    badge:
      'bg-violet-50 text-violet-700 ring-violet-600/15 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/25',
    dot: 'bg-violet-500',
    soft: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300',
  },
  sky: {
    badge: 'bg-sky-50 text-sky-700 ring-sky-600/15 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/25',
    dot: 'bg-sky-500',
    soft: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300',
  },
  fuchsia: {
    badge:
      'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-600/15 dark:bg-fuchsia-500/10 dark:text-fuchsia-300 dark:ring-fuchsia-400/25',
    dot: 'bg-fuchsia-500',
    soft: 'bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-500/10 dark:text-fuchsia-300',
  },
  indigo: {
    badge:
      'bg-indigo-50 text-indigo-700 ring-indigo-600/15 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/25',
    dot: 'bg-indigo-500',
    soft: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300',
  },
}

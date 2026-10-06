import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { cx } from '../../lib/cx'
import { errorMessage } from '../../lib/errors'
import { AlertIcon, InfoIcon, PowerIcon } from '../icons'
import { Button } from './Button'
import type { ButtonVariant } from './styles'
import { FieldError } from './Field'

interface DialogProps {
  open: boolean
  onClose: () => void
  /** Esc and a click outside close the dialog (off while an action runs). */
  dismissible?: boolean
  role?: 'dialog' | 'alertdialog'
  labelledBy: string
  describedBy?: string
  /** Focused when the dialog opens. */
  initialFocus?: RefObject<HTMLElement | null>
  className?: string
  children: ReactNode
}

/**
 * A modal on the native <dialog>: top layer, inert page behind it, Esc to close, focus returns to the opener.
 * The content is rendered only while open.
 */
export function Dialog({
  open,
  onClose,
  dismissible = true,
  role = 'dialog',
  labelledBy,
  describedBy,
  initialFocus,
  className,
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const pressedOutside = useRef(false)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      initialFocus?.current?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open, initialFocus])

  return (
    // A click on the backdrop is a mouse shortcut for Esc, which <dialog> handles natively (onCancel).
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      role={role === 'alertdialog' ? 'alertdialog' : undefined}
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onCancel={(event) => {
        event.preventDefault()
        if (dismissible) onClose()
      }}
      onClose={() => {
        if (open) onClose()
      }}
      // A click on the backdrop lands on the <dialog> itself; the card inside covers the rest.
      onMouseDown={(event) => {
        pressedOutside.current = event.target === ref.current
      }}
      onClick={(event) => {
        if (dismissible && pressedOutside.current && event.target === ref.current) onClose()
      }}
    >
      {open && (
        <div className={cx('w-[min(28rem,calc(100vw-2rem))] rounded-2xl bg-white p-6 shadow-pop', className)}>
          {children}
        </div>
      )}
    </dialog>
  )
}

type Tone = 'danger' | 'success' | 'primary'

const TONES: Record<Tone, { button: ButtonVariant; badge: string; icon: ReactNode }> = {
  danger: { button: 'danger-solid', badge: 'bg-red-50 text-red-600 ring-red-100', icon: <AlertIcon size={22} /> },
  success: { button: 'success', badge: 'bg-emerald-50 text-emerald-600 ring-emerald-100', icon: <PowerIcon size={22} /> },
  primary: { button: 'primary', badge: 'bg-brand-50 text-brand-700 ring-brand-100', icon: <InfoIcon size={22} /> },
}

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  tone?: Tone
  icon?: ReactNode
  /** Runs on confirm; the dialog stays open with a spinner until it settles and shows its error. */
  onConfirm: () => unknown
  /** The confirm button waits for this (e.g. a name typed as confirmation). */
  confirmDisabled?: boolean
  /** Extra content under the description, e.g. a confirmation field. */
  children?: ReactNode
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Bekor qilish',
  tone = 'primary',
  icon,
  onConfirm,
  confirmDisabled = false,
  children,
}: ConfirmDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const style = TONES[tone]

  const close = () => {
    setError(null)
    onClose()
  }

  const confirm = async () => {
    setPending(true)
    setError(null)
    try {
      await onConfirm()
      onClose()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      dismissible={!pending}
      role="alertdialog"
      labelledBy={titleId}
      describedBy={description ? descriptionId : undefined}
      // The safe choice gets the focus for destructive actions.
      initialFocus={tone === 'danger' ? cancelRef : confirmRef}
    >
      <div className="flex items-start gap-4">
        <span className={cx('grid size-11 shrink-0 place-items-center rounded-2xl ring-4', style.badge)}>
          {icon ?? style.icon}
        </span>
        <div className="min-w-0 pt-0.5">
          <h2 id={titleId} className="text-lg font-extrabold tracking-tight text-slate-900">
            {title}
          </h2>
          {description && (
            <div id={descriptionId} className="mt-1.5 text-sm leading-relaxed text-slate-600">
              {description}
            </div>
          )}
        </div>
      </div>
      {children && <div className="mt-5">{children}</div>}
      {error && (
        <div role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 ring-1 ring-red-100">
          <FieldError>{error}</FieldError>
        </div>
      )}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button ref={cancelRef} variant="secondary" onClick={close} disabled={pending}>
          {cancelLabel}
        </Button>
        <Button ref={confirmRef} variant={style.button} onClick={confirm} loading={pending} disabled={confirmDisabled}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  )
}

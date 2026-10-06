import { useId, useState, type DragEvent } from 'react'
import { cx } from '../lib/cx'
import { useFilePreview } from '../lib/hooks'
import { Avatar } from './Avatar'
import { RefreshIcon, TrashIcon, UploadIcon, XIcon } from './icons'
import { FieldError } from './ui/Field'

const MAX_BYTES = 2 * 1024 * 1024  // the API's limit
const ACCEPT = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

function problemOf(file: File): string | null {
  if (!ACCEPT.includes(file.type)) return 'Faqat PNG, JPG, WEBP yoki GIF rasm yuklang'
  if (file.size > MAX_BYTES) return "Rasm 2 MB dan katta bo'lmasin"
  return null
}

function sizeOf(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const smallButton = 'inline-flex h-8 items-center gap-1.5 rounded-lg text-[13px] font-bold transition disabled:opacity-60'

interface LogoFieldProps {
  file: File | null
  onChange: (file: File | null) => void
  /** The logo saved before (business page). */
  currentUrl?: string | null
  /** The saved logo is marked for removal (business page). */
  removed?: boolean
  onRemovedChange?: (removed: boolean) => void
  /** For the placeholder: the initial on the brand color. */
  name: string
  color: string
  label?: string
  optional?: boolean
  error?: string | null
  /** Id of the file input (to focus it on errors). */
  id?: string
}

/** Logo upload with a live preview: pick or drop an image; the saved logo can be removed. */
export function LogoField({
  file,
  onChange,
  currentUrl,
  removed = false,
  onRemovedChange,
  name,
  color,
  label = 'Logo',
  optional,
  error,
  id,
}: LogoFieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const hintId = useId()
  const errorId = useId()
  const [problem, setProblem] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const preview = useFilePreview(file)
  const shownError = problem ?? error
  const saved = removed ? null : currentUrl

  const take = (picked: File | undefined) => {
    if (!picked) return
    const issue = problemOf(picked)
    setProblem(issue)
    if (issue) return
    onRemovedChange?.(false)
    onChange(picked)
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    take(event.dataTransfer.files[0])
  }

  let caption = 'Rasmni shu yerga tashlang'
  if (removed) caption = 'Logo olib tashlanadi'
  else if (currentUrl) caption = 'Joriy logo'

  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-semibold text-slate-700">
        {label}
        {optional && <span className="font-normal text-slate-400"> (ixtiyoriy)</span>}
      </label>
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cx(
          'mt-1.5 flex items-center gap-4 rounded-2xl border-2 border-dashed p-3 transition',
          'has-[input:focus-visible]:border-brand-400 has-[input:focus-visible]:bg-brand-50/40',
          dragging ? 'border-brand-400 bg-brand-50/60' : 'border-slate-200 bg-slate-50/50',
          shownError && 'border-red-300',
        )}
      >
        <Avatar name={name} color={color} logo={preview ?? saved} size="lg" />
        <div className="min-w-0 flex-1">
          {file ? (
            <p className="truncate text-sm font-semibold text-slate-800" title={file.name}>
              {file.name} <span className="font-normal text-slate-500">· {sizeOf(file.size)}</span>
            </p>
          ) : (
            <p className={cx('text-sm font-semibold', removed ? 'text-red-600' : 'text-slate-700')}>{caption}</p>
          )}
          <p id={hintId} className="text-xs text-slate-500">
            PNG, JPG yoki WEBP · 2 MB gacha
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <input
              id={inputId}
              type="file"
              accept={ACCEPT.join(',')}
              aria-describedby={cx(hintId, shownError ? errorId : null)}
              aria-invalid={shownError ? true : undefined}
              className="peer sr-only"
              onChange={(event) => {
                take(event.target.files?.[0])
                event.target.value = ''
              }}
            />
            <label
              htmlFor={inputId}
              className={cx(
                smallButton,
                'bg-white px-3 text-slate-700 ring-1 ring-inset ring-slate-300/80 hover:bg-slate-50',
                'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500',
              )}
            >
              <UploadIcon size={14} />
              {file || saved ? 'Almashtirish' : 'Rasm tanlash'}
            </label>
            {file && (
              <button
                type="button"
                onClick={() => {
                  setProblem(null)
                  onChange(null)
                }}
                className={cx(smallButton, 'px-2.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800')}
              >
                <XIcon size={14} />
                Bekor qilish
              </button>
            )}
            {!file && currentUrl && onRemovedChange && (
              <button
                type="button"
                onClick={() => onRemovedChange(!removed)}
                className={cx(
                  smallButton,
                  'px-2.5',
                  removed ? 'text-slate-600 hover:bg-slate-100' : 'text-red-600 hover:bg-red-50',
                )}
              >
                {removed ? <RefreshIcon size={14} /> : <TrashIcon size={14} />}
                {removed ? 'Qaytarish' : 'Olib tashlash'}
              </button>
            )}
          </div>
        </div>
      </div>
      {shownError && <FieldError id={errorId}>{shownError}</FieldError>}
    </div>
  )
}

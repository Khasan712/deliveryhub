import { useEffect, useId, useRef, useState, type FormEvent, type Ref } from 'react'
import { useSearchParams } from 'react-router'
import { useBusinesses, useLanding, useLeads, useSetLanding, useUpdateLead } from '../api/queries'
import type { BusinessCard, Lead, LeadCounts, LeadKind, LeadPatch, LeadStatus } from '../api/types'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  ExternalIcon,
  GlobeIcon,
  InboxIcon,
  PhoneIcon,
  StoreIcon,
} from '../components/icons'
import { Button } from '../components/ui/Button'
import { CopyButton } from '../components/ui/CopyButton'
import { Field } from '../components/ui/Field'
import { Skeleton } from '../components/ui/Skeleton'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState, ErrorState } from '../components/ui/States'
import { buttonClass, cardClass, inputClass } from '../components/ui/styles'
import { useToast } from '../components/ui/toast'
import { cx } from '../lib/cx'
import { errorMessage, fieldErrors } from '../lib/errors'
import { formatDateTime } from '../lib/format'
import { formatPhone } from '../lib/phone'

type Tab = LeadStatus | 'all'

const STATUSES: Record<LeadStatus, { label: string; dot: string }> = {
  new: { label: 'Yangi', dot: 'bg-indigo-500' },
  contacted: { label: "Bog'lanildi", dot: 'bg-sky-500' },
  won: { label: "Mijoz bo'ldi", dot: 'bg-emerald-500' },
  lost: { label: 'Rad etildi', dot: 'bg-slate-400' },
}
const STATUS_ORDER = Object.keys(STATUSES) as LeadStatus[]

/** The new ones first: they wait for a call. */
const TABS: Tab[] = [...STATUS_ORDER, 'all']
const tabLabel = (tab: Tab) => (tab === 'all' ? 'Hammasi' : STATUSES[tab].label)

const EMPTY: Record<Tab, { title: string; description: string }> = {
  new: {
    title: "Yangi arizalar yo'q",
    description: "Landing sahifasidagi formadan ariza kelishi bilan shu yerda paydo bo'ladi.",
  },
  contacted: {
    title: "Bog'lanilgan arizalar yo'q",
    description: "Yangi arizaga qo'ng'iroq qilgach, uni «Bog'lanildi» deb belgilang.",
  },
  won: {
    title: "Mijoz bo'lganlar hali yo'q",
    description: "Do'kon ochishga kelishilgan arizalarni «Mijoz bo'ldi» deb belgilang.",
  },
  lost: { title: "Rad etilgan arizalar yo'q", description: "Kelishib bo'lmagan arizalar shu yerda turadi." },
  all: { title: "Hali ariza yo'q", description: "Landing sahifasidagi formadan kelgan arizalar shu yerda ko'rinadi." },
}

const KINDS: Record<LeadKind, string> = {
  cafe: 'Kafe yoki restoran',
  fastfood: 'Fast food',
  shop: "Do'kon",
  other: 'Boshqa',
}

/** The language of the page the application came from: the one to speak on the phone. */
const LANGS: Record<Lead['lang'], { code: string; speak: string; tone: string }> = {
  uz: { code: 'UZ', speak: "O'zbek tilida gaplashing", tone: 'bg-sky-50 text-sky-700 ring-sky-600/20' },
  ru: { code: 'RU', speak: 'Rus tilida gaplashing', tone: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
}

/** The API limit of our note; a counter shows up near it. */
const NOTE_MAX = 1000
const NOTE_COUNTER_FROM = 900

/** `?status=`: one of the tabs; anything else (or nothing) — the new ones. */
function tabOf(value: string | null): Tab {
  return TABS.find((tab) => tab === value) ?? 'new'
}

/** `?page=`: a whole number from 1 (the API answers the last page for one past the end). */
function pageOf(value: string | null): number {
  const page = Number(value)
  return Number.isInteger(page) && page > 1 ? page : 1
}

/**
 * Applications from the form of our landing page: businesses that want their own shop. Our staff call them back and
 * mark how it went. The tab and the page live in the address (`?status=`, `?page=`).
 */
export function LeadsPage() {
  const [params, setParams] = useSearchParams()
  const tab = tabOf(params.get('status'))
  const query = useLeads(tab === 'all' ? null : tab, pageOf(params.get('page')))
  const list = query.data
  const resultsRef = useRef<HTMLElement>(null)
  const cardsRef = useRef<HTMLUListElement>(null)
  const activeTabRef = useRef<HTMLButtonElement>(null)
  // A status being set: which card, where it was, the new status.
  const changing = useRef<{ id: number; index: number; status: LeadStatus } | null>(null)

  // A new status takes the focused button away: the card leaves a tab of one status, and a new one loses its
  // "Bog'lanildi". The keyboard focus goes to the card that takes its place (or to the tab when none is left), or
  // to the card's new status — not back to the top of the page.
  useEffect(() => {
    const change = changing.current
    if (!change || !list) return
    const lead = list.results.find((each) => each.id === change.id)
    if (lead && lead.status !== change.status) return
    changing.current = null
    if (document.activeElement && document.activeElement !== document.body) return
    const cards = cardsRef.current
    if (lead) {
      cards?.querySelector<HTMLElement>(`[data-lead="${lead.id}"] [aria-pressed="true"]`)?.focus()
    } else {
      const shown = cards?.querySelectorAll<HTMLElement>('article') ?? []
      const next = shown[Math.min(change.index, shown.length - 1)] ?? activeTabRef.current
      next?.focus()
    }
  }, [list])

  const chooseTab = (next: Tab) => {
    // A tab opens on its first page.
    if (next !== tab) setParams(next === 'new' ? {} : { status: next })
  }

  const choosePage = (next: number) => {
    setParams((current) => {
      const updated = new URLSearchParams(current)
      if (next > 1) updated.set('page', String(next))
      else updated.delete('page')
      return updated
    })
    // Back to the top of the list (the pager is at its bottom).
    resultsRef.current?.focus()
  }

  return (
    <div className="animate-enter">
      <title>Arizalar · DeliveryHub</title>
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Arizalar</h1>
      <p className="mt-1 text-slate-500">
        Landing sahifasidagi formadan kelgan arizalar: qo'ng'iroq qiling va natijasini shu yerda belgilang.
      </p>

      <SiteCard />

      <StatusTabs tab={tab} counts={list?.counts} onChoose={chooseTab} activeRef={activeTabRef} />

      <section ref={resultsRef} tabIndex={-1} aria-label="Arizalar ro'yxati" className="mt-5">
        {query.isError && !list ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
        ) : !list || query.isPlaceholderData ? (
          <LeadsSkeleton />
        ) : list.results.length === 0 ? (
          <EmptyState icon={<InboxIcon size={28} />} title={EMPTY[tab].title} description={EMPTY[tab].description} />
        ) : (
          <>
            <ul ref={cardsRef} className="grid gap-4 sm:gap-5 lg:grid-cols-2">
              {list.results.map((lead, index) => (
                <li key={lead.id}>
                  <LeadCard
                    lead={lead}
                    onStatusChange={(status) => {
                      if (status) changing.current = { id: lead.id, index, status }
                      else if (changing.current?.id === lead.id) changing.current = null
                    }}
                  />
                </li>
              ))}
            </ul>
            {list.pages > 1 && <Pager page={list.page} pages={list.pages} onPage={choosePage} />}
          </>
        )}
      </section>
    </div>
  )
}

/**
 * Our page for businesses itself: its address, and the business whose shop it links to as a live sample ("Namuna
 * do'kon" on the page, and after an application is sent). The page asks for it whenever it opens.
 */
function SiteCard() {
  const landing = useLanding()
  const list = useBusinesses()
  const choose = useSetLanding()
  const toast = useToast()
  const selectId = useId()
  const titleId = useId()

  const data = landing.data
  const chosen = data?.sample ?? null
  const active = (list.data?.results ?? []).filter((business) => business.status === 'active')
  // A chosen business that was suspended since stays in the list, so the choice still shows (and can be changed).
  const options: BusinessCard[] =
    chosen && !active.some((each) => each.slug === chosen.slug) ? [chosen, ...active] : active

  const pick = (slug: string) => {
    choose.mutate(slug || null, {
      onSuccess: (next) =>
        toast.success(
          next.sample ? `Saytda namuna do'kon: «${next.sample.name}»` : "Saytda namuna do'kon ko'rsatilmaydi",
          { description: next.sample ? "Sayt keyingi ochilishida shu do'konga havola beradi." : undefined },
        ),
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  return (
    <section
      aria-labelledby={titleId}
      className={cx(cardClass, 'mt-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 p-4 sm:p-5')}
    >
      <div className="min-w-0 max-w-xl">
        <h2 id={titleId} className="flex items-center gap-2 font-extrabold tracking-tight">
          <GlobeIcon size={18} className="text-indigo-600" />
          Sayt
          {data && <span className="font-semibold text-slate-400">{data.url.replace(/^https?:\/\/|\/$/g, '')}</span>}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Arizalar shu sahifadagi formadan keladi. «Namuna do'kon» havolasi bu yerda tanlangan do'konni ochadi.
        </p>
      </div>
      <div className="flex w-full flex-wrap items-end gap-3 sm:w-auto">
        <div className="min-w-0 flex-1 sm:w-64 sm:flex-none">
          <label htmlFor={selectId} className="mb-1.5 block text-sm font-semibold text-slate-700">
            Namuna do'kon
          </label>
          <div className="relative">
            <select
              id={selectId}
              value={chosen?.slug ?? ''}
              disabled={!data || !list.data || choose.isPending}
              onChange={(event) => pick(event.target.value)}
              className={inputClass(false, 'h-10 appearance-none pr-9 text-sm font-semibold')}
            >
              <option value="">Ko'rsatilmasin</option>
              {options.map((business) => (
                <option key={business.slug} value={business.slug}>
                  {business.status === 'active' ? business.name : `${business.name} (to'xtatilgan)`}
                </option>
              ))}
            </select>
            {choose.isPending ? (
              <Spinner size={16} className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400" />
            ) : (
              <ChevronDownIcon
                size={16}
                className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-slate-400"
              />
            )}
          </div>
        </div>
        {data && (
          <a
            href={data.url}
            target="_blank"
            rel="noreferrer"
            className={buttonClass({ variant: 'secondary', size: 'sm' })}
          >
            Saytni ochish <ExternalIcon size={15} />
          </a>
        )}
      </div>
    </section>
  )
}

interface StatusTabsProps {
  tab: Tab
  counts: LeadCounts | undefined
  onChoose: (tab: Tab) => void
  activeRef: Ref<HTMLButtonElement>
}

function StatusTabs({ tab, counts, onChoose, activeRef }: StatusTabsProps) {
  const countOf = (value: Tab) =>
    counts && (value === 'all' ? STATUS_ORDER.reduce((sum, status) => sum + counts[status], 0) : counts[value])

  return (
    // Five tabs do not fit a phone: the row scrolls sideways, edge to edge.
    <div className="-mx-4 mt-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <fieldset className="inline-flex min-w-max rounded-xl bg-slate-200/60 p-1">
        <legend className="sr-only">Holati bo'yicha</legend>
        {TABS.map((value) => {
          const count = countOf(value)
          return (
            <button
              key={value}
              ref={value === tab ? activeRef : undefined}
              type="button"
              aria-pressed={value === tab}
              onClick={() => onChoose(value)}
              className={cx(
                'rounded-lg px-3 py-1.5 text-[13px] font-bold whitespace-nowrap transition',
                value === tab
                  ? 'bg-white text-slate-900 shadow-[0_1px_3px_rgb(15_23_42/0.12)]'
                  : 'text-slate-500 hover:text-slate-800',
              )}
            >
              {tabLabel(value)}{' '}
              {count !== undefined && (
                <span
                  className={cx(
                    'ml-0.5 tabular-nums',
                    value === 'new' && count > 0 ? 'text-indigo-600' : 'text-slate-400',
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </fieldset>
    </div>
  )
}

interface LeadCardProps {
  lead: Lead
  /** Called with the status about to be set, and with `null` when setting it fails. */
  onStatusChange: (status: LeadStatus | null) => void
}

function LeadCard({ lead, onStatusChange }: LeadCardProps) {
  const toast = useToast()
  const statusUpdate = useUpdateLead()
  const noteUpdate = useUpdateLead()
  const titleId = useId()
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const [draft, setDraft] = useState(lead.note)
  const [saved, setSaved] = useState(lead.note)
  const [noteError, setNoteError] = useState<string | null>(null)

  // A note saved meanwhile (here or by a colleague) shows up — unless ours is being edited.
  if (saved !== lead.note) {
    setSaved(lead.note)
    if (draft.trim() === saved) setDraft(lead.note)
  }
  const note = draft.trim()
  const noteChanged = note !== lead.note
  const settingStatus = statusUpdate.isPending ? statusUpdate.variables.patch.status : undefined
  // Nothing for a kind this page does not know yet.
  const kind = lead.kind && KINDS[lead.kind]

  const showNoteError = (error: unknown) => {
    const message = fieldErrors(error).note
    if (message) {
      setNoteError(message)
      noteRef.current?.focus()
    }
    return message
  }

  const changeStatus = async (status: LeadStatus) => {
    if (statusUpdate.isPending || status === lead.status) return
    // An unsaved note goes along: the card may move to another tab right after.
    const patch: LeadPatch = noteChanged ? { status, note } : { status }
    onStatusChange(status)
    try {
      const updated = await statusUpdate.mutateAsync({ id: lead.id, patch })
      if (patch.note !== undefined) setDraft(updated.note)
      toast.success(`«${STATUSES[status].label}» deb belgilandi`, {
        description: patch.note !== undefined ? `${lead.name} — izoh ham saqlandi.` : lead.name,
      })
    } catch (error) {
      onStatusChange(null)
      showNoteError(error)
      toast.error("Holatni o'zgartirib bo'lmadi", { description: errorMessage(error) })
    }
  }

  const saveNote = async (event: FormEvent) => {
    event.preventDefault()
    if (!noteChanged || noteUpdate.isPending) return
    setNoteError(null)
    try {
      const updated = await noteUpdate.mutateAsync({ id: lead.id, patch: { note } })
      setDraft(updated.note)
      // The buttons go away with the change: the focus stays in the note.
      noteRef.current?.focus()
      toast.success('Izoh saqlandi', { description: lead.name })
    } catch (error) {
      toast.error("Izohni saqlab bo'lmadi", { description: showNoteError(error) ?? errorMessage(error) })
    }
  }

  const resetNote = () => {
    setDraft(lead.note)
    setNoteError(null)
    noteRef.current?.focus()
  }

  return (
    <article
      data-lead={lead.id}
      tabIndex={-1}
      aria-labelledby={titleId}
      className={cx(cardClass, 'flex h-full flex-col')}
    >
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-extrabold tracking-tight break-words text-slate-900">
              {lead.name}
            </h2>
            {(lead.business || kind) && (
              <p className="mt-0.5 flex items-start gap-1.5 text-sm text-slate-500">
                <StoreIcon size={15} className="mt-0.5 shrink-0 text-slate-400" />
                <span className="min-w-0 break-words">
                  {lead.business && <span className="font-semibold text-slate-700">{lead.business}</span>}
                  {lead.business && kind && ' · '}
                  {kind}
                </span>
              </p>
            )}
          </div>
          <LangChip lang={lead.lang} />
        </div>

        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <ClockIcon size={13} className="shrink-0 text-slate-400" />
            <span>
              Kelgan: <time dateTime={lead.created_at}>{formatDateTime(lead.created_at)}</time>
            </span>
          </span>
          {lead.contacted_at && (
            <span className="inline-flex items-center gap-1.5">
              <CheckIcon size={13} strokeWidth={2.5} className="shrink-0 text-slate-400" />
              <span>
                Bog'lanilgan: <time dateTime={lead.contacted_at}>{formatDateTime(lead.contacted_at)}</time>
              </span>
            </span>
          )}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <a
            href={`tel:${lead.phone}`}
            title="Qo'ng'iroq qilish"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-50 px-3 py-2 font-mono text-[15px] font-bold whitespace-nowrap text-indigo-700 transition hover:bg-indigo-100"
          >
            <PhoneIcon size={16} className="shrink-0" />
            {formatPhone(lead.phone)}
          </a>
          <CopyButton text={lead.phone} iconOnly label="Raqamni nusxalash" variant="ghost" />
          {lead.status === 'new' && (
            <Button
              className="ml-auto max-sm:w-full"
              loading={settingStatus === 'contacted'}
              onClick={() => void changeStatus('contacted')}
            >
              {settingStatus !== 'contacted' && <CheckIcon size={16} strokeWidth={2.5} />}
              Bog'lanildi <span className="sr-only">deb belgilash</span>
            </Button>
          )}
        </div>

        {lead.comment && (
          <figure className="mt-4 rounded-xl bg-slate-50 px-3.5 py-2.5 ring-1 ring-slate-200/70 ring-inset">
            <figcaption className="text-xs font-semibold text-slate-500">Arizadagi xabar</figcaption>
            <blockquote className="mt-0.5 text-sm leading-relaxed whitespace-pre-line break-words text-slate-700">
              {lead.comment}
            </blockquote>
          </figure>
        )}
      </div>

      <div className="mt-auto space-y-4 rounded-b-2xl border-t border-slate-100 bg-slate-50/70 p-4 sm:p-5">
        <fieldset aria-busy={statusUpdate.isPending || undefined}>
          <legend className="mb-1.5 text-sm font-semibold text-slate-700">Holati</legend>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-200/60 p-1 sm:inline-flex">
            {STATUS_ORDER.map((status) => {
              const current = lead.status === status
              return (
                <button
                  key={status}
                  type="button"
                  aria-pressed={current}
                  aria-disabled={(statusUpdate.isPending && !current) || undefined}
                  onClick={() => void changeStatus(status)}
                  className={cx(
                    'flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-bold whitespace-nowrap transition',
                    current
                      ? 'bg-white text-slate-900 shadow-[0_1px_3px_rgb(15_23_42/0.12)]'
                      : 'text-slate-500 hover:text-slate-800 aria-disabled:opacity-60 aria-disabled:hover:text-slate-500',
                  )}
                >
                  {settingStatus === status ? (
                    <Spinner size={12} />
                  ) : (
                    <span
                      aria-hidden="true"
                      className={cx('size-2 rounded-full', STATUSES[status].dot, !current && 'opacity-50')}
                    />
                  )}
                  {STATUSES[status].label}
                </button>
              )
            })}
          </div>
        </fieldset>

        <form noValidate onSubmit={saveNote}>
          <Field
            label="Izoh"
            optional="faqat xodimlar ko'radi"
            error={noteError}
            hint={draft.length >= NOTE_COUNTER_FROM ? `${draft.length} / ${NOTE_MAX}` : undefined}
          >
            {(control) => (
              <textarea
                {...control}
                ref={noteRef}
                rows={2}
                maxLength={NOTE_MAX}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value)
                  setNoteError(null)
                }}
                placeholder="Qo'ng'iroq natijasi, kelishuvlar…"
                className={inputClass(Boolean(noteError), 'min-h-[4.5rem] resize-y py-2.5 text-sm leading-relaxed')}
              />
            )}
          </Field>
          {noteChanged && (
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={resetNote} disabled={noteUpdate.isPending}>
                Bekor qilish
              </Button>
              <Button type="submit" variant="dark" size="sm" loading={noteUpdate.isPending}>
                {noteUpdate.isPending ? 'Saqlanmoqda…' : 'Saqlash'}
              </Button>
            </div>
          )}
        </form>
      </div>
    </article>
  )
}

function LangChip({ lang }: { lang: Lead['lang'] }) {
  const meta = LANGS[lang] ?? LANGS.uz
  return (
    <span
      title={meta.speak}
      className={cx(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-extrabold ring-1 ring-inset',
        meta.tone,
      )}
    >
      <GlobeIcon size={12} />
      <span aria-hidden="true">{meta.code}</span>
      <span className="sr-only">{meta.speak}</span>
    </span>
  )
}

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  return (
    <nav aria-label="Sahifalar" className="mt-6 flex items-center justify-between gap-3">
      <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ArrowLeftIcon size={16} />
        Oldingi
      </Button>
      <p className="text-sm font-semibold text-slate-500 tabular-nums">
        <span className="sr-only">Sahifa </span>
        {page} / {pages}
      </p>
      <Button variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Keyingi
        <ArrowRightIcon size={16} />
      </Button>
    </nav>
  )
}

function LeadsSkeleton() {
  return (
    <div aria-busy="true">
      <output className="sr-only">Arizalar yuklanmoqda…</output>
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className={cardClass}>
            <div className="p-4 sm:p-5">
              <Skeleton className="h-5 w-2/5" />
              <Skeleton className="mt-2 h-4 w-3/5" />
              <Skeleton className="mt-2 h-3 w-1/3" />
              <Skeleton className="mt-4 h-10 w-52 rounded-xl" />
            </div>
            <div className="space-y-3 border-t border-slate-100 p-4 sm:p-5">
              <Skeleton className="h-9 w-full max-w-md rounded-xl" />
              <Skeleton className="h-[4.5rem] rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

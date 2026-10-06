import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useBotSetupLink, useConnectBot, useDisconnectBot } from '../../api/queries'
import type { Bot, BotRole, BusinessDetail, SetupLink } from '../../api/types'
import { AliveBadge } from '../../components/BotStatus'
import {
  BotIcon,
  ChevronDownIcon,
  ExternalIcon,
  InfoIcon,
  KeyIcon,
  QrIcon,
  RefreshIcon,
  SendIcon,
  SparklesIcon,
  StoreIcon,
  UsersIcon,
} from '../../components/icons'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { CopyButton } from '../../components/ui/CopyButton'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { FieldError } from '../../components/ui/Field'
import { useToast } from '../../components/ui/toast'
import { cx } from '../../lib/cx'
import { errorMessage, fieldErrors } from '../../lib/errors'
import { formatDateTime } from '../../lib/format'
import { svgDataUrl } from '../../lib/svg'
import { buttonClass, inputClass } from '../../components/ui/styles'

const ROLES: BotRole[] = ['client', 'admin']

const ROLE_META: Record<BotRole, { title: string; hint: string; icon: ReactNode }> = {
  client: { title: 'Mijozlar boti', hint: "Do'kon (Mini App), buyurtma holati", icon: <StoreIcon size={19} /> },
  admin: { title: 'Xodimlar boti', hint: 'Ovozli buyurtma, yangi buyurtmalar', icon: <UsersIcon size={19} /> },
}

const SETUP_WATCH_MS = 15 * 60_000
const CONNECT_WATCH_MS = 60_000
/** A @BotFather token: `<bot id>:<secret>`. */
const TOKEN_SHAPE = /^\d+:[A-Za-z0-9_-]{20,}$/

interface BotsSectionProps {
  business: BusinessDetail
  /** Re-read the business for the next `ms` (bots being created, a new bot starting up). */
  watch: (ms: number) => void
}

export function BotsSection({ business, watch }: BotsSectionProps) {
  const toast = useToast()
  const [setupLink, setSetupLink] = useState<SetupLink | null>(null)
  const missing = business.missing_roles
  const seen = useRef<BusinessDetail['bots'] | null>(null)

  // Every bot is in place: the setup link has done its job (and polling stops by itself, see useBusiness).
  if (setupLink && missing.length === 0) setSetupLink(null)

  // Announce every bot that appears — created in Telegram through the setup link or connected with a token.
  useEffect(() => {
    const before = seen.current
    seen.current = business.bots
    if (!before) return
    for (const role of ROLES) {
      const bot = business.bots[role]
      if (bot && bot.username !== before[role]?.username) toast.success(`@${bot.username} ulandi`)
    }
  }, [business.bots, toast])


  return (
    <Card
      title="Telegram botlari"
      titleId="business-bots"
      icon={<BotIcon size={18} />}
      description="Mijozlar va xodimlar uchun ikki bot — har biri o'z vazifasi bilan."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {ROLES.map((role) => (
          <BotCard key={role} business={business} role={role} />
        ))}
      </div>

      {missing.length > 0 && (
        <BotSetup
          business={business}
          link={setupLink}
          onLink={(link) => {
            setSetupLink(link)
            watch(SETUP_WATCH_MS)
          }}
        />
      )}

      <ConnectWithToken
        business={business}
        defaultOpen={missing.length > 0 && !business.platform_bot}
        onConnected={() => watch(CONNECT_WATCH_MS)}
      />
    </Card>
  )
}

function BotCard({ business, role }: { business: BusinessDetail; role: BotRole }) {
  const bot = business.bots[role]
  const meta = ROLE_META[role]
  const disconnect = useDisconnectBot(business.slug)
  const toast = useToast()
  // The bot being disconnected — kept for the dialog text after the card turns empty.
  const [confirming, setConfirming] = useState<Bot | null>(null)

  return (
    <div
      className={cx(
        'flex min-h-36 flex-col rounded-2xl p-4 transition',
        bot ? 'bg-white ring-1 ring-slate-200' : 'border-2 border-dashed border-slate-200 bg-slate-50/70',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cx(
              'grid size-10 shrink-0 place-items-center rounded-xl',
              bot ? 'bg-brand-50 text-brand-700' : 'bg-white text-slate-400 ring-1 ring-slate-200',
            )}
          >
            {meta.icon}
          </span>
          <div className="min-w-0">
            <h3 className="font-extrabold text-slate-900">{meta.title}</h3>
            <p className="text-xs text-slate-500">{meta.hint}</p>
          </div>
        </div>
        {bot && <AliveBadge alive={bot.alive} />}
      </div>

      {bot ? (
        <>
          <a
            href={`https://t.me/${bot.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex max-w-full items-center gap-1 self-start truncate font-semibold text-brand-700 hover:underline"
          >
            @{bot.username}
            <span className="sr-only">(Telegram'da ochish)</span>
          </a>
          <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-xs text-slate-500">
            <span>{bot.created_via === 'managed' ? 'Platforma orqali yaratilgan' : 'Token bilan ulangan'}</span>
            <button
              type="button"
              onClick={() => setConfirming(bot)}
              aria-label={`${meta.title}ni uzish`}
              className="rounded-md px-2 py-1 font-bold text-red-600 transition hover:bg-red-50"
            >
              Uzish
            </button>
          </div>
        </>
      ) : (
        <p className="mt-auto pt-3 text-sm font-medium text-slate-400">Ulanmagan</p>
      )}

      <ConfirmDialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title="Bot platformadan uzilsinmi?"
        description={
          <>
            <b className="font-semibold text-slate-800">@{confirming?.username}</b> ({meta.title.toLowerCase()}) bu biznes
            uchun ishlamay qoladi. Keyin yana ulash mumkin.
          </>
        }
        confirmLabel="Uzish"
        tone="danger"
        onConfirm={async () => {
          await disconnect.mutateAsync(role)
          toast.success('Bot uzildi')
        }}
      />
    </div>
  )
}

interface BotSetupProps {
  business: BusinessDetail
  link: SetupLink | null
  onLink: (link: SetupLink) => void
}

/** "Create bots in two taps": a link + QR to our platform bot (Telegram Managed Bots). */
function BotSetup({ business, link, onLink }: BotSetupProps) {
  const setup = useBotSetupLink(business.slug)
  const qr = link ? svgDataUrl(link.qr_svg) : null
  const create = () => setup.mutate(undefined, { onSuccess: onLink })

  return (
    <div className="mt-5 rounded-2xl bg-linear-to-br from-brand-50 via-white to-amber-50 p-5 ring-1 ring-brand-100">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-linear-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-500/25">
          <SparklesIcon size={19} />
        </span>
        <div className="min-w-0">
          <h3 className="font-extrabold text-slate-900">Botlarni yaratish — ikki bosishda</h3>
          {business.platform_bot ? (
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Havolani biznes egasiga yuboring (yoki o'zingiz oching). Telegram'da ikkita tugma bosiladi — botlar
              yaratiladi va shu yerga avtomatik ulanadi. Botlar ochgan odamniki bo'ladi.
            </p>
          ) : (
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Buning uchun platforma boti kerak: @BotFather'da bot yarating, unda <b>Bot Management</b> (boshqa
              botlarni boshqarish) rejimini yoqing va tokenini <code className="rounded bg-white px-1 py-0.5 text-[13px] ring-1 ring-slate-200">.env</code>{' '}
              dagi <code className="rounded bg-white px-1 py-0.5 text-[13px] ring-1 ring-slate-200">PLATFORM_BOT_TOKEN</code> ga
              yozing. Hozircha botlarni pastdagi token bilan ulash mumkin.
            </p>
          )}
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            Ulanmagan:
            {business.missing_roles.map((role) => (
              <span key={role} className="rounded-md bg-white px-1.5 py-0.5 font-semibold text-slate-700 ring-1 ring-slate-200">
                {ROLE_META[role].title}
              </span>
            ))}
          </p>
        </div>
      </div>

      {business.platform_bot && (
        <>
          {link ? (
            <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start">
              {qr && (
                <img
                  src={qr}
                  alt="Botlarni yaratish havolasining QR kodi"
                  className="size-44 shrink-0 self-center rounded-2xl bg-white p-2.5 shadow-card ring-1 ring-slate-200 sm:self-start"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-600">
                  Telefon kamerasi bilan skanerlang yoki havolani yuboring
                  {link.expires_at ? ` (${formatDateTime(link.expires_at)} gacha amal qiladi)` : ''}:
                </p>
                <p className="mt-2 rounded-xl bg-white px-3 py-2 font-mono text-[13px] break-all text-slate-800 ring-1 ring-slate-200">
                  {link.url}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <CopyButton text={link.url} size="md" />
                  <a href={link.url} target="_blank" rel="noopener noreferrer" className={buttonClass({ size: 'md' })}>
                    <SendIcon size={16} />
                    Telegram'da ochish
                    <ExternalIcon size={14} className="opacity-70" />
                  </a>
                </div>
                <output className="mt-4 flex items-center gap-2.5 text-sm font-semibold text-brand-700">
                  <span aria-hidden="true" className="relative flex size-2.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-400 opacity-70" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-brand-500" />
                  </span>
                  Botlar yaratilishini kutyapmiz — ular shu yerda o'zi paydo bo'ladi.
                </output>
                <button
                  type="button"
                  onClick={create}
                  disabled={setup.isPending}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 disabled:opacity-60"
                >
                  <RefreshIcon size={13} className={setup.isPending ? 'animate-spin' : undefined} />
                  Yangi havola olish
                </button>
              </div>
            </div>
          ) : (
            <Button className="mt-4" onClick={create} loading={setup.isPending}>
              {!setup.isPending && <QrIcon size={17} />}
              {setup.isPending ? 'Tayyorlanmoqda…' : 'QR va havola olish'}
            </Button>
          )}
          {setup.isError && (
            <div role="alert">
              <FieldError>{errorMessage(setup.error)}</FieldError>
            </div>
          )}
          <p className="mt-4 text-xs text-slate-500">Platforma boti: @{business.platform_bot.username}</p>
        </>
      )}
    </div>
  )
}

interface ConnectWithTokenProps {
  business: BusinessDetail
  defaultOpen: boolean
  onConnected: () => void
}

/** Without Managed Bots: paste a token from @BotFather. */
function ConnectWithToken({ business, defaultOpen, onConnected }: ConnectWithTokenProps) {
  const connect = useConnectBot(business.slug)
  const [open, setOpen] = useState(defaultOpen)
  const [role, setRole] = useState<BotRole>(business.missing_roles[0] ?? 'client')
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const tokenRef = useRef<HTMLInputElement>(null)
  const roleId = useId()
  const tokenId = useId()
  const errorId = useId()
  const current = business.bots[role]

  const fail = (message: string) => {
    setError(message)
    tokenRef.current?.focus()
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const value = token.trim()
    if (!value) return fail('Tokenni kiriting')
    if (!TOKEN_SHAPE.test(value)) {
      return fail("Token ko'rinishi noto'g'ri — @BotFather bergan tokenni to'liq qo'ying (masalan, 123456789:AA…)")
    }
    setError(null)
    connect.mutate(
      { role, token: value },
      {
        onSuccess: () => {
          setToken('')
          onConnected()
        },
        onError: (caught) => {
          const fields = fieldErrors(caught)
          fail(fields.token ?? fields.role ?? errorMessage(caught))
        },
      },
    )
    return undefined
  }

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="group mt-5 rounded-2xl ring-1 ring-slate-200 open:bg-slate-50/50"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-sm font-bold text-slate-700 transition hover:text-slate-900 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2.5">
          <KeyIcon size={17} className="text-slate-400" />
          @BotFather tokeni bilan ulash
        </span>
        <ChevronDownIcon size={18} className="text-slate-400 transition group-open:rotate-180" />
      </summary>
      <form noValidate onSubmit={submit} className="border-t border-slate-200/80 px-4 pt-4 pb-4">
        <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
          <div className="relative">
            <label htmlFor={roleId} className="sr-only">
              Bot turi
            </label>
            <select
              id={roleId}
              value={role}
              onChange={(event) => setRole(event.target.value as BotRole)}
              className={inputClass(false, 'h-10 appearance-none pr-9 text-sm font-semibold')}
            >
              {ROLES.map((each) => (
                <option key={each} value={each}>
                  {ROLE_META[each].title}
                </option>
              ))}
            </select>
            <ChevronDownIcon
              size={16}
              className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-slate-400"
            />
          </div>
          <div>
            <label htmlFor={tokenId} className="sr-only">
              Bot tokeni
            </label>
            <input
              ref={tokenRef}
              id={tokenId}
              value={token}
              onChange={(event) => {
                setToken(event.target.value)
                if (error) setError(null)
              }}
              placeholder="123456789:AA…"
              maxLength={100}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className={inputClass(Boolean(error), 'h-10 font-mono text-sm')}
            />
          </div>
          <Button type="submit" variant="dark" loading={connect.isPending}>
            Ulash
          </Button>
        </div>
        {error && <FieldError id={errorId}>{error}</FieldError>}
        {current && !error && (
          <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700">
            <InfoIcon size={14} />
            Hozirgi @{current.username} o'rniga yangi bot ulanadi.
          </p>
        )}
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          @BotFather'da <code className="font-mono">/newbot</code> buyrug'i bilan bot yarating va u bergan tokenni shu
          yerga qo'ying.
        </p>
      </form>
    </details>
  )
}

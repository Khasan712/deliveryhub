import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useSearchParams } from 'react-router'
import { forgetSession, useLogin, useMe } from '../api/queries'
import { Glow } from '../components/AppLayout'
import { BrandMark } from '../components/BrandMark'
import { BotIcon, DashboardIcon, ErrorCircleIcon, StoreIcon } from '../components/icons'
import { Splash } from '../components/RequireAuth'
import { Button } from '../components/ui/Button'
import { Field } from '../components/ui/Field'
import { inputClass } from '../components/ui/styles'
import { PasswordInput } from '../components/ui/PasswordInput'
import { errorMessage } from '../lib/errors'
import { safeNext } from '../lib/paths'

const YEAR = new Date().getFullYear()

const FEATURES = [
  { icon: <StoreIcon size={20} />, title: "Do'kon va Mini App", text: "Mijozlar saytdan yoki Telegram'dan buyurtma beradi" },
  { icon: <DashboardIcon size={20} />, title: 'Admin panel', text: 'Buyurtmalar, katalog, mijozlar va xodimlar' },
  { icon: <BotIcon size={20} />, title: 'Ikki Telegram bot', text: 'Mijozlar va xodimlar uchun — ikki bosishda' },
]

export function LoginPage() {
  const me = useMe()
  const login = useLogin()
  const queryClient = useQueryClient()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  // Arrived here by "Chiqish": the session is over on the server, now forget it here too.
  const loggedOut = (useLocation().state as { loggedOut?: boolean } | null)?.loggedOut === true
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ phone?: string; password?: string }>({})
  const phoneRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (loggedOut) forgetSession(queryClient)
  }, [loggedOut, queryClient])

  if (me.data && (!loggedOut || login.isSuccess)) return <Navigate to={next} replace />
  if (me.isPending) return <Splash />

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found: typeof errors = {}
    if (!phone.trim()) found.phone = 'Telefon raqamini kiriting'
    if (!password) found.password = 'Parolni kiriting'
    setErrors(found)
    if (found.phone) {
      phoneRef.current?.focus()
    } else if (found.password) {
      passwordRef.current?.focus()
    } else {
      // On success the session is stored and this page redirects to `next`.
      login.mutate({ phone: phone.trim(), password })
    }
  }

  const edit = (apply: () => void) => {
    apply()
    if (login.isError) login.reset()
  }

  return (
    <div className="relative isolate min-h-dvh lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <title>Kirish · DeliveryHub platforma</title>
      <aside className="relative hidden overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
        <div aria-hidden="true" className="absolute -top-40 -left-40 size-[34rem] rounded-full bg-brand-600/35 blur-3xl" />
        <div aria-hidden="true" className="absolute -right-40 -bottom-48 size-[34rem] rounded-full bg-amber-500/25 blur-3xl" />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(rgb(255_255_255/0.04)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.04)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
        />
        <div className="relative flex items-center gap-3">
          <BrandMark />
          <span className="font-extrabold tracking-tight">
            DeliveryHub <span className="font-semibold text-slate-400">platforma</span>
          </span>
        </div>
        <div className="relative max-w-lg">
          <p className="text-4xl leading-tight font-extrabold tracking-tight xl:text-5xl">
            Bizneslarni bir necha daqiqada oching
          </p>
          <p className="mt-4 text-lg text-slate-300">
            Har biri o'z do'koni, admin paneli va botlari bilan — ma'lumotlari alohida.
          </p>
          <ul className="mt-10 space-y-5">
            {FEATURES.map((feature) => (
              <li key={feature.title} className="flex items-start gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10 text-brand-200 ring-1 ring-white/15">
                  {feature.icon}
                </span>
                <span>
                  <span className="block font-bold">{feature.title}</span>
                  <span className="block text-sm text-slate-400">{feature.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-slate-500">© {YEAR} DeliveryHub</p>
      </aside>

      <main className="relative flex min-h-dvh items-center justify-center px-4 py-12 sm:px-6">
        <Glow />
        <div className="w-full max-w-sm animate-enter">
          <div className="text-center">
            <BrandMark size="lg" className="mx-auto" />
            <h1 className="mt-5 text-2xl font-extrabold tracking-tight">DeliveryHub platforma</h1>
            <p className="mt-1 text-sm text-slate-500">Bizneslarni boshqarish paneli</p>
          </div>

          <form
            noValidate
            onSubmit={submit}
            aria-label="Kirish"
            className="mt-8 space-y-4 rounded-2xl bg-white p-6 shadow-card ring-1 ring-slate-200/80"
          >
            {login.isError && (
              <div role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 px-3.5 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-100">
                <ErrorCircleIcon size={18} className="mt-px shrink-0" />
                {errorMessage(login.error)}
              </div>
            )}
            <Field label="Telefon" error={errors.phone}>
              {(control) => (
                <input
                  {...control}
                  ref={phoneRef}
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="username"
                  placeholder="+998 90 123 45 67"
                  value={phone}
                  onChange={(event) => edit(() => setPhone(event.target.value))}
                  className={inputClass(Boolean(errors.phone))}
                />
              )}
            </Field>
            <Field label="Parol" error={errors.password}>
              {(control) => (
                <PasswordInput
                  {...control}
                  ref={passwordRef}
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => edit(() => setPassword(event.target.value))}
                  invalid={Boolean(errors.password)}
                />
              )}
            </Field>
            <Button type="submit" size="lg" block loading={login.isPending}>
              {login.isPending ? 'Kirilmoqda…' : 'Kirish'}
            </Button>
          </form>
          <p className="mt-6 text-center text-xs text-slate-400">Faqat platforma xodimlari uchun</p>
        </div>
      </main>
    </div>
  )
}

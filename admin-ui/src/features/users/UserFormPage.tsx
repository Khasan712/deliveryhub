import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { isApiError } from '../../api/client'
import { errorMessage, mapFieldErrors } from '../../api/errors'
import { useBranches, useDeleteUser, useSaveUser, useUser } from '../../api/queries'
import type { Role, StaffUserInput } from '../../api/types'
import { NotFound } from '../../auth/SystemScreens'
import { useAuthed } from '../../auth/session'
import { useConfirm, useToast } from '../../components/feedback/feedback'
import { IconInfo, IconKey, IconPhone, IconShield, IconTrash, IconUser, IconWand } from '../../components/icons'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { Field, Input, PasswordInput, Select } from '../../components/ui/Form'
import { PageHeader } from '../../components/ui/PageHeader'
import { Skeleton } from '../../components/ui/Skeleton'
import { ErrorState } from '../../components/ui/States'
import { Switch } from '../../components/ui/Switch'
import { useI18n } from '../../i18n/context'
import type { DictKey } from '../../i18n/dict'
import { cn } from '../../lib/cn'
import { formatFullDateTime, formatPhone, fullName } from '../../lib/format'
import { useUnsavedChanges } from '../../lib/useUnsavedChanges'
import { generatePassword } from './password'

interface FormState {
  phone_number: string
  first_name: string
  last_name: string
  role: Role
  /** The branch of a branch admin ('' — none chosen). */
  branch_id: string
  is_active: boolean
  password: string
  confirm: string
}

const EMPTY: FormState = {
  phone_number: '',
  first_name: '',
  last_name: '',
  role: 'manager',
  branch_id: '',
  is_active: true,
  password: '',
  confirm: '',
}

const ROLE_TEXT: Record<Role, { label: DictKey; description: DictKey }> = {
  admin: { label: 'role_admin', description: 'role_admin_desc' },
  manager: { label: 'role_manager', description: 'role_manager_desc' },
  branch: { label: 'role_branch', description: 'role_branch_desc' },
}

type Errors = Partial<Record<keyof FormState, string>>

export function UserFormPage() {
  const { id } = useParams()
  const editing = id !== undefined
  const { t, lang } = useI18n()
  const toast = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const { user: me, branchesOn } = useAuthed()
  const user = useUser(id)
  const branches = useBranches(branchesOn)
  const save = useSaveUser(id)
  const remove = useDeleteUser()
  const isSelf = editing && Number(id) === me.id

  // «Xodim qo'shish» of a branch (/users/new?role=branch&branch=3): its new branch admin; back to the branches after.
  const [params] = useSearchParams()
  const fromBranch = !editing && branchesOn && params.get('role') === 'branch'
  const presetBranch = params.get('branch') ?? ''
  const start: FormState = fromBranch
    ? { ...EMPTY, role: 'branch', branch_id: /^\d+$/.test(presetBranch) ? presetBranch : '' }
    : EMPTY
  const home = fromBranch ? '/branches' : '/users'
  const [form, setForm] = useState<FormState>(start)
  const [initial, setInitial] = useState<FormState>(start)
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const loaded = useRef(false)

  useEffect(() => {
    if (!user.data || loaded.current) return
    loaded.current = true
    const values: FormState = {
      ...EMPTY,
      phone_number: user.data.phone_number ?? '',
      first_name: user.data.first_name ?? '',
      last_name: user.data.last_name ?? '',
      role: user.data.role,
      branch_id: user.data.branch ? String(user.data.branch.id) : '',
      is_active: user.data.is_active,
    }
    setForm(values)
    setInitial(values)
  }, [user.data])

  const dirty = (Object.keys(form) as Array<keyof FormState>).some((key) => form[key] !== initial[key])
  const allowLeave = useUnsavedChanges(dirty)

  if (editing && isApiError(user.error) && user.error.status === 404) return <NotFound />

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }))
  }

  // «Filial admini» while branches are on (or for someone who already is one).
  const roles: Role[] = branchesOn || initial.role === 'branch' ? ['admin', 'manager', 'branch'] : ['admin', 'manager']
  const needsBranch = form.role === 'branch' && branchesOn
  // Active branches, and the user's own one even if it was stopped since.
  const branchOptions = (branches.data ?? []).filter((item) => item.is_active || String(item.id) === initial.branch_id)

  const validate = (): Errors => {
    const found: Errors = {}
    if (!form.phone_number.trim()) found.phone_number = t('field_required')
    if (needsBranch && !form.branch_id && !isSelf) found.branch_id = t('user_branch_required')
    if (!editing && !form.password) found.password = t('field_required')
    else if (form.password && form.password.length < 8) found.password = t('field_password_short')
    if (form.password && form.confirm !== form.password) found.confirm = t('field_password_mismatch')
    return found
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found = validate()
    setErrors(found)
    setFormError(null)
    const first = (['phone_number', 'branch_id', 'password', 'confirm'] as const).find((key) => found[key])
    if (first) {
      document.getElementById(`user-${first}`)?.focus()
      return
    }
    const body: Partial<StaffUserInput> = {
      phone_number: form.phone_number.trim(),
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
    }
    // Your own role and status cannot be changed (the API answers cannot_change_self). The role goes when it is new
    // (a branch admin's role stays valid while branches are off), the branch with a new role or a new branch.
    if (!isSelf) {
      if (!editing || form.role !== initial.role) body.role = form.role
      if (form.role === 'branch' && (!editing || form.role !== initial.role || form.branch_id !== initial.branch_id)) {
        body.branch_id = form.branch_id ? Number(form.branch_id) : null
      }
      body.is_active = form.is_active
    }
    if (form.password) body.password = form.password

    save.mutate(body, {
      onSuccess: () => {
        allowLeave()
        toast.success(editing ? t('user_saved') : t('user_created'))
        navigate(home)
      },
      onError: (error) => {
        const mapped = mapFieldErrors(error, t) as Errors
        setErrors(mapped)
        if (!Object.keys(mapped).length) setFormError(errorMessage(error, t))
        const first = (['phone_number', 'role', 'branch_id', 'password'] as const).find((key) => mapped[key])
        if (first) document.getElementById(`user-${first}`)?.focus()
      },
    })
  }

  const askDelete = () => {
    const target = user.data
    if (!target) return
    const name = fullName(target.first_name, target.last_name) || formatPhone(target.phone_number)
    void confirm({
      title: t('delete_user'),
      message: t('delete_user_confirm', { name }),
      confirmLabel: t('yes_delete'),
      onConfirm: async () => {
        await remove.mutateAsync(target.id)
        allowLeave()
        toast.success(t('user_deleted'))
        navigate('/users')
      },
    })
  }

  const back = { to: home, label: fromBranch ? t('back_to_branches') : t('back_to_users') }
  const title = editing ? t('edit_user') : t('add_user')

  if (editing && !user.data) {
    return (
      <div className="max-w-3xl">
        <PageHeader back={back} title={title} />
        {user.error ? (
          <Card>
            <ErrorState error={user.error} onRetry={() => void user.refetch()} />
          </Card>
        ) : (
          <Skeleton className="h-[32rem] rounded-2xl" />
        )}
      </div>
    )
  }

  const generate = () => {
    const password = generatePassword()
    setForm((current) => ({ ...current, password, confirm: password }))
    setErrors((current) => ({ ...current, password: undefined, confirm: undefined }))
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        back={back}
        title={title}
        description={
          editing && user.data
            ? `${fullName(user.data.first_name, user.data.last_name) || formatPhone(user.data.phone_number)} · ${formatFullDateTime(user.data.created_at, lang)}`
            : t('users_subtitle')
        }
        actions={
          editing && !isSelf ? (
            <Button variant="danger-soft" icon={<IconTrash size={16} />} onClick={askDelete}>
              {t('delete')}
            </Button>
          ) : undefined
        }
      />

      <form onSubmit={submit} noValidate className="space-y-6">
        {formError && (
          <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">
            {formError}
          </p>
        )}

        <Card>
          <CardHeader title={t('basic_info')} icon={<SectionIcon><IconUser size={18} /></SectionIcon>} />
          <div className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-2">
            <Field id="user-phone_number" label={t('phone')} error={errors.phone_number} required className="sm:col-span-2">
              {(props) => (
                <Input
                  {...props}
                  type="tel"
                  inputMode="tel"
                  placeholder="+998 90 123 45 67"
                  leading={<IconPhone size={18} />}
                  value={form.phone_number}
                  onChange={(event) => set('phone_number', event.target.value)}
                  maxLength={30}
                  autoComplete="off"
                />
              )}
            </Field>
            <Field id="user-first_name" label={t('first_name')} error={errors.first_name}>
              {(props) => (
                <Input {...props} value={form.first_name} onChange={(event) => set('first_name', event.target.value)} maxLength={100} autoComplete="off" />
              )}
            </Field>
            <Field id="user-last_name" label={t('last_name')} error={errors.last_name}>
              {(props) => (
                <Input {...props} value={form.last_name} onChange={(event) => set('last_name', event.target.value)} maxLength={100} autoComplete="off" />
              )}
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title={t('access')} icon={<SectionIcon><IconShield size={18} /></SectionIcon>} />
          <div className="space-y-5 p-5">
            {isSelf && (
              <p className="flex items-center gap-2 rounded-xl bg-subtle px-3.5 py-2.5 text-[13px] text-fg-soft">
                <IconInfo size={16} className="shrink-0 text-faint" />
                {t('self_locked')}
              </p>
            )}
            <fieldset disabled={isSelf} className="min-w-0" aria-describedby={errors.role ? 'user-role-error' : undefined}>
              <legend className="mb-2 text-[13px] font-medium text-fg-soft">
                {t('role')} <span className="text-rose-500">*</span>
              </legend>
              <div className={cn('grid grid-cols-1 gap-3', roles.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
                {roles.map((role) => {
                  const selected = form.role === role
                  return (
                    <label
                      key={role}
                      className={cn(
                        'relative flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-left transition-all',
                        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary-500',
                        'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60',
                        selected
                          ? 'border-transparent bg-primary-50 ring-2 ring-primary-500 dark:bg-primary-500/10'
                          : 'border-line hover:border-line-strong hover:bg-hover',
                      )}
                    >
                      <input
                        id={role === roles[0] ? 'user-role' : undefined}
                        type="radio"
                        name="user-role"
                        value={role}
                        checked={selected}
                        onChange={() => set('role', role)}
                        className="sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className={cn(
                          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2',
                          selected ? 'border-primary-600 dark:border-primary-400' : 'border-line-strong',
                        )}
                      >
                        {selected && <span className="size-2.5 rounded-full bg-primary-600 dark:bg-primary-400" />}
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-fg">{t(ROLE_TEXT[role].label)}</span>
                        <span className="mt-0.5 block text-[13px] text-muted">
                          {role === 'branch' && !branchesOn ? t('role_branch_off') : t(ROLE_TEXT[role].description)}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </div>
              {errors.role && (
                <p id="user-role-error" className="mt-1.5 text-[13px] font-medium text-rose-600 dark:text-rose-400">
                  {errors.role}
                </p>
              )}
            </fieldset>
            {needsBranch && (
              <Field
                id="user-branch_id"
                label={t('branch')}
                error={errors.branch_id}
                required
                className="animate-fade-in"
                hint={
                  branches.data && branchOptions.length === 0 ? (
                    <>
                      {t('user_no_branches')} ·{' '}
                      <Link to="/branches/new" className="font-semibold text-primary-700 hover:underline dark:text-primary-300">
                        {t('add_branch')}
                      </Link>
                    </>
                  ) : (
                    t('user_branch_hint')
                  )
                }
              >
                {(props) => (
                  <Select
                    {...props}
                    disabled={isSelf}
                    value={form.branch_id}
                    onChange={(event) => set('branch_id', event.target.value)}
                  >
                    <option value="">{t('user_branch_required')}</option>
                    {branchOptions.map((item) => (
                      <option key={item.id} value={String(item.id)}>
                        {item.is_active ? item.name : t('branch_inactive_suffix', { name: item.name })}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-line p-4">
              <div>
                <p id="user-active-label" className="text-sm font-semibold text-fg">
                  {form.is_active ? t('active') : t('inactive')}
                </p>
                <p id="user-active-hint" className="mt-0.5 text-[13px] text-muted">
                  {t('active_description')}
                </p>
              </div>
              <Switch
                checked={form.is_active}
                onChange={(value) => set('is_active', value)}
                label={t('active')}
                aria-describedby="user-active-hint"
                disabled={isSelf}
                tone="green"
              />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title={editing ? t('new_password') : t('password')}
            description={editing ? t('leave_empty_password') : t('password_create_hint')}
            icon={<SectionIcon><IconKey size={18} /></SectionIcon>}
            actions={
              <Button type="button" variant="subtle" size="sm" icon={<IconWand size={15} />} onClick={generate}>
                {t('generate_password')}
              </Button>
            }
          />
          <div className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-2">
            <Field id="user-password" label={editing ? t('new_password') : t('password')} error={errors.password} required={!editing} hint={t('password_hint')}>
              {(props) => (
                <PasswordInput
                  {...props}
                  value={form.password}
                  onChange={(event) => set('password', event.target.value)}
                  autoComplete="new-password"
                  maxLength={128}
                />
              )}
            </Field>
            <Field id="user-confirm" label={t('confirm_password')} error={errors.confirm} required={!editing}>
              {(props) => (
                <PasswordInput
                  {...props}
                  value={form.confirm}
                  onChange={(event) => set('confirm', event.target.value)}
                  autoComplete="new-password"
                  maxLength={128}
                />
              )}
            </Field>
          </div>
        </Card>

        <div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-app/85 px-4 py-3 backdrop-blur-lg sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-2xl lg:border lg:bg-card/90 lg:px-5">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <ButtonLink to={home} variant="secondary">
              {t('cancel')}
            </ButtonLink>
            <Button type="submit" loading={save.isPending} disabled={editing && !dirty}>
              {editing ? t('save_changes') : t('create_user')}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}

function SectionIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-9 items-center justify-center rounded-xl bg-subtle text-muted ring-1 ring-line">{children}</span>
  )
}

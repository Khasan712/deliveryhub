import { Link } from 'react-router'
import { PAGE_SIZE, useBranches, useDeleteUser, useUsers } from '../../api/queries'
import type { StaffUser } from '../../api/types'
import { useAuthed } from '../../auth/session'
import { ActiveBadge, RoleBadge } from '../../components/badges'
import { useConfirm, useToast } from '../../components/feedback/feedback'
import { IconPencil, IconPlus, IconStore, IconTrash, IconUsersCog } from '../../components/icons'
import { Avatar } from '../../components/ui/Avatar'
import { Badge } from '../../components/ui/Badge'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { SearchInput, Select } from '../../components/ui/Form'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pagination } from '../../components/ui/Pagination'
import { EmptyState } from '../../components/ui/States'
import { useI18n } from '../../i18n/context'
import { formatDate, formatFullDateTime, formatPhone, fullName } from '../../lib/format'
import { useFirstPageOnMissing, useListParams } from '../../lib/useListParams'

const FILTERS = ['search', 'branch'] as const

const ROLE_AVATAR: Record<StaffUser['role'], string> = {
  admin: 'bg-primary-100 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300',
  manager: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  branch: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
}

export function UsersPage() {
  const { t, tn, lang } = useI18n()
  const { user: me, branchesOn } = useAuthed()
  const toast = useToast()
  const confirm = useConfirm()
  const { values, page, setFilter, setPage } = useListParams(FILTERS)
  const { data, isLoading, isFetching, isPlaceholderData, error, refetch } = useUsers({ search: values.search, page })
  useFirstPageOnMissing(error, page, setPage)
  const remove = useDeleteUser()
  const branches = useBranches(branchesOn)
  // With branches: one branch's staff, or the head office's (on the page shown — a business has a handful of staff).
  const branch = branchesOn ? values.branch : ''
  const rows = branch
    ? data?.results.filter((user) => (branch === 'none' ? !user.branch : String(user.branch?.id) === branch))
    : data?.results

  const displayName = (user: StaffUser) => fullName(user.first_name, user.last_name) || formatPhone(user.phone_number)

  const askDelete = (user: StaffUser) =>
    void confirm({
      title: t('delete_user'),
      message: t('delete_user_confirm', { name: displayName(user) }),
      confirmLabel: t('yes_delete'),
      onConfirm: async () => {
        await remove.mutateAsync(user.id)
        toast.success(t('user_deleted'))
        if (data && data.results.length === 1 && page > 1) setPage(page - 1)
      },
    })

  const columns: Array<Column<StaffUser>> = [
    {
      key: 'user',
      header: t('user'),
      skeleton: 'w-44',
      cell: (user) => (
        <div className="flex items-center gap-3">
          <Avatar name={user.first_name || user.phone_number} secondary={user.last_name} colorClass={ROLE_AVATAR[user.role]} />
          <div className="min-w-0">
            <p className="flex items-center gap-2">
              <Link to={`/users/${user.id}/edit`} className="max-w-56 truncate font-semibold text-fg hover:text-primary-600 dark:hover:text-primary-400">
                {displayName(user)}
              </Link>
              {user.id === me.id && (
                <Badge tone="gray" size="xs">
                  {t('you')}
                </Badge>
              )}
            </p>
            <p className="text-xs text-muted tabular">ID: {user.id}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'phone',
      header: t('phone'),
      hideBelow: 'md',
      skeleton: 'w-28',
      cell: (user) => <span className="whitespace-nowrap text-fg-soft tabular">{formatPhone(user.phone_number)}</span>,
    },
    { key: 'role', header: t('role'), skeleton: 'w-24', cell: (user) => <RoleBadge role={user.role} /> },
    // With branches: where each one works — a branch, or the head office.
    ...(branchesOn
      ? [
          {
            key: 'branch',
            header: t('branch'),
            hideBelow: 'md' as const,
            skeleton: 'w-24',
            cell: (user: StaffUser) =>
              user.branch ? (
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-medium text-fg-soft">
                  <IconStore size={15} className="shrink-0 text-teal-600 dark:text-teal-300" />
                  {user.branch.name}
                </span>
              ) : (
                <span className="whitespace-nowrap text-muted">{t('head_office')}</span>
              ),
          },
        ]
      : []),
    {
      key: 'status',
      header: t('status'),
      hideBelow: 'sm',
      skeleton: 'w-20',
      cell: (user) => <ActiveBadge active={user.is_active} />,
    },
    {
      key: 'created',
      header: t('created'),
      hideBelow: 'lg',
      skeleton: 'w-24',
      cell: (user) => (
        <time dateTime={user.created_at} title={formatFullDateTime(user.created_at, lang)} className="whitespace-nowrap text-muted">
          {formatDate(user.created_at, lang)}
        </time>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('actions')}</span>,
      align: 'right',
      skeleton: 'w-16',
      cell: (user) => (
        <div className="flex items-center justify-end gap-1">
          <ButtonLink to={`/users/${user.id}/edit`} variant="ghost" size="icon-sm" title={t('edit')} aria-label={`${t('edit')}: ${displayName(user)}`}>
            <IconPencil size={16} />
          </ButtonLink>
          {user.id !== me.id && (
            <Button
              variant="danger-soft"
              size="icon-sm"
              title={t('delete')}
              aria-label={`${t('delete')}: ${displayName(user)}`}
              onClick={() => askDelete(user)}
            >
              <IconTrash size={16} />
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title={t('users_title')}
        description={data ? tn('users', data.count) : t('users_subtitle')}
        actions={
          <ButtonLink to="/users/new" variant="primary" icon={<IconPlus size={18} />}>
            {t('add_user')}
          </ButtonLink>
        }
      />
      <Card className="overflow-hidden">
        <div className={branchesOn ? 'flex flex-col gap-3 border-b border-line p-4 sm:flex-row' : 'border-b border-line p-4'}>
          <SearchInput
            className={branchesOn ? 'flex-1 sm:max-w-md' : 'max-w-md'}
            value={values.search}
            onSearch={(value) => setFilter('search', value)}
            placeholder={t('search_users')}
            loading={isFetching && isPlaceholderData}
          />
          {branchesOn && (
            <Select
              className="sm:w-56"
              aria-label={t('branch')}
              value={branch}
              onChange={(event) => setFilter('branch', event.target.value)}
            >
              <option value="">{t('users_all')}</option>
              <option value="none">{t('head_office')}</option>
              {branches.data?.map((item) => (
                <option key={item.id} value={String(item.id)}>
                  {item.is_active ? item.name : t('branch_inactive_suffix', { name: item.name })}
                </option>
              ))}
            </Select>
          )}
        </div>
        <DataTable
          caption={t('users_title')}
          columns={columns}
          rows={rows}
          rowKey={(user) => user.id}
          rowHref={(user) => `/users/${user.id}/edit`}
          loading={isLoading}
          fetching={isFetching && isPlaceholderData}
          error={error}
          onRetry={() => void refetch()}
          empty={<EmptyState icon={<IconUsersCog size={26} />} title={t('no_users')} />}
          mobileCard={(user) => (
            <Link to={`/users/${user.id}/edit`} className="flex items-center gap-3 px-4 py-3.5 active:bg-subtle">
              <Avatar name={user.first_name || user.phone_number} secondary={user.last_name} colorClass={ROLE_AVATAR[user.role]} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-fg">
                  {displayName(user)}
                  {user.id === me.id && <span className="ml-1.5 text-xs font-medium text-muted">({t('you')})</span>}
                </p>
                <p className="truncate text-[13px] text-muted tabular">{formatPhone(user.phone_number)}</p>
                {branchesOn && user.branch && (
                  <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[13px] font-medium text-teal-700 dark:text-teal-300">
                    <IconStore size={14} className="shrink-0" />
                    <span className="truncate">{user.branch.name}</span>
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <RoleBadge role={user.role} />
                {!user.is_active && <ActiveBadge active={false} />}
              </div>
            </Link>
          )}
          footer={
            // Filtered on this page by branch: the server's count would not be about the rows shown.
            data &&
            (!branch || data.pages > 1) && (
              <Pagination page={data.page} pages={data.pages} count={data.count} pageSize={PAGE_SIZE} onPageChange={setPage} />
            )
          }
        />
      </Card>
    </>
  )
}

import { PAGE_SIZE, useBranches, useOrders, useUnassignedCount } from '../../api/queries'
import { ORDER_SOURCES, ORDER_STATUSES, type OrderSource, type OrderStatus } from '../../api/types'
import { useAuthed } from '../../auth/session'
import { SOURCE_KEYS, STATUS_KEYS, STATUS_TONES } from '../../components/statusMeta'
import { IconOrders, IconStore } from '../../components/icons'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { FilterTab } from '../../components/ui/FilterTab'
import { SearchInput, Select } from '../../components/ui/Form'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pagination } from '../../components/ui/Pagination'
import { EmptyState } from '../../components/ui/States'
import { TONES } from '../../components/ui/styles'
import { useI18n } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { useFirstPageOnMissing, useListParams } from '../../lib/useListParams'
import { OrdersTable } from './OrdersTable'

const FILTERS = ['status', 'source', 'branch', 'search'] as const

export function OrdersPage() {
  const { t, tn } = useI18n()
  const { headOffice, dispatch } = useAuthed()
  const { values, page, setFilter, setFilters, setPage, reset, active } = useListParams(FILTERS)
  const status = ORDER_STATUSES.includes(values.status as OrderStatus) ? values.status : ''
  const source = ORDER_SOURCES.includes(values.source as OrderSource) ? values.source : ''
  // The head office: one branch's orders, or `none` — those without a branch.
  const branch = headOffice && /^(none|\d+)$/.test(values.branch) ? values.branch : ''
  const query = { status, source, branch, search: values.search, page, page_size: PAGE_SIZE }
  const branches = useBranches(headOffice)
  const unassigned = useUnassignedCount(dispatch).data ?? 0
  const waitingShown = branch === 'none' && status === 'ordered'
  const { data, isLoading, isFetching, isPlaceholderData, error, refetch } = useOrders(query)
  useFirstPageOnMissing(error, page, setPage)

  const sourceSelect = (
    <Select
      className={headOffice ? 'min-w-0 sm:w-56' : 'sm:w-56'}
      aria-label={t('source')}
      value={source}
      onChange={(event) => setFilter('source', event.target.value)}
    >
      <option value="">{t('all_sources')}</option>
      {ORDER_SOURCES.map((value) => (
        <option key={value} value={value}>
          {t(SOURCE_KEYS[value])}
        </option>
      ))}
    </Select>
  )

  return (
    <>
      <PageHeader
        title={t('orders_title')}
        description={data ? tn('orders', data.count) : t('orders_subtitle')}
      />

      {/* A phone shows the orders as separate cards: the frame of the table goes away there. */}
      <Card className="overflow-hidden max-md:overflow-visible max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:shadow-none">
        <div className="space-y-3 border-b border-line p-4 max-md:mb-3 max-md:border-0 max-md:p-0">
          {/* Dispatch mode: the new orders waiting for a branch, one tap away. */}
          {dispatch && (unassigned > 0 || waitingShown) && (
            <button
              type="button"
              aria-pressed={waitingShown}
              onClick={() => setFilters(waitingShown ? { branch: '', status: '' } : { branch: 'none', status: 'ordered' })}
              className={cn(
                'flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors',
                waitingShown
                  ? 'border-amber-400 bg-amber-100 ring-2 ring-amber-400/40 dark:border-amber-400/60 dark:bg-amber-500/20'
                  : 'border-amber-200 bg-amber-50 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:hover:bg-amber-500/15',
              )}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
                <IconStore size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-amber-950 dark:text-amber-100">{t('branch_none')}</span>
                <span className="block text-[13px] text-amber-800 dark:text-amber-200">{t('unassigned_hint')}</span>
              </span>
              <span className="min-w-8 rounded-full bg-amber-500 px-2.5 py-1 text-center text-sm font-bold text-white tabular">
                {unassigned}
              </span>
            </button>
          )}
          <fieldset className="-mx-1 flex min-w-0 gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
            <legend className="sr-only">{t('status')}</legend>
            <FilterTab active={!status} onClick={() => setFilter('status', '')} label={t('all_statuses')} />
            {ORDER_STATUSES.map((value) => (
              <FilterTab
                key={value}
                active={status === value}
                onClick={() => setFilter('status', value)}
                label={t(STATUS_KEYS[value])}
                dot={TONES[STATUS_TONES[value]].dot}
              />
            ))}
          </fieldset>
          <div className="flex flex-col gap-3 sm:flex-row">
            <SearchInput
              className="flex-1"
              value={values.search}
              onSearch={(value) => setFilter('search', value)}
              placeholder={t('search_orders')}
              loading={isFetching && isPlaceholderData}
            />
            {headOffice ? (
              // A phone: the branch and the source side by side.
              <div className="grid grid-cols-2 gap-3 sm:contents">
                <Select
                  className="min-w-0 sm:w-56"
                  aria-label={t('branch')}
                  value={branch}
                  onChange={(event) => setFilter('branch', event.target.value)}
                >
                  <option value="">{t('all_branches')}</option>
                  <option value="none">{t('branch_none')}</option>
                  {branches.data?.map((item) => (
                    <option key={item.id} value={String(item.id)}>
                      {item.is_active ? item.name : t('branch_inactive_suffix', { name: item.name })}
                    </option>
                  ))}
                </Select>
                {sourceSelect}
              </div>
            ) : (
              sourceSelect
            )}
          </div>
        </div>

        <OrdersTable
          caption={t('orders_title')}
          orders={data?.results}
          loading={isLoading}
          fetching={isFetching && isPlaceholderData}
          error={error}
          onRetry={() => void refetch()}
          empty={
            <EmptyState
              icon={<IconOrders size={26} />}
              title={t('no_orders')}
              description={active ? t('no_orders_hint') : undefined}
              action={
                active ? (
                  <Button variant="secondary" size="sm" onClick={reset}>
                    {t('reset_filters')}
                  </Button>
                ) : undefined
              }
            />
          }
          footer={
            data && (
              <Pagination
                page={data.page}
                pages={data.pages}
                count={data.count}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
                className="max-md:mt-2 max-md:border-0 max-md:px-0"
              />
            )
          }
        />
      </Card>
    </>
  )
}

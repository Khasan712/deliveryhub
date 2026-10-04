import { PAGE_SIZE, useOrders } from '../../api/queries'
import { ORDER_SOURCES, ORDER_STATUSES, type OrderSource, type OrderStatus } from '../../api/types'
import { SOURCE_KEYS, STATUS_KEYS, STATUS_TONES } from '../../components/statusMeta'
import { IconOrders } from '../../components/icons'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { FilterTab } from '../../components/ui/FilterTab'
import { SearchInput, Select } from '../../components/ui/Form'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pagination } from '../../components/ui/Pagination'
import { EmptyState } from '../../components/ui/States'
import { TONES } from '../../components/ui/styles'
import { useI18n } from '../../i18n/context'
import { useFirstPageOnMissing, useListParams } from '../../lib/useListParams'
import { OrdersTable } from './OrdersTable'

const FILTERS = ['status', 'source', 'search'] as const

export function OrdersPage() {
  const { t, tn } = useI18n()
  const { values, page, setFilter, setPage, reset, active } = useListParams(FILTERS)
  const status = ORDER_STATUSES.includes(values.status as OrderStatus) ? values.status : ''
  const source = ORDER_SOURCES.includes(values.source as OrderSource) ? values.source : ''
  const query = { status, source, search: values.search, page, page_size: PAGE_SIZE }
  const { data, isLoading, isFetching, isPlaceholderData, error, refetch } = useOrders(query)
  useFirstPageOnMissing(error, page, setPage)

  return (
    <>
      <PageHeader
        title={t('orders_title')}
        description={data ? tn('orders', data.count) : t('orders_subtitle')}
      />

      <Card className="overflow-hidden">
        <div className="space-y-3 border-b border-line p-4">
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
            <Select
              className="sm:w-56"
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
              <Pagination page={data.page} pages={data.pages} count={data.count} pageSize={PAGE_SIZE} onPageChange={setPage} />
            )
          }
        />
      </Card>
    </>
  )
}

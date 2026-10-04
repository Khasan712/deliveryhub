import { Link, useNavigate } from 'react-router'
import { PAGE_SIZE, useCategories, useDeleteProduct, useFrozenCount, useProducts } from '../../api/queries'
import type { Product } from '../../api/types'
import { FrozenBadge, Money } from '../../components/badges'
import { useConfirm, useToast } from '../../components/feedback/feedback'
import { IconArrowRight, IconPencil, IconPlus, IconProducts, IconSnowflake, IconTrash } from '../../components/icons'
import { Badge } from '../../components/ui/Badge'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { FilterTab } from '../../components/ui/FilterTab'
import { SearchInput, Select } from '../../components/ui/Form'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pagination } from '../../components/ui/Pagination'
import { EmptyState } from '../../components/ui/States'
import { useI18n } from '../../i18n/context'
import { formatDate, formatFullDateTime } from '../../lib/format'
import { useFirstPageOnMissing, useListParams } from '../../lib/useListParams'
import { FreezeButton } from './FreezeButton'
import { ProductThumb } from './ProductThumb'
import { useFreezeProduct } from './useFreezeProduct'

const FILTERS = ['search', 'category', 'frozen'] as const

export function ProductsPage() {
  const { t, tn, name, lang } = useI18n()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { values, page, setFilter, setPage, reset, active } = useListParams(FILTERS)
  // ?frozen=true — only frozen products, ?frozen=false — only the ones on sale.
  const frozen = values.frozen === 'true' ? true : values.frozen === 'false' ? false : undefined
  const { data, isLoading, isFetching, isPlaceholderData, error, refetch } = useProducts({
    search: values.search,
    category: values.category,
    frozen,
    page,
  })
  useFirstPageOnMissing(error, page, setPage)
  const categories = useCategories()
  const frozenCount = useFrozenCount().data
  const remove = useDeleteProduct()
  const freeze = useFreezeProduct()

  const askDelete = (product: Product) =>
    void confirm({
      title: t('delete_product'),
      message: (
        <span className="flex flex-col items-center gap-3">
          <ProductThumb src={product.image} size="lg" />
          {t('delete_product_confirm', { name: name(product) })}
        </span>
      ),
      confirmLabel: t('yes_delete'),
      onConfirm: async () => {
        await remove.mutateAsync(product.id)
        toast.success(t('product_deleted'))
        // The last item of a page was removed → go one page back.
        if (data && data.results.length === 1 && page > 1) setPage(page - 1)
      },
    })

  const columns: Array<Column<Product>> = [
    {
      key: 'product',
      header: t('product'),
      skeleton: 'w-52',
      cell: (product) => {
        const other = lang === 'ru' ? product.name_uz : product.name_ru
        return (
          <div className="flex items-center gap-3.5">
            <ProductThumb src={product.image} frozen={product.frozen} />
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <Link
                  to={`/products/${product.id}/edit`}
                  className="block max-w-72 truncate font-semibold text-fg hover:text-primary-600 dark:hover:text-primary-400"
                >
                  {name(product)}
                </Link>
                {product.frozen && <FrozenBadge />}
              </div>
              {other && other !== name(product) && <p className="max-w-72 truncate text-xs text-muted">{other}</p>}
            </div>
          </div>
        )
      },
    },
    {
      key: 'category',
      header: t('category'),
      hideBelow: 'md',
      skeleton: 'w-24',
      cell: (product) =>
        product.category ? (
          <Badge tone="blue">{name(product.category)}</Badge>
        ) : (
          <span className="text-faint">{t('no_category')}</span>
        ),
    },
    {
      key: 'unit',
      header: t('measure'),
      hideBelow: 'xl',
      skeleton: 'w-12',
      cell: (product) => <span className="text-fg-soft">{product.unit ? name(product.unit) : '—'}</span>,
    },
    {
      key: 'price',
      header: t('price'),
      align: 'right',
      skeleton: 'w-20',
      cell: (product) => <Money value={product.price} className="whitespace-nowrap font-semibold text-fg" />,
    },
    {
      key: 'created',
      header: t('created'),
      hideBelow: 'lg',
      skeleton: 'w-24',
      cell: (product) => (
        <time dateTime={product.created_at} title={formatFullDateTime(product.created_at, lang)} className="whitespace-nowrap text-muted">
          {formatDate(product.created_at, lang)}
        </time>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('actions')}</span>,
      align: 'right',
      skeleton: 'w-24',
      cell: (product) => (
        <div className="flex items-center justify-end gap-1">
          <FreezeButton product={product} onToggle={freeze.setFrozen} pending={freeze.isPending(product.id)} />
          <ButtonLink
            to={`/products/${product.id}/edit`}
            variant="ghost"
            size="icon-sm"
            aria-label={`${t('edit')}: ${name(product)}`}
            title={t('edit')}
          >
            <IconPencil size={16} />
          </ButtonLink>
          <Button
            variant="danger-soft"
            size="icon-sm"
            aria-label={`${t('delete')}: ${name(product)}`}
            title={t('delete')}
            onClick={() => askDelete(product)}
          >
            <IconTrash size={16} />
          </Button>
        </div>
      ),
    },
  ]

  // The "Frozen" tab without other filters has its own explanation.
  const onlyFrozen = frozen === true && !values.search && !values.category

  return (
    <>
      <PageHeader
        title={t('products_title')}
        description={data ? tn('products', data.count) : t('products_subtitle')}
        actions={
          <ButtonLink to="/products/new" variant="primary" icon={<IconPlus size={18} />}>
            {t('add_product')}
          </ButtonLink>
        }
      />
      <Card className="overflow-hidden">
        <div className="space-y-3 border-b border-line p-4">
          <fieldset className="-mx-1 flex min-w-0 gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
            <legend className="sr-only">{t('availability')}</legend>
            <FilterTab active={frozen === undefined} onClick={() => setFilter('frozen', '')} label={t('products_filter_all')} />
            <FilterTab
              active={frozen === false}
              onClick={() => setFilter('frozen', 'false')}
              label={t('products_on_sale')}
              dot="bg-emerald-500"
            />
            <FilterTab
              active={frozen === true}
              onClick={() => setFilter('frozen', 'true')}
              label={t('products_frozen')}
              icon={<IconSnowflake size={14} className="text-sky-500" />}
              count={frozenCount}
            />
          </fieldset>
          <div className="flex flex-col gap-3 sm:flex-row">
            <SearchInput
              className="flex-1"
              value={values.search}
              onSearch={(value) => setFilter('search', value)}
              placeholder={t('search_products')}
              loading={isFetching && isPlaceholderData}
            />
            <Select
              className="sm:w-60"
              aria-label={t('category')}
              value={values.category}
              onChange={(event) => setFilter('category', event.target.value)}
            >
              <option value="">{t('all_categories')}</option>
              {categories.data?.map((category) => (
                <option key={category.id} value={String(category.id)}>
                  {name(category)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <DataTable
          caption={t('products_title')}
          columns={columns}
          rows={data?.results}
          rowKey={(product) => product.id}
          rowHref={(product) => `/products/${product.id}/edit`}
          rowClassName={(product) => (product.frozen ? 'bg-sky-50/40 dark:bg-sky-500/[0.04]' : undefined)}
          loading={isLoading}
          fetching={isFetching && isPlaceholderData}
          error={error}
          onRetry={() => void refetch()}
          empty={
            onlyFrozen ? (
              <EmptyState
                icon={<IconSnowflake size={26} />}
                title={t('no_frozen_products')}
                description={t('no_frozen_products_hint')}
              />
            ) : (
              <EmptyState
                icon={<IconProducts size={26} />}
                title={t('no_products')}
                action={
                  active ? (
                    <Button variant="secondary" size="sm" onClick={reset}>
                      {t('reset_filters')}
                    </Button>
                  ) : (
                    <ButtonLink to="/products/new" size="sm" variant="primary" iconRight={<IconArrowRight size={16} />}>
                      {t('add_first_product')}
                    </ButtonLink>
                  )
                }
              />
            )
          }
          mobileCard={(product) => (
            <div className="flex items-center gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => navigate(`/products/${product.id}/edit`)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <ProductThumb src={product.image} frozen={product.frozen} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-fg">{name(product)}</span>
                  <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] text-muted">
                    {product.frozen && <FrozenBadge compact />}
                    <span className="truncate">
                      <Money value={product.price} className="font-semibold text-fg-soft" />
                      {product.category && ` · ${name(product.category)}`}
                    </span>
                  </span>
                </span>
              </button>
              <FreezeButton product={product} onToggle={freeze.setFrozen} pending={freeze.isPending(product.id)} />
              <Button
                variant="danger-soft"
                size="icon-sm"
                aria-label={`${t('delete')}: ${name(product)}`}
                onClick={() => askDelete(product)}
              >
                <IconTrash size={16} />
              </Button>
            </div>
          )}
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

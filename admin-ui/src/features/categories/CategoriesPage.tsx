import { useState } from 'react'
import { Link } from 'react-router'
import { useCategories, useDeleteCategory, useSaveCategory } from '../../api/queries'
import type { Category } from '../../api/types'
import { NamePairModal } from '../../components/NamePairModal'
import { useConfirm, useToast } from '../../components/feedback/feedback'
import { IconPencil, IconPlus, IconTag, IconTrash } from '../../components/icons'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { SearchInput } from '../../components/ui/Form'
import { PageHeader } from '../../components/ui/PageHeader'
import { EmptyState } from '../../components/ui/States'
import { useI18n } from '../../i18n/context'
import { useListParams } from '../../lib/useListParams'

const FILTERS = ['search'] as const

export function CategoriesPage() {
  const { t, tn, name, lang } = useI18n()
  const toast = useToast()
  const confirm = useConfirm()
  const { values, setFilter } = useListParams(FILTERS)
  const { data, isLoading, isFetching, isPlaceholderData, error, refetch } = useCategories(values.search)
  const save = useSaveCategory()
  const remove = useDeleteCategory()
  const [editing, setEditing] = useState<Category | 'new' | null>(null)

  const askDelete = (category: Category) =>
    void confirm({
      title: t('delete_category'),
      message: (
        <>
          {t('delete_category_confirm', { name: name(category) })}
          {!!category.products_count && (
            <span className="mt-2 block">{t('category_has_products', { count: tn('products', category.products_count) })}</span>
          )}
        </>
      ),
      confirmLabel: t('yes_delete'),
      onConfirm: async () => {
        await remove.mutateAsync(category.id)
        toast.success(t('category_deleted'))
      },
    })

  const columns: Array<Column<Category>> = [
    {
      key: 'name',
      header: t('category'),
      skeleton: 'w-48',
      cell: (category) => {
        const other = lang === 'ru' ? category.name_uz : category.name_ru
        return (
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-300">
              <IconTag size={18} />
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-fg">{name(category)}</p>
              {other && other !== name(category) && <p className="truncate text-xs text-muted">{other}</p>}
            </div>
          </div>
        )
      },
    },
    {
      key: 'products',
      header: t('nav_products'),
      skeleton: 'w-20',
      cell: (category) => (
        <Link to={`/products?category=${category.id}`} className="inline-flex" aria-label={`${name(category)}: ${tn('products', category.products_count ?? 0)}`}>
          <Badge tone={category.products_count ? 'violet' : 'gray'} className="hover:opacity-80">
            {tn('products', category.products_count ?? 0)}
          </Badge>
        </Link>
      ),
    },
    {
      key: 'id',
      header: t('id'),
      hideBelow: 'md',
      skeleton: 'w-10',
      cell: (category) => <span className="text-muted tabular">#{category.id}</span>,
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('actions')}</span>,
      align: 'right',
      skeleton: 'w-16',
      cell: (category) => (
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon-sm" title={t('edit')} aria-label={`${t('edit')}: ${name(category)}`} onClick={() => setEditing(category)}>
            <IconPencil size={16} />
          </Button>
          <Button
            variant="danger-soft"
            size="icon-sm"
            title={t('delete')}
            aria-label={`${t('delete')}: ${name(category)}`}
            onClick={() => askDelete(category)}
          >
            <IconTrash size={16} />
          </Button>
        </div>
      ),
    },
  ]

  const current = editing && editing !== 'new' ? editing : null

  return (
    <>
      <PageHeader
        title={t('categories_title')}
        description={data ? tn('categories', data.length) : t('categories_subtitle')}
        actions={
          <Button icon={<IconPlus size={18} />} onClick={() => setEditing('new')}>
            {t('add_category')}
          </Button>
        }
      />
      <Card className="overflow-hidden">
        <div className="border-b border-line p-4">
          <SearchInput
            className="max-w-md"
            value={values.search}
            onSearch={(value) => setFilter('search', value)}
            placeholder={t('search_categories')}
            loading={isFetching && isPlaceholderData}
          />
        </div>
        <DataTable
          caption={t('categories_title')}
          columns={columns}
          rows={data}
          rowKey={(category) => category.id}
          loading={isLoading}
          fetching={isFetching && isPlaceholderData}
          error={error}
          onRetry={() => void refetch()}
          empty={
            <EmptyState
              icon={<IconTag size={26} />}
              title={t('no_categories')}
              action={
                !values.search && (
                  <Button size="sm" icon={<IconPlus size={16} />} onClick={() => setEditing('new')}>
                    {t('add_category')}
                  </Button>
                )
              }
            />
          }
        />
      </Card>

      <NamePairModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={current ? t('edit_category') : t('create_category')}
        submitLabel={current ? t('save_changes') : t('create')}
        initial={current ?? undefined}
        icon={
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-300">
            <IconTag size={22} />
          </span>
        }
        onSubmit={async (body) => {
          await save.mutateAsync({ id: current?.id, body })
          toast.success(current ? t('category_saved') : t('category_created'))
        }}
      />
    </>
  )
}

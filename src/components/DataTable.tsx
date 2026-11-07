import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export interface Column<T> {
  key: string
  header: string
  align?: 'left' | 'right'
  numeric?: boolean
  render: (row: T) => ReactNode
}

interface Props<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  emptyText?: string
}

export default function DataTable<T>({ columns, rows, rowKey, emptyText }: Props<T>) {
  const { t } = useTranslation()
  const alignClass = (c: Column<T>) => (c.numeric || c.align === 'right' ? 'text-right' : 'text-left')

  return (
    <div className="overflow-x-auto rounded-lg border border-[#e2e8f0] bg-surface-container-lowest">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="h-10 border-b border-[#e2e8f0] bg-[#f8fafc]">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`px-4 text-[11px] font-semibold uppercase tracking-wide text-[#64748b] ${alignClass(c)}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        {rows.length > 0 && (
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="h-12 border-b border-[#f1f5f9] last:border-b-0 hover:bg-[#f8fafc]">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-4 ${alignClass(c)} ${c.numeric ? 'tabular-nums' : ''}`}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        )}
      </table>
      {rows.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-on-surface-variant">{emptyText ?? t('common.noData')}</p>
      )}
    </div>
  )
}

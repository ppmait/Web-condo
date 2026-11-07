import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import DataTable from './DataTable'

interface Row {
  id: string
  unit: string
  balance: string
}

const columns = [
  { key: 'unit', header: 'ห้อง', render: (r: Row) => r.unit },
  { key: 'balance', header: 'ยอดคงเหลือ', numeric: true, render: (r: Row) => r.balance },
]

afterEach(async () => {
  await i18n.changeLanguage('th')
})

describe('DataTable', () => {
  it('renders headers and rows', () => {
    const rows = [{ id: '1', unit: 'A-1402', balance: '1,200' }]
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />)
    expect(screen.getByRole('columnheader', { name: 'ห้อง' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'A-1402' })).toBeInTheDocument()
  })

  it('right-aligns numeric columns with tabular figures, including negative and zero', () => {
    const rows = [
      { id: '1', unit: 'A-1', balance: '-1,200' },
      { id: '2', unit: 'A-2', balance: '0' },
    ]
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />)
    for (const text of ['-1,200', '0']) {
      const cell = screen.getByRole('cell', { name: text })
      expect(cell).toHaveClass('text-right')
      expect(cell).toHaveClass('tabular-nums')
    }
    expect(screen.getByRole('columnheader', { name: 'ยอดคงเหลือ' })).toHaveClass('text-right')
  })

  it('shows the empty text instead of an empty table', () => {
    render(<DataTable columns={columns} rows={[]} rowKey={(r: Row) => r.id} />)
    expect(screen.getByText('ไม่มีข้อมูล')).toBeInTheDocument()
    expect(screen.queryAllByRole('row').length).toBeLessThanOrEqual(1)
  })

  it('shows the English empty text and honours a custom emptyText', async () => {
    await i18n.changeLanguage('en')
    const { unmount } = render(<DataTable columns={columns} rows={[]} rowKey={(r: Row) => r.id} />)
    expect(screen.getByText('No data')).toBeInTheDocument()
    unmount()
    render(<DataTable columns={columns} rows={[]} rowKey={(r: Row) => r.id} emptyText="ยังไม่มีบิล" />)
    expect(screen.getByText('ยังไม่มีบิล')).toBeInTheDocument()
  })

  it('keeps each row in its own row element', () => {
    const rows = [
      { id: '1', unit: 'A-1', balance: '1' },
      { id: '2', unit: 'A-2', balance: '2' },
    ]
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />)
    const dataRows = screen.getAllByRole('row').slice(1)
    expect(dataRows).toHaveLength(2)
    expect(within(dataRows[1]).getByText('A-2')).toBeInTheDocument()
  })
})

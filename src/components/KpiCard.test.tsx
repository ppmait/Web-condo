import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import KpiCard from './KpiCard'

describe('KpiCard', () => {
  it('shows label, value and delta', () => {
    render(<KpiCard label="ยอดค้างชำระ" value="฿457,300" delta={{ text: '+2.1%', trend: 'up' }} />)
    expect(screen.getByText('ยอดค้างชำระ')).toBeInTheDocument()
    expect(screen.getByText('฿457,300')).toHaveClass('tabular-nums')
    expect(screen.getByText('+2.1%')).toBeInTheDocument()
  })

  it('omits the delta section when no delta is given', () => {
    render(<KpiCard label="พัสดุคงค้าง" value="12" />)
    expect(screen.queryByTestId('kpi-delta')).not.toBeInTheDocument()
  })
})

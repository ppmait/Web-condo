import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Button from './Button'

describe('Button', () => {
  it('defaults to the primary variant and type=button', () => {
    render(<Button>บันทึก</Button>)
    const btn = screen.getByRole('button', { name: 'บันทึก' })
    expect(btn).toHaveClass('bg-primary-container')
    expect(btn).toHaveAttribute('type', 'button')
  })

  it('renders the secondary and success variants with different backgrounds', () => {
    render(
      <>
        <Button variant="secondary">รอง</Button>
        <Button variant="success">สำเร็จ</Button>
      </>,
    )
    expect(screen.getByRole('button', { name: 'รอง' })).toHaveClass('bg-surface-container-lowest')
    expect(screen.getByRole('button', { name: 'สำเร็จ' })).toHaveClass('bg-[#0d9488]')
  })

  it('calls onClick', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>กด</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'กด' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does not call onClick when disabled', async () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        กด
      </Button>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'กด' }))
    expect(onClick).not.toHaveBeenCalled()
  })
})

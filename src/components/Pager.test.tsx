import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import '../i18n'
import Pager from './Pager'

describe('Pager', () => {
  it('renders nothing when there is a single page', () => {
    const { container } = render(<Pager page={1} pageCount={1} onChange={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the position and disables previous on the first page', async () => {
    const onChange = vi.fn()
    render(<Pager page={1} pageCount={3} onChange={onChange} />)
    expect(screen.getByText('หน้า 1 จาก 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ก่อนหน้า' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'ถัดไป' }))
    expect(onChange).toHaveBeenCalledWith(2)
  })

  it('goes back and disables next on the last page', async () => {
    const onChange = vi.fn()
    render(<Pager page={3} pageCount={3} onChange={onChange} />)
    expect(screen.getByRole('button', { name: 'ถัดไป' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'ก่อนหน้า' }))
    expect(onChange).toHaveBeenCalledWith(2)
  })
})

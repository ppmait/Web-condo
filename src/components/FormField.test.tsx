import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import FormField from './FormField'

describe('FormField', () => {
  it('focuses the input when the label is clicked', async () => {
    render(<FormField label="เลขห้อง">{(a) => <input {...a} />}</FormField>)
    await userEvent.click(screen.getByText('เลขห้อง'))
    expect(screen.getByLabelText('เลขห้อง')).toHaveFocus()
  })

  it('shows the error, marks the input invalid and links it with aria-describedby', () => {
    render(
      <FormField label="จำนวนเงิน" error="ต้องมากกว่า 0">
        {(a) => <input {...a} />}
      </FormField>,
    )
    const input = screen.getByLabelText('จำนวนเงิน')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('ต้องมากกว่า 0')
  })

  it('is valid and has no description without an error', () => {
    render(<FormField label="หมายเหตุ">{(a) => <input {...a} />}</FormField>)
    const input = screen.getByLabelText('หมายเหตุ')
    expect(input).toHaveAttribute('aria-invalid', 'false')
    expect(input).not.toHaveAttribute('aria-describedby')
  })
})

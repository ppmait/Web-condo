import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import '../i18n'
import ConfirmDialog from './ConfirmDialog'

const setup = (over: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) => {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <ConfirmDialog open title="ลบห้องชุด" message="ต้องการลบห้อง A-1204 ใช่ไหม" confirmLabel="ลบ" onConfirm={onConfirm} onCancel={onCancel} {...over}>
      {over.children}
    </ConfirmDialog>,
  )
  return { onConfirm, onCancel }
}

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    setup({ open: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the title, the message and both buttons', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'ลบห้องชุด' })).toBeInTheDocument()
    expect(screen.getByText('ต้องการลบห้อง A-1204 ใช่ไหม')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ลบ' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ยกเลิก' })).toBeInTheDocument()
  })

  it('confirms and cancels', async () => {
    const { onConfirm, onCancel } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'ลบ' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('cancels on Escape', async () => {
    const { onCancel, onConfirm } = setup()
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('disables the confirm button while pending so it cannot be pressed twice', async () => {
    const { onConfirm } = setup({ pending: true })
    const confirm = screen.getByRole('button', { name: 'ลบ' })
    expect(confirm).toBeDisabled()
    await userEvent.click(confirm)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('uses a custom cancel label and shows extra content (children)', () => {
    setup({ cancelLabel: 'ไม่ลบ', children: <label>เหตุผล<input /></label> })
    expect(screen.getByRole('button', { name: 'ไม่ลบ' })).toBeInTheDocument()
    expect(screen.getByLabelText('เหตุผล')).toBeInTheDocument()
  })
})

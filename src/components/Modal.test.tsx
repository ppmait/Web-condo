import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import Modal from './Modal'

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        เปิด
      </button>
      <Modal open={open} title="เพิ่มพัสดุ" onClose={() => setOpen(false)}>
        <p>เนื้อหา</p>
      </Modal>
    </>
  )
}

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(
      <Modal open={false} title="เพิ่มพัสดุ" onClose={() => {}}>
        x
      </Modal>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders an accessible dialog with its title when open', () => {
    render(
      <Modal open title="เพิ่มพัสดุ" onClose={() => {}}>
        เนื้อหา
      </Modal>,
    )
    const dialog = screen.getByRole('dialog', { name: 'เพิ่มพัสดุ' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    render(
      <Modal open title="t" onClose={onClose}>
        x
      </Modal>,
    )
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on backdrop click but not on content click', async () => {
    const onClose = vi.fn()
    render(
      <Modal open title="t" onClose={onClose}>
        <p>เนื้อหา</p>
      </Modal>,
    )
    await userEvent.click(screen.getByText('เนื้อหา'))
    expect(onClose).not.toHaveBeenCalled()
    await userEvent.click(screen.getByTestId('modal-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('moves focus into the dialog and returns it to the opener on close', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'เปิด' })
    await user.click(opener)
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })
})

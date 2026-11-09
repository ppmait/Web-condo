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

  it('keeps Tab and Shift+Tab focus inside the dialog', async () => {
    const user = userEvent.setup()
    render(
      <>
        <button type="button">นอกก่อน</button>
        <Modal open title="t" onClose={() => {}}>
          <button type="button">A</button>
          <button type="button">B</button>
        </Modal>
        <button type="button">นอกหลัง</button>
      </>,
    )
    const dialog = screen.getByRole('dialog')
    for (let i = 0; i < 6; i++) {
      await user.tab()
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    }
    for (let i = 0; i < 6; i++) {
      await user.tab({ shift: true })
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    }
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

describe('Modal stacked on another Modal', () => {
  function Stack() {
    const [inner, setInner] = useState(false)
    const [outer, setOuter] = useState(true)
    return (
      <Modal open={outer} title="ด้านนอก" onClose={() => setOuter(false)}>
        <button type="button" onClick={() => setInner(true)}>
          เปิดด้านใน
        </button>
        <Modal open={inner} title="ด้านใน" onClose={() => setInner(false)}>
          <button type="button">ปุ่มแรก</button>
          <button type="button">ปุ่มสอง</button>
        </Modal>
      </Modal>
    )
  }

  it('closes only the top one on Escape, and the one below on the next Escape', async () => {
    const user = userEvent.setup()
    render(<Stack />)
    await user.click(screen.getByRole('button', { name: 'เปิดด้านใน' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(2)
    await user.keyboard('{Escape}')
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: 'ด้านนอก' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps Tab inside the top one and lets it reach every control', async () => {
    const user = userEvent.setup()
    render(<Stack />)
    await user.click(screen.getByRole('button', { name: 'เปิดด้านใน' }))
    const inner = screen.getByRole('dialog', { name: 'ด้านใน' })
    const reached = new Set<string>()
    for (let i = 0; i < 6; i++) {
      await user.tab()
      expect(inner.contains(document.activeElement)).toBe(true)
      reached.add(document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent ?? '')
    }
    expect(reached.has('ปุ่มแรก') && reached.has('ปุ่มสอง')).toBe(true)
  })

  it('gives the focus back to the dialog below when the top one closes', async () => {
    const user = userEvent.setup()
    render(<Stack />)
    await user.click(screen.getByRole('button', { name: 'เปิดด้านใน' }))
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: 'เปิดด้านใน' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('dialog', { name: 'ด้านนอก' }).contains(document.activeElement)).toBe(true)
  })
})

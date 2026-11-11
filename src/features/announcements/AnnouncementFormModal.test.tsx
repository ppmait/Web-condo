import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n'
import { renderAnnouncements } from '../../test/renderAnnouncements'
import AnnouncementFormModal from './AnnouncementFormModal'

afterEach(async () => {
  vi.restoreAllMocks()
  await i18n.changeLanguage('th')
})

describe('AnnouncementFormModal', () => {
  it('validates empty form, shows error message, marks aria-invalid and focuses first invalid field', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    await renderAnnouncements(<AnnouncementFormModal onClose={onClose} />, { as: 'juristic' })

    const saveBtn = screen.getByRole('button', { name: 'บันทึกประกาศ' })
    await user.click(saveBtn)

    expect(screen.getByText('กรุณากรอกข้อมูลให้ครบถ้วน')).toBeInTheDocument()
    const titleInput = screen.getByLabelText('หัวข้อประกาศ')
    expect(titleInput).toHaveAttribute('aria-invalid', 'true')
    expect(document.activeElement).toBe(titleInput)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('rejects title longer than 100 characters and body longer than 2000 characters', async () => {
    const user = userEvent.setup()
    await renderAnnouncements(<AnnouncementFormModal onClose={vi.fn()} />, { as: 'juristic' })

    const titleInput = screen.getByLabelText('หัวข้อประกาศ')
    await user.click(titleInput)
    await user.paste('a'.repeat(101))

    const bodyInput = screen.getByLabelText('เนื้อหาประกาศ')
    await user.click(bodyInput)
    await user.paste('b'.repeat(2001))

    await user.click(screen.getByRole('button', { name: 'บันทึกประกาศ' }))
    expect(screen.getByText('กรุณาระบุหัวข้อประกาศ (ไม่เกิน 100 ตัวอักษร)')).toBeInTheDocument()
    expect(screen.getByText('กรุณาระบุเนื้อหาประกาศ (ไม่เกิน 2,000 ตัวอักษร)')).toBeInTheDocument()
  })

  it('creates an announcement successfully with author name and closes modal', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { api } = await renderAnnouncements(<AnnouncementFormModal onClose={onClose} />, { as: 'juristic' })

    await user.type(screen.getByLabelText('หัวข้อประกาศ'), 'ประกาศเรื่องการบำรุงรักษาลิฟต์')
    await user.type(screen.getByLabelText('เนื้อหาประกาศ'), 'จะมีการตรวจเช็คลิฟต์โดยสารในวันพรุ่งนี้')
    await user.selectOptions(screen.getByLabelText('หมวดหมู่'), 'maintenance')
    await user.click(screen.getByLabelText('ปักหมุดประกาศนี้'))

    await user.click(screen.getByRole('button', { name: 'บันทึกประกาศ' }))
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce())

    const data = await api.load()
    const created = data.announcements.find((a) => a.title === 'ประกาศเรื่องการบำรุงรักษาลิฟต์')!
    expect(created).toBeDefined()
    expect(created.category).toBe('maintenance')
    expect(created.pinned).toBe(true)
    expect(created.authorName).toBe('สมหญิง นิติบุคคล')
  })
})

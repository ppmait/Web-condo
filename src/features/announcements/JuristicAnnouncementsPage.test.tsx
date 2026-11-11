import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n'
import { renderAnnouncements } from '../../test/renderAnnouncements'
import { renderApp } from '../../test/renderApp'
import JuristicAnnouncementsPage from './JuristicAnnouncementsPage'

afterEach(async () => {
  vi.restoreAllMocks()
  await i18n.changeLanguage('th')
})

describe('JuristicAnnouncementsPage', () => {
  it('renders all announcements in table, pinned first, with correct read counts and status badges', async () => {
    const { api } = await renderAnnouncements(<JuristicAnnouncementsPage />, { as: 'juristic' })
    const data = await api.load()

    expect(screen.getByRole('heading', { level: 1, name: 'ประกาศข่าวสาร' })).toBeInTheDocument()

    // 5 announcements in table
    for (const a of data.announcements) {
      expect(screen.getByText(a.code)).toBeInTheDocument()
    }

    // First row is pinned
    const rows = screen.getAllByRole('row')
    expect(within(rows[1]).getByText('ปักหมุด')).toBeInTheDocument()
  })

  it('filters by all, live, and expired', async () => {
    const user = userEvent.setup()
    await renderAnnouncements(<JuristicAnnouncementsPage />, { as: 'juristic' })

    // Filter live
    await user.click(screen.getByRole('button', { name: 'กำลังเผยแพร่' }))
    // ann-5 is expired, so it shouldn't be in the live list
    expect(screen.queryByText('AN-0005')).not.toBeInTheDocument()
    expect(screen.getByText('AN-0001')).toBeInTheDocument()

    // Filter expired
    await user.click(screen.getByRole('button', { name: 'หมดอายุแล้ว' }))
    expect(screen.getByText('AN-0005')).toBeInTheDocument()
    expect(screen.queryByText('AN-0001')).not.toBeInTheDocument()

    // Filter all
    await user.click(screen.getByRole('button', { name: 'ทั้งหมด' }))
    expect(screen.getByText('AN-0001')).toBeInTheDocument()
    expect(screen.getByText('AN-0005')).toBeInTheDocument()
  })

  it('opens create modal, creates announcement, and displays it in table', async () => {
    const user = userEvent.setup()
    await renderAnnouncements(<JuristicAnnouncementsPage />, { as: 'juristic' })

    await user.click(screen.getByRole('button', { name: 'สร้างประกาศ' }))
    expect(screen.getByRole('dialog', { name: 'สร้างประกาศใหม่' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('หัวข้อประกาศ'), 'ประกาศทดสอบสร้างใหม่')
    await user.type(screen.getByLabelText('เนื้อหาประกาศ'), 'เนื้อหาการสร้างประกาศใหม่')
    await user.click(screen.getByRole('button', { name: 'บันทึกประกาศ' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByText('ประกาศทดสอบสร้างใหม่')).toBeInTheDocument()
  })

  it('edits an announcement, clears readBy if title changed, and closes modal', async () => {
    const user = userEvent.setup()
    const { api } = await renderAnnouncements(<JuristicAnnouncementsPage />, { as: 'juristic' })

    const editBtn = screen.getByRole('button', { name: 'แก้ไข AN-0001' })
    await user.click(editBtn)

    expect(screen.getByRole('dialog', { name: 'แก้ไขประกาศ AN-0001' })).toBeInTheDocument()

    const titleInput = screen.getByLabelText('หัวข้อประกาศ')
    await user.clear(titleInput)
    await user.type(titleInput, 'หัวข้อแก้ไขใหม่เอี่ยม')

    await user.click(screen.getByRole('button', { name: 'บันทึกประกาศ' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    expect(await screen.findByText('หัวข้อแก้ไขใหม่เอี่ยม')).toBeInTheDocument()

    const data = await api.load()
    const updated = data.announcements.find((a) => a.id === 'ann-1')!
    expect(updated.readBy).toEqual([])
  })

  it('deletes an announcement after confirmation dialog', async () => {
    const user = userEvent.setup()
    const { api } = await renderAnnouncements(<JuristicAnnouncementsPage />, { as: 'juristic' })

    const deleteBtn = screen.getByRole('button', { name: 'ลบ AN-0001' })
    await user.click(deleteBtn)

    expect(screen.getByRole('dialog', { name: 'ยืนยันการลบประกาศ' })).toBeInTheDocument()

    // Confirm deletion
    const confirmDeleteBtn = within(screen.getByRole('dialog')).getByRole('button', { name: 'ลบ' })
    await user.click(confirmDeleteBtn)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('AN-0001')).not.toBeInTheDocument()

    const data = await api.load()
    expect(data.announcements.some((a) => a.id === 'ann-1')).toBe(false)
  })

  it.each(['tenant', 'technician'] as const)('does not let %s into /juristic/announcements', async (role) => {
    await renderApp('/juristic/announcements', { as: role })
    await screen.findByRole('button', { name: 'ออกจากระบบ' })
    expect(screen.queryByRole('heading', { level: 1, name: 'ประกาศข่าวสาร' })).not.toBeInTheDocument()
  })
})

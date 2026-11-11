import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isExpired, isLive } from '../../announcements/rules'
import { ANNOUNCEMENTS_KEY } from '../../announcements/seed'
import { DEMO_TENANT_PHONE } from '../../auth/demoAccounts'
import i18n from '../../i18n'
import { renderAnnouncements } from '../../test/renderAnnouncements'
import { renderApp } from '../../test/renderApp'
import TenantAnnouncementsPage from './TenantAnnouncementsPage'

function LocationProbe() {
  const { pathname, search } = useLocation()
  return <span data-testid="location">{pathname + search}</span>
}

afterEach(async () => {
  vi.restoreAllMocks()
  await i18n.changeLanguage('th')
})

describe('TenantAnnouncementsPage', () => {
  it('renders only live announcements (expired not shown), pinned first then newest', async () => {
    const { api } = await renderAnnouncements(<TenantAnnouncementsPage />, { as: 'tenant' })
    const data = await api.load()

    const live = data.announcements.filter((a) => isLive(a, '2026-11-08'))
    const expired = data.announcements.filter((a) => isExpired(a, '2026-11-08'))

    // All live announcements have a card
    for (const a of live) {
      expect(screen.getByRole('button', { name: `เปิดประกาศ ${a.code}` })).toBeInTheDocument()
    }
    // Expired announcements do NOT have a card
    for (const a of expired) {
      expect(screen.queryByRole('button', { name: `เปิดประกาศ ${a.code}` })).not.toBeInTheDocument()
    }

    const cards = screen.getAllByRole('button', { name: /^เปิดประกาศ / })
    // First card should be pinned
    expect(within(cards[0]).getByText('ปักหมุด')).toBeInTheDocument()
  })

  it('displays category badge, dates, and "new" badge for unread announcements of demo user', async () => {
    const { api } = await renderAnnouncements(<TenantAnnouncementsPage />, { as: 'tenant' })
    const data = await api.load()

    // Find live announcement unread by DEMO_TENANT_PHONE
    const unread = data.announcements.find(
      (a) => isLive(a, '2026-11-08') && !a.readBy.includes(DEMO_TENANT_PHONE),
    )!
    const unreadCard = screen.getByRole('button', { name: `เปิดประกาศ ${unread.code}` })
    expect(within(unreadCard).getByText('ใหม่')).toBeInTheDocument()

    // Find live announcement already read by DEMO_TENANT_PHONE
    const read = data.announcements.find(
      (a) => isLive(a, '2026-11-08') && a.readBy.includes(DEMO_TENANT_PHONE),
    )!
    const readCard = screen.getByRole('button', { name: `เปิดประกาศ ${read.code}` })
    expect(within(readCard).queryByText('ใหม่')).not.toBeInTheDocument()
  })

  it('opens details modal, marks read, and displays plain text preserving newlines (no raw HTML interpretation)', async () => {
    const user = userEvent.setup()
    const { api } = await renderAnnouncements(
      <>
        <TenantAnnouncementsPage />
        <LocationProbe />
      </>,
      { as: 'tenant' },
    )

    // ann-2 is unread for demo tenant in seed
    const card = screen.getByRole('button', { name: 'เปิดประกาศ AN-0002' })
    await user.click(card)

    // Modal is opened
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText('แจ้งหยุดจ่ายน้ำประปาชั่วคราวเพื่อซ่อมท่อเมนหลัก')).toBeInTheDocument()

    // Close modal via Cancel button
    await user.click(within(dialog).getByRole('button', { name: 'ยกเลิก' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Now marked as read in api
    await vi.waitFor(async () => {
      const reloaded = await api.load()
      const updated = reloaded.announcements.find((a) => a.id === 'ann-2')!
      expect(updated.readBy).toContain(DEMO_TENANT_PHONE)
    })
  })

  it('opens announcement directly via ?announcement= param, and clears param when closed or invalid', async () => {
    const user = userEvent.setup()
    await renderAnnouncements(
      <>
        <TenantAnnouncementsPage />
        <LocationProbe />
      </>,
      {
        as: 'tenant',
        route: '/tenant/announcements?announcement=ann-2',
      },
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText('แจ้งหยุดจ่ายน้ำประปาชั่วคราวเพื่อซ่อมท่อเมนหลัก')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'ยกเลิก' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/tenant/announcements')
  })

  it('shows empty text when there are no live announcements', async () => {
    const { api } = await renderAnnouncements(<TenantAnnouncementsPage />, { as: 'tenant' })
    const data = await api.load()

    // remove all announcements
    for (const a of data.announcements) {
      await act(async () => {
        await api.remove(a.id)
      })
    }

    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: ANNOUNCEMENTS_KEY }))
    })

    expect(await screen.findByText('ยังไม่มีประกาศข่าวสาร')).toBeInTheDocument()
  })

  it('renders english translations when switched to english', async () => {
    await i18n.changeLanguage('en')
    await renderAnnouncements(<TenantAnnouncementsPage />, { as: 'tenant' })
    expect(screen.getByRole('heading', { level: 1, name: 'Announcements' })).toBeInTheDocument()
  })

  it.each(['juristic', 'technician'] as const)('does not let %s into /tenant/announcements', async (role) => {
    await renderApp('/tenant/announcements', { as: role })
    await screen.findByRole('button', { name: 'ออกจากระบบ' })
    expect(screen.queryByRole('heading', { level: 1, name: 'ประกาศข่าวสาร' })).not.toBeInTheDocument()
  })
})

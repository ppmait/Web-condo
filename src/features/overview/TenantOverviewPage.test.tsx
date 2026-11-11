import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n'
import { renderApp } from '../../test/renderApp'

afterEach(async () => {
  vi.restoreAllMocks()
  await i18n.changeLanguage('th')
})

describe('TenantOverviewPage', () => {
  it('renders welcome banner, active lease, and unit info for demo tenant', async () => {
    await renderApp('/tenant/overview', { as: 'tenant' })
    const main = screen.getByRole('main')

    expect(within(main).getByRole('heading', { level: 1 })).toHaveTextContent('ภาพรวมห้องชุด')
    expect(within(main).getByRole('heading', { level: 2, name: /ยินดีต้อนรับ/ })).toBeInTheDocument()
    expect(within(main).getByText(/^ห้องชุด/)).toBeInTheDocument()
    expect(within(main).getByText(/สัญญาเช่า:/)).toBeInTheDocument()
  })

  it('renders 4 status cards with links to corresponding tenant modules', async () => {
    await renderApp('/tenant/overview', { as: 'tenant' })
    const main = screen.getByRole('main')

    expect(within(main).getByText('บิลที่ต้องชำระ')).toBeInTheDocument()
    expect(within(main).getByText('พัสดุรอรับ')).toBeInTheDocument()
    expect(within(main).getByText('รายการแจ้งซ่อม')).toBeInTheDocument()
    expect(within(main).getByText('การจองพื้นที่ส่วนกลาง')).toBeInTheDocument()

    expect(within(main).getByRole('link', { name: /^ชำระเงิน/ })).toHaveAttribute('href', '/tenant/billing')
    expect(within(main).getByRole('link', { name: /ดูพัสดุ/ })).toHaveAttribute('href', '/tenant/parcels')
    expect(within(main).getByRole('link', { name: /ดูรายการแจ้งซ่อม/ })).toHaveAttribute('href', '/tenant/maintenance')
    expect(within(main).getByRole('link', { name: /ดูการจอง/ })).toHaveAttribute('href', '/tenant/facilities')
  })

  it('renders quick action buttons in main', async () => {
    await renderApp('/tenant/overview', { as: 'tenant' })
    const main = screen.getByRole('main')

    expect(within(main).getByRole('link', { name: /แจ้งซ่อมใหม่/ })).toHaveAttribute('href', '/tenant/maintenance')
    expect(within(main).getByRole('link', { name: /จองพื้นที่ส่วนกลาง/ })).toHaveAttribute('href', '/tenant/facilities')
    expect(within(main).getByRole('link', { name: /ดูบิลและการชำระเงิน/ })).toHaveAttribute('href', '/tenant/billing')
  })

  it('renders latest announcements and opens modal on click', async () => {
    const user = userEvent.setup()
    await renderApp('/tenant/overview', { as: 'tenant' })
    const main = screen.getByRole('main')

    expect(within(main).getByText('ประกาศและข่าวสารล่าสุด')).toBeInTheDocument()

    // Find first announcement item button inside main
    const announcementButtons = within(main).getAllByRole('button').filter((b) =>
      b.className.includes('w-full text-left rounded-lg'),
    )
    expect(announcementButtons.length).toBeGreaterThan(0)

    await user.click(announcementButtons[0])
    // Detail modal should open with cancel/close button
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ยกเลิก' })).toBeInTheDocument()
  })

  it('switches language cleanly to English', async () => {
    await i18n.changeLanguage('en')
    await renderApp('/tenant/overview', { as: 'tenant' })
    const main = screen.getByRole('main')

    expect(within(main).getByRole('heading', { level: 1 })).toHaveTextContent('Unit overview')
    expect(within(main).getByRole('heading', { level: 2, name: /Welcome/ })).toBeInTheDocument()
    expect(within(main).getByText('Outstanding Bills')).toBeInTheDocument()
    expect(within(main).getByText('Waiting Parcels')).toBeInTheDocument()
    expect(within(main).getByText('Active Repairs')).toBeInTheDocument()
    expect(within(main).getByText('Facility Bookings')).toBeInTheDocument()
    expect(within(main).getByText('Quick Actions')).toBeInTheDocument()
  })
})

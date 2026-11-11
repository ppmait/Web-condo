import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n'
import { renderApp } from '../../test/renderApp'

afterEach(async () => {
  vi.restoreAllMocks()
  await i18n.changeLanguage('th')
})

describe('JuristicDashboardPage', () => {
  it('renders dashboard heading and 5 KPI cards', async () => {
    await renderApp('/juristic/dashboard', { as: 'juristic' })
    const main = screen.getByRole('main')

    expect(within(main).getByRole('heading', { level: 1 })).toHaveTextContent('แดชบอร์ด')
    expect(within(main).getByText('อัตราการพักอาศัย')).toBeInTheDocument()
    expect(within(main).getByText('บิลค้างชำระ')).toBeInTheDocument()
    expect(within(main).getByText('สลิปรอตรวจสอบ')).toBeInTheDocument()
    expect(within(main).getByText('งานแจ้งซ่อมคงค้าง')).toBeInTheDocument()
    expect(within(main).getByText('พัสดุรอรับ')).toBeInTheDocument()
  })

  it('renders quick navigation cards linking to all major juristic sections', async () => {
    await renderApp('/juristic/dashboard', { as: 'juristic' })
    const main = screen.getByRole('main')

    expect(within(main).getByText('ทางลัดเมนู')).toBeInTheDocument()
    expect(within(main).getByRole('link', { name: /ห้องชุดและสัญญา/ })).toHaveAttribute('href', '/juristic/units')
    expect(within(main).getByRole('link', { name: /บิลและมิเตอร์/ })).toHaveAttribute('href', '/juristic/billing')
    expect(within(main).getByRole('link', { name: /จัดการงานซ่อม/ })).toHaveAttribute('href', '/juristic/maintenance')
    expect(within(main).getByRole('link', { name: /พัสดุและการจอง/ })).toHaveAttribute('href', '/juristic/parcels-bookings')
    expect(within(main).getByRole('link', { name: /สร้างประกาศ/ })).toHaveAttribute('href', '/juristic/announcements')
    expect(within(main).getByRole('link', { name: /ดูรายงาน/ })).toHaveAttribute('href', '/juristic/reports')
  })

  it('renders attention sections: slips awaiting verification, unassigned repairs, recent announcements', async () => {
    await renderApp('/juristic/dashboard', { as: 'juristic' })
    const main = screen.getByRole('main')

    expect(within(main).getByText('สลิปที่รอการตรวจสอบ')).toBeInTheDocument()
    expect(within(main).getByText('งานซ่อมที่รอมอบหมาย')).toBeInTheDocument()
    expect(within(main).getByText('ประกาศล่าสุด')).toBeInTheDocument()

    const viewAllLinks = within(main).getAllByRole('link', { name: /ดูทั้งหมด/ })
    expect(viewAllLinks.length).toBeGreaterThanOrEqual(2)
  })

  it('switches cleanly to English', async () => {
    await i18n.changeLanguage('en')
    await renderApp('/juristic/dashboard', { as: 'juristic' })
    const main = screen.getByRole('main')

    expect(within(main).getByRole('heading', { level: 1 })).toHaveTextContent('Dashboard')
    expect(within(main).getByText('Occupancy Rate')).toBeInTheDocument()
    expect(within(main).getByText('Unpaid Invoices')).toBeInTheDocument()
    expect(within(main).getByText('Slips Pending Review')).toBeInTheDocument()
    expect(within(main).getByText('Pending Repairs')).toBeInTheDocument()
    expect(within(main).getByText('Parcels in Storage')).toBeInTheDocument()
    expect(within(main).getByText('Quick Navigation')).toBeInTheDocument()
  })
})

import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n'
import { renderApp } from '../../test/renderApp'

afterEach(async () => {
  vi.restoreAllMocks()
  await i18n.changeLanguage('th')
})

describe('JuristicReportsPage', () => {
  it('renders report title and print button that calls window.print', async () => {
    const user = userEvent.setup()
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})

    await renderApp('/juristic/reports', { as: 'juristic' })
    const main = screen.getByRole('main')

    expect(within(main).getByRole('heading', { level: 1 })).toHaveTextContent('รายงานและสถิติ')
    const printButton = within(main).getByRole('button', { name: /พิมพ์รายงาน/ })
    expect(printButton).toBeInTheDocument()

    await user.click(printButton)
    expect(printSpy).toHaveBeenCalledOnce()
  })

  it('renders financial report tab by default with KPIs and period breakdown table', async () => {
    await renderApp('/juristic/reports', { as: 'juristic' })
    const main = screen.getByRole('main')

    expect(within(main).getByText('รายงานการเงิน')).toBeInTheDocument()
    expect(within(main).getByText('รายได้ที่เก็บได้แล้ว')).toBeInTheDocument()
    expect(within(main).getByText('ยอดค้างชำระ')).toBeInTheDocument()
    expect(within(main).getByText('ค่าน้ำประปา')).toBeInTheDocument()
    expect(within(main).getByText('ค่าไฟฟ้า')).toBeInTheDocument()
    expect(within(main).getByText('ค่าส่วนกลาง')).toBeInTheDocument()

    // Period selector exists
    expect(within(main).getByRole('combobox')).toBeInTheDocument()

    // Table with financial data exists
    expect(within(main).getByRole('table')).toBeInTheDocument()
  })

  it('switches to maintenance report tab and displays breakdown by category', async () => {
    const user = userEvent.setup()
    await renderApp('/juristic/reports', { as: 'juristic' })
    const main = screen.getByRole('main')

    const maintenanceTab = within(main).getByRole('button', { name: 'รายงานการซ่อมบำรุง' })
    await user.click(maintenanceTab)

    expect(within(main).getByText('การแจ้งซ่อมทั้งหมด')).toBeInTheDocument()
    expect(within(main).getByText('ซ่อมเสร็จสิ้น')).toBeInTheDocument()
    expect(within(main).getByText('อัตราความสำเร็จ')).toBeInTheDocument()

    // Category rows should be present
    expect(within(main).getByText('ไฟฟ้า')).toBeInTheDocument()
    expect(within(main).getByText('ประปา')).toBeInTheDocument()
  })

  it('switches to occupancy report tab and displays occupancy metrics and expiring leases table', async () => {
    const user = userEvent.setup()
    await renderApp('/juristic/reports', { as: 'juristic' })
    const main = screen.getByRole('main')

    const occupancyTab = within(main).getByRole('button', { name: 'รายงานการอยู่อาศัย' })
    await user.click(occupancyTab)

    expect(within(main).getByText('ห้องชุดทั้งหมด')).toBeInTheDocument()
    expect(within(main).getByText('อัตราการเข้าพัก')).toBeInTheDocument()
    expect(within(main).getByText('มีผู้เช่า')).toBeInTheDocument()
    expect(within(main).getByText('เจ้าของพักอาศัย')).toBeInTheDocument()
    expect(within(main).getByText('ห้องว่าง')).toBeInTheDocument()

    // Expiring leases section
    expect(within(main).getByText('สัญญาเช่าที่ใกล้หมดอายุ (ภายใน 90 วัน)')).toBeInTheDocument()
  })

  it('translates all report tabs and text cleanly in English', async () => {
    await i18n.changeLanguage('en')
    await renderApp('/juristic/reports', { as: 'juristic' })
    const main = screen.getByRole('main')

    expect(within(main).getByRole('heading', { level: 1 })).toHaveTextContent('Reports & Analytics')
    expect(within(main).getByRole('button', { name: /Print Report/ })).toBeInTheDocument()

    expect(within(main).getByText('Financial')).toBeInTheDocument()
    expect(within(main).getByText('Maintenance')).toBeInTheDocument()
    expect(within(main).getByText('Occupancy & Leases')).toBeInTheDocument()

    expect(within(main).getByText('Total Revenue Collected')).toBeInTheDocument()
    expect(within(main).getByText('Outstanding Balance')).toBeInTheDocument()
  })
})

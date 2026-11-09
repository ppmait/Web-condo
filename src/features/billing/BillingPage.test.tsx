import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import { formatBaht } from '../../lib/format'
import { addMonths, periodOf } from '../../billing/periods'
import { summarize } from '../../billing/rules'
import { makeBillingSeed } from '../../billing/seed'
import { todayISO } from '../../property/dates'
import { makeSeed } from '../../property/seed'
import { renderApp } from '../../test/renderApp'

afterEach(async () => {
  await i18n.changeLanguage('th')
})

function LocationProbe() {
  const { pathname, search } = useLocation()
  return <span data-testid="location">{pathname + search}</span>
}

const open = (path: string, as: 'juristic' | 'tenant' | 'technician' = 'juristic') =>
  renderApp(path, { as, extra: <LocationProbe /> })

const tabs = () => within(screen.getByRole('navigation', { name: 'ส่วนของบิลและการชำระเงิน' }))
const sidebarLink = () => within(screen.getByRole('navigation', { name: 'เมนูหลัก' })).getByRole('link', { name: 'บิลและการชำระเงิน' })

const today = todayISO()
const property = makeSeed(today)
const billing = makeBillingSeed(property, today)
const cardValue = async (label: string) => {
  const card = (await screen.findByText(label)).closest('div') as HTMLElement
  return card
}

describe('BillingPage (through the real routes)', () => {
  it('shows the five summary cards for the current month, as summarize computes them', async () => {
    await open('/juristic/billing')
    const s = summarize(billing, property, periodOf(today), today)
    expect(await screen.findByRole('heading', { level: 1, name: 'บิลและการชำระเงิน' })).toBeInTheDocument()
    for (const [label, value] of [
      ['เรียกเก็บรอบนี้', formatBaht(s.billed)],
      ['ชำระแล้ว', formatBaht(s.paid)],
      ['ค้างชำระ', formatBaht(s.outstanding)],
      ['สลิปรอตรวจ', String(s.pendingSlips)],
      ['ห้องรอจดมิเตอร์', String(s.awaitingReadings)],
    ] as const) {
      expect(within(await cardValue(label)).getByText(value)).toBeInTheDocument()
    }
  })

  it('has four tabs and marks the current one with aria-current', async () => {
    await open('/juristic/billing')
    expect(await tabs().findByRole('link', { name: 'จดมิเตอร์' })).toHaveAttribute('aria-current', 'page')
    for (const name of ['ใบแจ้งหนี้', 'สลิปชำระเงิน', 'อัตราค่าบริการ']) {
      expect(tabs().getByRole('link', { name })).not.toHaveAttribute('aria-current')
    }
  })

  it('switches tabs, changing the content and aria-current', async () => {
    await open('/juristic/billing')
    await userEvent.click(await tabs().findByRole('link', { name: 'ใบแจ้งหนี้' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'ใบแจ้งหนี้' })).toBeInTheDocument()
    expect(tabs().getByRole('link', { name: 'ใบแจ้งหนี้' })).toHaveAttribute('aria-current', 'page')
    expect(tabs().getByRole('link', { name: 'จดมิเตอร์' })).not.toHaveAttribute('aria-current')
  })

  it.each(['/juristic/billing', '/juristic/billing/invoices', '/juristic/billing/slips', '/juristic/billing/rates'])(
    'keeps the side menu item active on %s',
    async (path) => {
      await open(path)
      await tabs().findByRole('link', { name: 'จดมิเตอร์' })
      expect(sidebarLink()).toHaveAttribute('aria-current', 'page')
    },
  )

  it('changes the period with the previous / next buttons, updating the cards and the address', async () => {
    await open('/juristic/billing?period=2026-10')
    const label = await screen.findByText('ตุลาคม 2569')
    expect(label).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'รอบถัดไป' }))
    expect(await screen.findByText('พฤศจิกายน 2569')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/juristic/billing?period=2026-11')
    await userEvent.click(screen.getByRole('button', { name: 'รอบก่อนหน้า' }))
    await userEvent.click(screen.getByRole('button', { name: 'รอบก่อนหน้า' }))
    expect(await screen.findByText('กันยายน 2569')).toBeInTheDocument()
    const s = summarize(billing, property, '2026-09', today)
    expect(within(await cardValue('เรียกเก็บรอบนี้')).getByText(formatBaht(s.billed))).toBeInTheDocument()
  })

  it('keeps the chosen period when moving to another tab', async () => {
    await open('/juristic/billing?period=2026-10')
    await userEvent.click(await tabs().findByRole('link', { name: 'อัตราค่าบริการ' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/juristic/billing/rates?period=2026-10')
    expect(screen.getByText('ตุลาคม 2569')).toBeInTheDocument()
  })

  it.each(['garbage', '2026-13', '2026-1', ''])('ignores the malformed period %j and uses the current month', async (bad) => {
    await open(`/juristic/billing?period=${bad}`)
    const [year, month] = periodOf(today).split('-').map(Number)
    const expected = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)))
    expect(await screen.findByText(expected)).toBeInTheDocument()
    expect(addMonths(periodOf(today), 0)).toBe(periodOf(today))
  })

  it.each(['tenant', 'technician'] as const)('does not let the %s in: they are sent back to their own home', async (role) => {
    await open('/juristic/billing', role)
    expect(screen.getByTestId('location')).not.toHaveTextContent('/juristic/billing')
    expect(screen.queryByRole('navigation', { name: 'ส่วนของบิลและการชำระเงิน' })).not.toBeInTheDocument()
  })

  it('shows the not-found page for a tab that does not exist', async () => {
    await open('/juristic/billing/bogus')
    expect(await screen.findByRole('heading', { name: 'ไม่พบหน้าที่ค้นหา' })).toBeInTheDocument()
  })

  it('shows labels and the month in English', async () => {
    await i18n.changeLanguage('en')
    await open('/juristic/billing?period=2026-11')
    expect(await screen.findByText('November 2026')).toBeInTheDocument()
    expect(screen.getByText('Billed this period')).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Billing sections' })).getByRole('link', { name: 'Meter readings' })).toBeInTheDocument()
  })
})

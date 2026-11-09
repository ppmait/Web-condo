import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEMO_TENANT_PHONE } from '../../auth/demoAccounts'
import i18n from '../../i18n'
import { formatBaht, formatDate } from '../../lib/format'
import { BILLING_KEY, createLocalBillingApi } from '../../billing/localBillingApi'
import { invoiceStatus, tenantInvoices } from '../../billing/rules'
import { makeBillingSeed } from '../../billing/seed'
import { MemoryStorage } from '../../test/memoryStorage'
import { renderBilling } from '../../test/renderBilling'
import { TEST_TODAY } from '../../test/renderProperty'
import { makeTestBilling } from '../../test/testBilling'
import TenantBillingPage from './TenantBillingPage'

function LocationProbe() {
  const { pathname, search } = useLocation()
  return <span data-testid="location">{pathname + search}</span>
}

const renderPage = (opts: Parameters<typeof renderBilling>[1] = {}) =>
  renderBilling(
    <>
      <TenantBillingPage />
      <LocationProbe />
    </>,
    { as: 'tenant', route: '/tenant/billing', ...opts },
  )

afterEach(async () => {
  vi.restoreAllMocks()
  await i18n.changeLanguage('th')
})

async function mine() {
  const { billing, property } = makeTestBilling()
  const data = await billing.load()
  return { billing, property, data, invoices: tenantInvoices(data.invoices, DEMO_TENANT_PHONE) }
}

const dueSection = () => screen.getByRole('region', { name: 'ต้องชำระ' })
const historySection = () => screen.getByRole('region', { name: 'ประวัติใบแจ้งหนี้ที่ชำระแล้ว' })

describe('TenantBillingPage', () => {
  it('shows only the invoices of the signed-in tenant, split into "to pay" and "paid"', async () => {
    const { billing, property, data, invoices } = await mine()
    await renderPage({ api: billing, property })
    const unpaid = invoices.filter((i) => invoiceStatus(i, TEST_TODAY) !== 'paid')
    const paid = invoices.filter((i) => invoiceStatus(i, TEST_TODAY) === 'paid')
    expect(unpaid.length).toBeGreaterThan(0)
    expect(paid.length).toBeGreaterThan(0)
    for (const i of unpaid) expect(within(dueSection()).getByText(i.number)).toBeInTheDocument()
    for (const i of paid) expect(within(historySection()).getByText(i.number)).toBeInTheDocument()
    for (const other of data.invoices.filter((i) => i.tenantPhone !== DEMO_TENANT_PHONE)) {
      expect(screen.queryByText(other.number)).not.toBeInTheDocument()
    }
  })

  it('lists the paid invoices newest first, with date paid, total and status text', async () => {
    const { billing, property, invoices } = await mine()
    await renderPage({ api: billing, property })
    const paid = invoices.filter((i) => invoiceStatus(i, TEST_TODAY) === 'paid')
    const rows = within(historySection()).getAllByRole('row').slice(1)
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(paid.map((i) => i.number))
    expect(within(rows[0]).getByText(formatBaht(paid[0].total))).toHaveClass('text-right', 'tabular-nums')
    expect(within(rows[0]).getByText('ชำระแล้ว')).toBeInTheDocument()
    expect(within(rows[0]).getByText(formatDate(paid[0].slips.find((s) => s.status === 'approved')!.reviewedAt!, 'th'))).toBeInTheDocument()
    expect(screen.getAllByRole('table')[0].parentElement).toHaveClass('overflow-x-auto')
  })

  it('shows what is due as cards with the amount, the due date and a status badge', async () => {
    const { billing, property, invoices } = await mine()
    await renderPage({ api: billing, property })
    const target = invoices.find((i) => invoiceStatus(i, TEST_TODAY) === 'overdue')!
    const card = within(dueSection()).getByRole('button', { name: `เปิดใบแจ้งหนี้ ${target.number}` })
    expect(card).toHaveTextContent(formatBaht(target.total))
    expect(card).toHaveTextContent(formatDate(target.dueDate, 'th'))
    expect(card).toHaveTextContent('เกินกำหนด')
  })

  it('opens an invoice from a card and from a history row', async () => {
    const { billing, property, invoices } = await mine()
    await renderPage({ api: billing, property })
    const due = invoices.find((i) => invoiceStatus(i, TEST_TODAY) === 'overdue')!
    await userEvent.click(within(dueSection()).getByRole('button', { name: `เปิดใบแจ้งหนี้ ${due.number}` }))
    expect(screen.getByRole('dialog', { name: `ใบแจ้งหนี้ ${due.number}` })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const paid = invoices.find((i) => invoiceStatus(i, TEST_TODAY) === 'paid')!
    await userEvent.click(within(historySection()).getByRole('button', { name: `เปิดใบแจ้งหนี้ ${paid.number}` }))
    expect(screen.getByRole('dialog', { name: `ใบแจ้งหนี้ ${paid.number}` })).toBeInTheDocument()
  })

  it('has a "view receipt" button on history rows that have a receipt, opening the receipt', async () => {
    const { billing, property, invoices } = await mine()
    await renderPage({ api: billing, property })
    const withReceipt = invoices.find((i) => i.receipt)!
    await userEvent.click(within(historySection()).getByRole('button', { name: `ดูใบเสร็จ ${withReceipt.number}` }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('region', { name: 'ใบเสร็จรับเงิน' })).toHaveTextContent(withReceipt.receipt!.number)
  })

  it('has no receipt button for a paid invoice whose receipt has not been issued', async () => {
    const { billing, property, invoices } = await mine()
    const payableInvoice = invoices.find((i) => invoiceStatus(i, TEST_TODAY) === 'overdue')!
    const sent = await billing.submitSlip(payableInvoice.id, { name: 's.png', type: 'image/png', size: 1000 })
    await billing.approveSlip(payableInvoice.id, sent.slips[0].id)
    await renderPage({ api: billing, property })
    expect(within(historySection()).queryByRole('button', { name: `ดูใบเสร็จ ${payableInvoice.number}` })).not.toBeInTheDocument()
    const row = within(historySection()).getByRole('button', { name: `เปิดใบแจ้งหนี้ ${payableInvoice.number}` }).closest('tr')!
    expect(within(row).getByText('รอออกใบเสร็จ')).toBeInTheDocument()
  })

  it('says there is nothing to pay when everything is paid', async () => {
    const { billing, property, invoices } = await mine()
    for (const i of invoices.filter((x) => invoiceStatus(x, TEST_TODAY) !== 'paid')) {
      const sent = await billing.submitSlip(i.id, { name: 's.png', type: 'image/png', size: 1000 })
      await billing.approveSlip(i.id, sent.slips.at(-1)!.id)
    }
    await renderPage({ api: billing, property })
    expect(within(dueSection()).getByText('ไม่มีใบแจ้งหนี้ที่ต้องชำระ')).toBeInTheDocument()
  })

  it('tells a tenant whose phone number matches no lease that there are no invoices, instead of showing empty tables', async () => {
    const { property } = makeTestBilling()
    const seed = makeBillingSeed(await property.load(), TEST_TODAY)
    for (const i of seed.invoices) i.tenantPhone = '0899999999'
    for (const n of seed.notifications) n.recipientPhone = '0899999999'
    const storage = new MemoryStorage()
    storage.setItem(BILLING_KEY, JSON.stringify(seed))
    const api = createLocalBillingApi({ storage, today: () => TEST_TODAY, property })
    await renderPage({ api, property })
    expect(screen.getByText(/ยังไม่มีใบแจ้งหนี้สำหรับบัญชีนี้/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows dates in English with a Gregorian year', async () => {
    await i18n.changeLanguage('en')
    const { billing, property, invoices } = await mine()
    await renderPage({ api: billing, property })
    const target = invoices.find((i) => invoiceStatus(i, TEST_TODAY) === 'overdue')!
    expect(within(screen.getByRole('region', { name: 'To pay' })).getByRole('button', { name: `Open invoice ${target.number}` })).toHaveTextContent(formatDate(target.dueDate, 'en'))
  })
})

describe('?invoice= (from a notification)', () => {
  it('opens the detail of one of my invoices', async () => {
    const { billing, property, invoices } = await mine()
    const target = invoices[0]
    await renderPage({ api: billing, property, route: `/tenant/billing?invoice=${target.id}` })
    expect(screen.getByRole('dialog', { name: `ใบแจ้งหนี้ ${target.number}` })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/tenant\/billing$/)
  })

  it.each([
    ['somebody else', (others: string) => others],
    ['an invoice that does not exist', () => 'ghost'],
  ])('ignores %s without breaking and clears the address', async (_name, pick) => {
    const { billing, property, data } = await mine()
    const other = data.invoices.find((i) => i.tenantPhone !== DEMO_TENANT_PHONE)!
    await renderPage({ api: billing, property, route: `/tenant/billing?invoice=${pick(other.id)}` })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/tenant\/billing$/)
  })
})

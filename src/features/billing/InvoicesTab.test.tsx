import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Outlet, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n'
import { formatBaht, formatDate } from '../../lib/format'
import { invoiceStatus, needsReceipt } from '../../billing/rules'
import type { BillingApi, Invoice } from '../../billing/types'
import { renderBilling } from '../../test/renderBilling'
import { TEST_TODAY } from '../../test/renderProperty'
import { makeTestBilling } from '../../test/testBilling'
import InvoicesTab from './InvoicesTab'

afterEach(async () => {
  vi.restoreAllMocks()
  await i18n.changeLanguage('th')
})

const PERIOD = '2026-10'
const SLIP = { name: 'slip.png', type: 'image/png', size: 1000 }

const harness = (period: string) => (
  <Routes>
    <Route element={<Outlet context={{ period }} />}>
      <Route path="*" element={<InvoicesTab />} />
    </Route>
  </Routes>
)

async function setup(opts: { period?: string; prepare?: (api: BillingApi) => Promise<void> } = {}) {
  const { billing, property } = makeTestBilling()
  await opts.prepare?.(billing)
  const view = await renderBilling(harness(opts.period ?? PERIOD), { api: billing, property })
  const invoices = (await billing.load()).invoices.filter((i) => i.period === (opts.period ?? PERIOD))
  return { ...view, api: billing, invoices }
}

const rowOf = (number: string) => screen.getByText(number).closest('tr') as HTMLElement
const statusOf = (i: Invoice) => invoiceStatus(i, TEST_TODAY)
const dataRows = () => screen.getAllByRole('row').slice(1)

/** pay an unpaid invoice of the period so that it waits for its receipt */
async function payOne(api: BillingApi, period = PERIOD) {
  const target = (await api.load()).invoices.find((i) => i.period === period && ['unpaid', 'overdue'].includes(statusOf(i)))!
  const sent = await api.submitSlip(target.id, SLIP)
  await api.approveSlip(target.id, sent.slips.at(-1)!.id)
  return target
}

describe('InvoicesTab: the list', () => {
  it('lists the invoices of the period with unit, tenant, total, due date and a status badge', async () => {
    const { invoices } = await setup()
    expect(invoices.length).toBeGreaterThan(0)
    expect(dataRows()).toHaveLength(invoices.length)
    for (const i of invoices) {
      const row = within(rowOf(i.number))
      expect(row.getByText(i.unitCode)).toBeInTheDocument()
      expect(row.getByText(i.tenantName)).toBeInTheDocument()
      expect(row.getByText(formatBaht(i.total))).toHaveClass('text-right', 'tabular-nums')
      expect(row.getByText(formatDate(i.dueDate, 'th'))).toBeInTheDocument()
      const label = { paid: 'ชำระแล้ว', verifying: 'รอตรวจสลิป', overdue: 'เกินกำหนด', unpaid: 'ยังไม่ชำระ' }[statusOf(i)]
      expect(row.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getAllByRole('table')[0].parentElement).toHaveClass('overflow-x-auto')
  })

  it('does not show invoices of other periods', async () => {
    const { api } = await setup()
    const other = (await api.load()).invoices.find((i) => i.period !== PERIOD)!
    expect(screen.queryByText(other.number)).not.toBeInTheDocument()
  })

  it('marks exactly the paid invoices without a receipt as waiting for it', async () => {
    const { invoices } = await setup()
    const waiting = invoices.filter(needsReceipt)
    expect(waiting.length).toBeGreaterThan(0)
    for (const i of invoices) {
      const badge = within(rowOf(i.number)).queryByText('รอออกใบเสร็จ')
      if (needsReceipt(i)) expect(badge).toBeInTheDocument()
      else expect(badge).not.toBeInTheDocument()
    }
  })

  it('says so when the period has no invoice', async () => {
    await setup({ period: '2020-01' })
    expect(screen.getByText('ไม่มีใบแจ้งหนี้ในรอบนี้')).toBeInTheDocument()
  })

  it('shows the labels in English', async () => {
    await i18n.changeLanguage('en')
    const { invoices } = await setup()
    expect(screen.getByLabelText('Status')).toBeInTheDocument()
    expect(within(rowOf(invoices[0].number)).getByText(formatDate(invoices[0].dueDate, 'en'))).toBeInTheDocument()
  })
})

describe('InvoicesTab: filtering by status', () => {
  const expected = (invoices: Invoice[], option: string) =>
    invoices.filter((i) =>
      ({
        ทั้งหมด: true,
        ค้างชำระ: statusOf(i) !== 'paid',
        รอตรวจสลิป: statusOf(i) === 'verifying',
        เกินกำหนด: statusOf(i) === 'overdue',
        ชำระแล้ว: statusOf(i) === 'paid',
        รอออกใบเสร็จ: needsReceipt(i),
      })[option as 'ทั้งหมด'],
    )

  it.each(['ทั้งหมด', 'ค้างชำระ', 'รอตรวจสลิป', 'เกินกำหนด', 'ชำระแล้ว', 'รอออกใบเสร็จ'])('shows only the matching invoices for "%s"', async (option) => {
    const { invoices } = await setup()
    await userEvent.selectOptions(screen.getByLabelText('สถานะ'), option)
    const want = expected(invoices, option)
    expect(want.length).toBeGreaterThan(0)
    expect(dataRows()).toHaveLength(want.length)
    for (const i of want) expect(rowOf(i.number)).toBeInTheDocument()
  })

  it('says nothing matches when the filter leaves no invoice', async () => {
    await setup({ period: '2026-08' }) // every invoice there is paid and has its receipt
    await userEvent.selectOptions(screen.getByLabelText('สถานะ'), 'เกินกำหนด')
    expect(screen.getByText('ไม่มีใบแจ้งหนี้ตามตัวกรองนี้')).toBeInTheDocument()
  })
})

describe('InvoicesTab: issuing a receipt', () => {
  it('offers the receipt button only on paid invoices that have none', async () => {
    const { invoices } = await setup()
    for (const i of invoices) {
      const button = within(rowOf(i.number)).queryByRole('button', { name: `ออกใบเสร็จ ${i.number}` })
      if (needsReceipt(i)) expect(button).toBeInTheDocument()
      else expect(button).not.toBeInTheDocument()
    }
  })

  it('asks first, then issues the receipt, removes the button and notifies the tenant', async () => {
    const user = userEvent.setup()
    const { api, invoices } = await setup()
    const target = invoices.find(needsReceipt)!
    const before = (await api.load()).notifications.filter((n) => n.type === 'receiptIssued' && n.recipientPhone === target.tenantPhone).length
    await user.click(within(rowOf(target.number)).getByRole('button', { name: `ออกใบเสร็จ ${target.number}` }))
    const dialog = screen.getByRole('dialog', { name: `ออกใบเสร็จ ${target.number}` })
    expect((await api.load()).invoices.find((i) => i.id === target.id)!.receipt).toBeUndefined()
    await user.click(within(dialog).getByRole('button', { name: 'ออกใบเสร็จ' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const after = await api.load()
    expect(after.invoices.find((i) => i.id === target.id)!.receipt?.amount).toBe(target.total)
    expect(after.notifications.filter((n) => n.type === 'receiptIssued' && n.recipientPhone === target.tenantPhone)).toHaveLength(before + 1)
    expect(within(rowOf(target.number)).queryByRole('button', { name: `ออกใบเสร็จ ${target.number}` })).not.toBeInTheDocument()
    expect(within(rowOf(target.number)).queryByText('รอออกใบเสร็จ')).not.toBeInTheDocument()
  })

  it('does nothing when the confirmation is cancelled', async () => {
    const user = userEvent.setup()
    const { api, invoices } = await setup()
    const target = invoices.find(needsReceipt)!
    const issue = vi.spyOn(api, 'issueReceipt')
    await user.click(within(rowOf(target.number)).getByRole('button', { name: `ออกใบเสร็จ ${target.number}` }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ยกเลิก' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(issue).not.toHaveBeenCalled()
  })

  it('calls the api once when the confirmation is pressed twice, and disables the button meanwhile', async () => {
    const user = userEvent.setup()
    const { api, invoices } = await setup()
    const target = invoices.find(needsReceipt)!
    const original = api.issueReceipt.bind(api)
    let release!: () => void
    const issue = vi.spyOn(api, 'issueReceipt').mockImplementation((id) => new Promise((resolve) => (release = () => resolve(original(id)))))
    await user.click(within(rowOf(target.number)).getByRole('button', { name: `ออกใบเสร็จ ${target.number}` }))
    const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: 'ออกใบเสร็จ' })
    await user.click(confirm)
    await user.click(confirm)
    expect(issue).toHaveBeenCalledTimes(1)
    expect(confirm).toBeDisabled()
    release()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('says the receipt already exists when it was issued meanwhile (another tab), and shows the new state', async () => {
    const user = userEvent.setup()
    const { api, invoices } = await setup()
    const target = invoices.find(needsReceipt)!
    await user.click(within(rowOf(target.number)).getByRole('button', { name: `ออกใบเสร็จ ${target.number}` }))
    await api.issueReceipt(target.id)
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ออกใบเสร็จ' }))
    expect(await screen.findByText('ใบเสร็จของใบแจ้งหนี้นี้ออกไปแล้ว')).toBeInTheDocument()
    const notes = (await api.load()).notifications.filter((n) => n.type === 'receiptIssued' && n.invoiceId === target.id)
    expect(notes).toHaveLength(1)
    await waitFor(() => expect(within(rowOf(target.number)).queryByText('รอออกใบเสร็จ')).not.toBeInTheDocument())
  })

  it('a freshly paid invoice appears as waiting for its receipt and can then be given one', async () => {
    const user = userEvent.setup()
    let paidNumber = ''
    const { api } = await setup({ prepare: async (api) => void (paidNumber = (await payOne(api)).number) })
    expect(within(rowOf(paidNumber)).getByText('รอออกใบเสร็จ')).toBeInTheDocument()
    await user.click(within(rowOf(paidNumber)).getByRole('button', { name: `ออกใบเสร็จ ${paidNumber}` }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ออกใบเสร็จ' }))
    await waitFor(() => expect(within(rowOf(paidNumber)).queryByText('รอออกใบเสร็จ')).not.toBeInTheDocument())
    expect((await api.load()).invoices.find((i) => i.number === paidNumber)!.receipt).toBeDefined()
  })
})

describe('InvoicesTab: invoice detail', () => {
  it('shows the lines, the status and the slip history with the reason of a rejected slip', async () => {
    const user = userEvent.setup()
    const rejected = (await makeTestBilling().billing.load()).invoices.find((i) => i.slips.some((s) => s.status === 'rejected'))!
    await setup({ period: rejected.period })
    const slip = rejected.slips.find((s) => s.status === 'rejected')!
    await user.click(within(rowOf(rejected.number)).getByRole('button', { name: `ดูรายละเอียด ${rejected.number}` }))
    const dialog = screen.getByRole('dialog', { name: `ใบแจ้งหนี้ ${rejected.number}` })
    expect(within(dialog).getByRole('row', { name: /ค่าน้ำประปา/ })).toHaveTextContent(formatBaht(rejected.water.amount))
    expect(within(dialog).getByRole('row', { name: /ยอดสุทธิ/ })).toHaveTextContent(formatBaht(rejected.total))
    const history = within(dialog).getByRole('list', { name: 'ประวัติสลิป' })
    const item = within(history).getByText(new RegExp(slip.fileName)).closest('li')!
    expect(item).toHaveTextContent(formatDate(slip.submittedAt, 'th'))
    expect(item).toHaveTextContent('ถูกปฏิเสธ')
    expect(item).toHaveTextContent(`เหตุผล: ${slip.rejectReason}`)
  })

  it('shows the receipt of an invoice that has one, and a message for one without slips', async () => {
    const user = userEvent.setup()
    const { invoices } = await setup()
    const withReceipt = invoices.find((i) => i.receipt)!
    await user.click(within(rowOf(withReceipt.number)).getByRole('button', { name: `ดูรายละเอียด ${withReceipt.number}` }))
    expect(within(screen.getByRole('dialog')).getByRole('region', { name: 'ใบเสร็จรับเงิน' })).toHaveTextContent(withReceipt.receipt!.number)
    await user.keyboard('{Escape}')
    const noSlips = invoices.find((i) => i.slips.length === 0)
    if (noSlips) {
      await user.click(within(rowOf(noSlips.number)).getByRole('button', { name: `ดูรายละเอียด ${noSlips.number}` }))
      expect(within(screen.getByRole('dialog')).getByText('ยังไม่มีสลิป')).toBeInTheDocument()
    }
  })
})

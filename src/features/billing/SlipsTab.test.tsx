import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n'
import { formatBaht, formatDate, formatFileSize } from '../../lib/format'
import { invoiceStatus, needsReceipt, summarize } from '../../billing/rules'
import type { BillingApi, Invoice, Slip } from '../../billing/types'
import { renderBilling } from '../../test/renderBilling'
import { TEST_TODAY } from '../../test/renderProperty'
import { makeTestBilling } from '../../test/testBilling'
import SlipsTab from './SlipsTab'

afterEach(async () => {
  vi.restoreAllMocks()
  await i18n.changeLanguage('th')
})

const SLIP = { name: 'other.png', type: 'image/png', size: 2048 }

interface Queued {
  invoice: Invoice
  slip: Slip
}
const queueOf = (invoices: Invoice[]): Queued[] =>
  invoices
    .flatMap((invoice) => invoice.slips.filter((s) => s.status === 'pending').map((slip) => ({ invoice, slip })))
    .sort((a, b) => a.slip.submittedAt.localeCompare(b.slip.submittedAt) || a.invoice.number.localeCompare(b.invoice.number))

async function setup(opts: { prepare?: (api: BillingApi) => Promise<void> } = {}) {
  const { billing, property } = makeTestBilling()
  await opts.prepare?.(billing)
  const view = await renderBilling(<SlipsTab />, { api: billing, property })
  const data = await billing.load()
  return { ...view, api: billing, property, data, queue: queueOf(data.invoices) }
}

const rowOf = (number: string) => screen.getByText(number).closest('tr') as HTMLElement
const dataRows = () => screen.getAllByRole('row').slice(1)
const rowButton = (verb: 'อนุมัติ' | 'ปฏิเสธ', number: string) => within(rowOf(number)).getByRole('button', { name: `${verb} ${number}` })
const REASON = /เหตุผลที่ปฏิเสธ/

describe('SlipsTab: the queue', () => {
  it('lists every pending slip, oldest first, with invoice, unit, tenant, file, date and amount', async () => {
    const { queue } = await setup()
    expect(queue.length).toBeGreaterThan(0)
    expect(dataRows().map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(queue.map((q) => q.invoice.number))
    for (const { invoice, slip } of queue) {
      const row = within(rowOf(invoice.number))
      expect(row.getByText(invoice.unitCode)).toBeInTheDocument()
      expect(row.getByText(invoice.tenantName)).toBeInTheDocument()
      expect(row.getByText(new RegExp(`${slip.fileName}.*${formatFileSize(slip.fileSize)}`))).toBeInTheDocument()
      expect(row.getByText(formatDate(slip.submittedAt, 'th'))).toBeInTheDocument()
      expect(row.getByText(formatBaht(invoice.total))).toHaveClass('text-right', 'tabular-nums')
    }
    expect(screen.getAllByRole('table')[0].parentElement).toHaveClass('overflow-x-auto')
  })

  it('also lists the slip of an invoice from another period', async () => {
    let other = ''
    const { queue } = await setup({
      prepare: async (api) => {
        const target = (await api.load()).invoices.find((i) => i.period === '2026-09' && ['unpaid', 'overdue'].includes(invoiceStatus(i, TEST_TODAY)))!
        other = target.number
        await api.submitSlip(target.id, SLIP)
      },
    })
    expect(queue.some((q) => q.invoice.number === other)).toBe(true)
    expect(rowOf(other)).toBeInTheDocument()
    expect(new Set(queue.map((q) => q.invoice.period)).size).toBeGreaterThan(1)
  })

  it('says so when no slip is waiting', async () => {
    await setup({
      prepare: async (api) => {
        for (const { invoice, slip } of queueOf((await api.load()).invoices)) await api.approveSlip(invoice.id, slip.id)
      },
    })
    expect(screen.getByText('ไม่มีสลิปที่รอตรวจสอบ')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^อนุมัติ / })).not.toBeInTheDocument()
  })

  it('shows the labels in English', async () => {
    await i18n.changeLanguage('en')
    const { queue } = await setup()
    expect(within(rowOf(queue[0].invoice.number)).getByRole('button', { name: `Approve ${queue[0].invoice.number}` })).toBeInTheDocument()
  })
})

describe('SlipsTab: approving', () => {
  it('asks first; confirming removes the row, lowers the pending count and makes the invoice paid and waiting for its receipt', async () => {
    const user = userEvent.setup()
    const { api, property, queue, data } = await setup()
    const { invoice } = queue[0]
    const prop = await property.load()
    const before = summarize(data, prop, invoice.period, TEST_TODAY).pendingSlips
    const approve = vi.spyOn(api, 'approveSlip')
    await user.click(rowButton('อนุมัติ', invoice.number))
    const dialog = screen.getByRole('dialog', { name: `อนุมัติสลิป ${invoice.number}` })
    expect(approve).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'อนุมัติ' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(dataRows()).toHaveLength(queue.length - 1)
    expect(screen.queryByText(invoice.number)).not.toBeInTheDocument()
    const after = await api.load()
    expect(summarize(after, prop, invoice.period, TEST_TODAY).pendingSlips).toBe(before - 1)
    const paid = after.invoices.find((i) => i.id === invoice.id)!
    expect(invoiceStatus(paid, TEST_TODAY)).toBe('paid')
    expect(needsReceipt(paid)).toBe(true)
  })

  it('does nothing when the confirmation is cancelled', async () => {
    const user = userEvent.setup()
    const { api, queue } = await setup()
    const approve = vi.spyOn(api, 'approveSlip')
    await user.click(rowButton('อนุมัติ', queue[0].invoice.number))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ยกเลิก' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(approve).not.toHaveBeenCalled()
    expect(dataRows()).toHaveLength(queue.length)
  })

  it('calls the api once when the confirmation is pressed twice, and disables the button meanwhile', async () => {
    const user = userEvent.setup()
    const { api, queue } = await setup()
    const original = api.approveSlip.bind(api)
    let release!: () => void
    const approve = vi.spyOn(api, 'approveSlip').mockImplementation((i, s) => new Promise((resolve) => (release = () => resolve(original(i, s)))))
    await user.click(rowButton('อนุมัติ', queue[0].invoice.number))
    const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: 'อนุมัติ' })
    await user.click(confirm)
    await user.click(confirm)
    expect(approve).toHaveBeenCalledTimes(1)
    expect(confirm).toBeDisabled()
    release()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('tells the user when the slip was already checked elsewhere, closes the box and refreshes the list', async () => {
    const user = userEvent.setup()
    const { api, queue } = await setup()
    const { invoice, slip } = queue[0]
    await user.click(rowButton('อนุมัติ', invoice.number))
    await api.rejectSlip(invoice.id, slip.id, 'ตรวจจากแท็บอื่น') // another tab got there first
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'อนุมัติ' }))
    expect(await screen.findByText('สลิปนี้ถูกตรวจสอบไปแล้ว')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText(invoice.number)).not.toBeInTheDocument())
    const after = (await api.load()).invoices.find((i) => i.id === invoice.id)!
    expect(after.slips.filter((s) => s.status === 'approved')).toHaveLength(0)
  })
})

describe('SlipsTab: rejecting', () => {
  it.each([[''], ['   ']])('needs a reason (%j): message under the field, focus there, no api call', async (reason) => {
    const user = userEvent.setup()
    const { api, queue } = await setup()
    const reject = vi.spyOn(api, 'rejectSlip')
    await user.click(rowButton('ปฏิเสธ', queue[0].invoice.number))
    const dialog = screen.getByRole('dialog', { name: `ปฏิเสธสลิป ${queue[0].invoice.number}` })
    if (reason) await user.type(within(dialog).getByLabelText(REASON), reason)
    await user.click(within(dialog).getByRole('button', { name: 'ปฏิเสธสลิป' }))
    expect(reject).not.toHaveBeenCalled()
    const field = within(dialog).getByLabelText(REASON)
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveFocus()
    expect(within(dialog).getByText('กรุณาระบุเหตุผลที่ปฏิเสธ')).toBeInTheDocument()
    await user.type(field, 'x')
    expect(field).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('rejects with the reason: the row goes, only that tenant is notified, and a new slip can be sent', async () => {
    const user = userEvent.setup()
    const { api, queue, data } = await setup()
    const { invoice } = queue[0]
    const countFor = (d: typeof data, phone: string) => d.notifications.filter((n) => n.type === 'slipRejected' && n.recipientPhone === phone).length
    const others = [...new Set(data.invoices.map((i) => i.tenantPhone))].filter((p) => p !== invoice.tenantPhone)
    await user.click(rowButton('ปฏิเสธ', invoice.number))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText(REASON), 'ยอดไม่ตรง')
    await user.click(within(dialog).getByRole('button', { name: 'ปฏิเสธสลิป' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByText(invoice.number)).not.toBeInTheDocument()
    const after = await api.load()
    expect(countFor(after, invoice.tenantPhone)).toBe(countFor(data, invoice.tenantPhone) + 1)
    for (const phone of others) expect(countFor(after, phone)).toBe(countFor(data, phone))
    const kept = after.invoices.find((i) => i.id === invoice.id)!
    expect(kept.slips.find((s) => s.status === 'rejected')?.rejectReason).toBe('ยอดไม่ตรง')
    await expect(api.submitSlip(invoice.id, SLIP)).resolves.toBeDefined()
  })

  it('does nothing when the box is cancelled', async () => {
    const user = userEvent.setup()
    const { api, queue } = await setup()
    const reject = vi.spyOn(api, 'rejectSlip')
    await user.click(rowButton('ปฏิเสธ', queue[0].invoice.number))
    await user.type(within(screen.getByRole('dialog')).getByLabelText(REASON), 'ไม่ชัด')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ยกเลิก' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(reject).not.toHaveBeenCalled()
    await user.click(rowButton('ปฏิเสธ', queue[0].invoice.number))
    expect(within(screen.getByRole('dialog')).getByLabelText(REASON)).toHaveValue('')
  })

  it('calls the api once when the rejection is confirmed twice', async () => {
    const user = userEvent.setup()
    const { api, queue } = await setup()
    const original = api.rejectSlip.bind(api)
    let release!: () => void
    const reject = vi.spyOn(api, 'rejectSlip').mockImplementation((i, s, r) => new Promise((resolve) => (release = () => resolve(original(i, s, r)))))
    await user.click(rowButton('ปฏิเสธ', queue[0].invoice.number))
    await user.type(within(screen.getByRole('dialog')).getByLabelText(REASON), 'ไม่ชัด')
    const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: 'ปฏิเสธสลิป' })
    await user.click(confirm)
    await user.click(confirm)
    expect(reject).toHaveBeenCalledTimes(1)
    release()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

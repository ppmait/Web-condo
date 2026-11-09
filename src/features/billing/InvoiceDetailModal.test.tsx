import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEMO_TENANT_PHONE } from '../../auth/demoAccounts'
import i18n from '../../i18n'
import { formatBaht } from '../../lib/format'
import { invoiceStatus } from '../../billing/rules'
import type { BillingApi, Invoice } from '../../billing/types'
import { renderBilling } from '../../test/renderBilling'
import { TEST_TODAY } from '../../test/renderProperty'
import { makeTestBilling } from '../../test/testBilling'
import InvoiceDetailModal from './InvoiceDetailModal'

afterEach(async () => {
  vi.restoreAllMocks()
  await i18n.changeLanguage('th')
})

const PNG = { name: 'slip.png', type: 'image/png', size: 150_000 }
const png = (name = 'slip.png', size = 150_000) => new File([new Uint8Array(size)], name, { type: 'image/png' })
const SLIP_ERROR = 'กรุณาแนบไฟล์สลิปการโอนเงินให้ถูกต้อง'

/** applyAccept:false so a wrong file type reaches our own validation instead of being filtered by the browser rules */
const setup = () => userEvent.setup({ applyAccept: false })

async function open(invoiceId: string, api: BillingApi, property = makeTestBilling().property, props: { initialReceipt?: boolean } = {}) {
  await renderBilling(<InvoiceDetailModal invoiceId={invoiceId} onClose={() => {}} {...props} />, { as: 'tenant', api, property })
  return screen.getByRole('dialog')
}

async function payable() {
  const { billing, property } = makeTestBilling()
  const data = await billing.load()
  const invoice = data.invoices.find((i) => i.tenantPhone === DEMO_TENANT_PHONE && ['unpaid', 'overdue'].includes(invoiceStatus(i, TEST_TODAY)))!
  return { billing, property, invoice }
}

const sendSlip = async (user: ReturnType<typeof setup>, dialog: HTMLElement, file?: File) => {
  if (file) await user.upload(within(dialog).getByLabelText(/ไฟล์สลิป/), file)
  await user.click(within(dialog).getByRole('button', { name: 'ส่งสลิป' }))
}

describe('the invoice', () => {
  it('breaks the total down into water, electricity and the common fee, as computed by the rules', async () => {
    const { billing, property, invoice } = await payable()
    const dialog = await open(invoice.id, billing, property)
    const row = (name: RegExp) => within(dialog).getByRole('row', { name })
    expect(row(/ค่าน้ำประปา/)).toHaveTextContent(formatBaht(invoice.water.amount))
    expect(row(/ค่าน้ำประปา/)).toHaveTextContent(`${invoice.water.units} หน่วย × ${invoice.water.rate}`)
    expect(row(/ค่าไฟฟ้า/)).toHaveTextContent(formatBaht(invoice.electric.amount))
    expect(row(/ค่าส่วนกลาง/)).toHaveTextContent(formatBaht(invoice.common.amount))
    expect(row(/ยอดสุทธิ/)).toHaveTextContent(formatBaht(invoice.total))
  })

  it('shows the number, the unit, the month and the due date, with a status badge that has text', async () => {
    const { billing, property, invoice } = await payable()
    const dialog = await open(invoice.id, billing, property)
    expect(dialog).toHaveAccessibleName(`ใบแจ้งหนี้ ${invoice.number}`)
    expect(within(dialog).getByText(invoice.unitCode)).toBeInTheDocument()
    expect(within(dialog).getByText('เกินกำหนด')).toBeInTheDocument()
  })

  it('shows a QR sample, clearly marked as a sample, with the amount and reference', async () => {
    const { billing, property, invoice } = await payable()
    const dialog = await open(invoice.id, billing, property)
    expect(within(dialog).getByRole('img', { name: 'ภาพตัวอย่าง QR สำหรับชำระเงิน' })).toBeInTheDocument()
    expect(within(dialog).getByText(/ตัวอย่างเท่านั้น ไม่ใช่ QR จริง/)).toBeInTheDocument()
    expect(within(dialog).getByText(`อ้างอิง: ${invoice.number}`)).toBeInTheDocument()
  })

  it('shows dates and labels in English', async () => {
    await i18n.changeLanguage('en')
    const { billing, property, invoice } = await payable()
    const dialog = await open(invoice.id, billing, property)
    expect(within(dialog).getByText('Overdue')).toBeInTheDocument()
    expect(within(dialog).getByRole('row', { name: /Water/ })).toBeInTheDocument()
  })
})

describe('sending a slip', () => {
  it('sends a valid slip once: the invoice then waits for the juristic office', async () => {
    const user = setup()
    const { billing, property, invoice } = await payable()
    const submit = vi.spyOn(billing, 'submitSlip')
    const dialog = await open(invoice.id, billing, property)
    await sendSlip(user, dialog, png())
    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit).toHaveBeenCalledWith(invoice.id, { name: 'slip.png', type: 'image/png', size: 150_000 })
    expect(await within(dialog).findByText(/ส่งสลิปแล้ว รอนิติบุคคลตรวจสอบ/)).toBeInTheDocument()
    expect(within(dialog).getAllByText(/slip\.png/).length).toBeGreaterThan(0)
    expect(within(dialog).queryByRole('img', { name: 'ภาพตัวอย่าง QR สำหรับชำระเงิน' })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'ส่งสลิป' })).not.toBeInTheDocument()
  })

  it('does not call the api when no file is attached, and focuses the file field with the message', async () => {
    const user = setup()
    const { billing, property, invoice } = await payable()
    const submit = vi.spyOn(billing, 'submitSlip')
    const dialog = await open(invoice.id, billing, property)
    await sendSlip(user, dialog)
    expect(submit).not.toHaveBeenCalled()
    const input = within(dialog).getByLabelText(/ไฟล์สลิป/)
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveFocus()
    expect(within(dialog).getByText(SLIP_ERROR)).toBeInTheDocument()
  })

  it.each([
    ['a pdf', new File([new Uint8Array(1000)], 'slip.pdf', { type: 'application/pdf' })],
    ['a gif', new File([new Uint8Array(1000)], 'slip.gif', { type: 'image/gif' })],
    ['an empty png', new File([], 'slip.png', { type: 'image/png' })],
  ])('rejects %s before calling the api', async (_name, file) => {
    const user = setup()
    const { billing, property, invoice } = await payable()
    const submit = vi.spyOn(billing, 'submitSlip')
    const dialog = await open(invoice.id, billing, property)
    await sendSlip(user, dialog, file)
    expect(submit).not.toHaveBeenCalled()
    expect(within(dialog).getByText(SLIP_ERROR)).toBeInTheDocument()
  })

  it('rejects a file over 5 MB, but accepts exactly 5 MB', async () => {
    const user = setup()
    const { billing, property, invoice } = await payable()
    const submit = vi.spyOn(billing, 'submitSlip')
    const dialog = await open(invoice.id, billing, property)
    await sendSlip(user, dialog, png('big.png', 5 * 1024 * 1024 + 1))
    expect(submit).not.toHaveBeenCalled()
    expect(within(dialog).getByText(SLIP_ERROR)).toBeInTheDocument()
    await sendSlip(user, dialog, png('ok.png', 5 * 1024 * 1024))
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('calls the api once when submitted twice while waiting, and disables the button', async () => {
    const user = setup()
    const { billing, property, invoice } = await payable()
    const original = billing.submitSlip.bind(billing)
    let release!: () => void
    const submit = vi.spyOn(billing, 'submitSlip').mockImplementation((id, file) => new Promise((resolve) => (release = () => resolve(original(id, file)))))
    const dialog = await open(invoice.id, billing, property)
    await user.upload(within(dialog).getByLabelText(/ไฟล์สลิป/), png())
    const button = within(dialog).getByRole('button', { name: 'ส่งสลิป' })
    await user.click(button)
    await user.click(button)
    expect(submit).toHaveBeenCalledTimes(1)
    expect(button).toBeDisabled()
    release()
    expect(await within(dialog).findByText(/ส่งสลิปแล้ว รอนิติบุคคลตรวจสอบ/)).toBeInTheDocument()
  })

  it('shows the message when the api says a slip is already waiting (another tab)', async () => {
    const user = setup()
    const { billing, property, invoice } = await payable()
    const dialog = await open(invoice.id, billing, property)
    await billing.submitSlip(invoice.id, PNG) // sent from another tab
    await sendSlip(user, dialog, png('second.png'))
    expect(await within(dialog).findByText(/มีสลิปที่รอตรวจสอบอยู่แล้ว/)).toBeInTheDocument()
  })
})

describe('states of an invoice', () => {
  it('after a rejection it shows the reason and lets the tenant send a new slip', async () => {
    const user = setup()
    const { billing, property, invoice } = await payable()
    const sent = await billing.submitSlip(invoice.id, PNG)
    await billing.rejectSlip(invoice.id, sent.slips[0].id, 'ยอดไม่ตรง')
    const dialog = await open(invoice.id, billing, property)
    expect(within(dialog).getByText(/สลิปครั้งก่อนถูกปฏิเสธ: ยอดไม่ตรง/)).toBeInTheDocument()
    await sendSlip(user, dialog, png('again.png'))
    expect(await within(dialog).findByText(/ส่งสลิปแล้ว รอนิติบุคคลตรวจสอบ/)).toBeInTheDocument()
  })

  it('while a slip waits, shows the waiting message and the file name but no form', async () => {
    const { billing, property, invoice } = await payable()
    await billing.submitSlip(invoice.id, PNG)
    const dialog = await open(invoice.id, billing, property)
    expect(within(dialog).getByText(/ส่งสลิปแล้ว รอนิติบุคคลตรวจสอบ/)).toBeInTheDocument()
    expect(within(dialog).queryByLabelText(/ไฟล์สลิป/)).not.toBeInTheDocument()
  })

  it('once paid, shows no QR and no form, and says the receipt is still to come', async () => {
    const { billing, property, invoice } = await payable()
    const sent = await billing.submitSlip(invoice.id, PNG)
    await billing.approveSlip(invoice.id, sent.slips[0].id)
    const dialog = await open(invoice.id, billing, property)
    expect(within(dialog).getByText('ชำระแล้ว')).toBeInTheDocument()
    expect(within(dialog).getByText(/ชำระแล้ว รอนิติบุคคลออกใบเสร็จ/)).toBeInTheDocument()
    expect(within(dialog).queryByRole('img', { name: 'ภาพตัวอย่าง QR สำหรับชำระเงิน' })).not.toBeInTheDocument()
    expect(within(dialog).queryByLabelText(/ไฟล์สลิป/)).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'ดูใบเสร็จ' })).not.toBeInTheDocument()
  })

  it('with a receipt, shows a button that opens the receipt', async () => {
    const user = setup()
    const { billing, property, invoice } = await payable()
    const sent = await billing.submitSlip(invoice.id, PNG)
    await billing.approveSlip(invoice.id, sent.slips[0].id)
    const receipted: Invoice = await billing.issueReceipt(invoice.id)
    const dialog = await open(invoice.id, billing, property)
    await user.click(within(dialog).getByRole('button', { name: 'ดูใบเสร็จ' }))
    const receipt = within(dialog).getByRole('region', { name: 'ใบเสร็จรับเงิน' })
    expect(receipt).toHaveTextContent(receipted.receipt!.number)
    expect(receipt).toHaveTextContent(formatBaht(receipted.total))
    expect(receipt).toHaveTextContent(/ตัวอย่าง ไม่ใช่เอกสารทางภาษี/)
  })

  it('can open straight on the receipt', async () => {
    const { billing, property, invoice } = await payable()
    const sent = await billing.submitSlip(invoice.id, PNG)
    await billing.approveSlip(invoice.id, sent.slips[0].id)
    await billing.issueReceipt(invoice.id)
    const dialog = await open(invoice.id, billing, property, { initialReceipt: true })
    expect(within(dialog).getByRole('region', { name: 'ใบเสร็จรับเงิน' })).toBeInTheDocument()
  })

  it('shows the slip history with the status of each slip', async () => {
    const { billing, property, invoice } = await payable()
    const first = await billing.submitSlip(invoice.id, { ...PNG, name: 'first.png' })
    await billing.rejectSlip(invoice.id, first.slips[0].id, 'ยอดไม่ตรง')
    await billing.submitSlip(invoice.id, { ...PNG, name: 'second.png' })
    const dialog = await open(invoice.id, billing, property)
    const history = within(dialog).getByRole('list', { name: 'ประวัติสลิป' })
    expect(within(history).getByText(/first\.png/).closest('li')).toHaveTextContent('ถูกปฏิเสธ')
    expect(within(history).getByText(/second\.png/).closest('li')).toHaveTextContent('รอตรวจ')
  })

  it('asks for nothing and shows nothing broken when the invoice does not exist any more', async () => {
    const { billing, property } = await payable()
    await renderBilling(<InvoiceDetailModal invoiceId="gone" onClose={() => {}} />, { as: 'tenant', api: billing, property })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

import { DEMO_TENANT_PHONE } from '../auth/demoAccounts'
import { addDays } from '../property/dates'
import type { PropertyData } from '../property/types'
import { addMonths, periodOf } from './periods'
import { billable, buildInvoice, DEFAULT_RATES, receiptNumber } from './rules'
import type { AppNotification, BillingData, Invoice, MeterReading, Period, Slip } from './types'

/**
 * Sample billing data built from the property data: meter readings and invoices for the three months before the
 * current one, readings for most billable units of the current month (so a few are still waiting to be read),
 * and notifications. Every date is relative to `today`.
 */
export function makeBillingSeed(property: PropertyData, today: string): BillingData {
  const current = periodOf(today)
  const periods: Period[] = [addMonths(current, -3), addMonths(current, -2), addMonths(current, -1)]
  const rates = { ...DEFAULT_RATES }
  const readings: MeterReading[] = []
  const invoices: Invoice[] = []
  const notifications: AppNotification[] = []
  const latest = new Map<string, MeterReading>()
  const unitIndex = new Map(property.units.map((u, i) => [u.id, i]))

  const nextReading = (unitId: string, period: Period, serial: number): MeterReading => {
    const before = latest.get(unitId)
    const i = unitIndex.get(unitId) ?? 0
    const waterPrev = before ? before.waterCurr : 100 + i * 7
    const electricPrev = before ? before.electricCurr : 1000 + i * 50
    const reading: MeterReading = {
      id: `m-${period}-${unitId}`,
      unitId,
      period,
      waterPrev,
      waterCurr: waterPrev + 8 + ((i * 3 + serial * 5) % 20),
      electricPrev,
      electricCurr: electricPrev + 150 + ((i * 37 + serial * 53) % 250),
    }
    latest.set(unitId, reading)
    readings.push(reading)
    return reading
  }

  const notify = (type: AppNotification['type'], invoice: Invoice, createdAt: string, read: boolean) =>
    notifications.push({ id: `n-${type}-${invoice.id}`, type, invoiceId: invoice.id, recipientPhone: invoice.tenantPhone, createdAt, read })

  periods.forEach((period, p) => {
    const list = billable(property, period)
    let other = 0 // counts the invoices that are not the demo tenant's, to spread the states in the newest period
    list.forEach(({ unit, lease }, i) => {
      const reading = nextReading(unit.id, period, p)
      const firstOfNext = `${addMonths(period, 1)}-01`
      const issuedAt = firstOfNext < today ? firstOfNext : today
      const base = buildInvoice({ id: `inv-${period}-${unit.id}`, unit, lease, reading, rates, period, today: issuedAt })
      const on = (days: number) => {
        const d = addDays(issuedAt, days)
        return d < today ? d : today
      }
      const slip = (status: Slip['status'], extra: Partial<Slip> = {}): Slip => ({
        id: `s-${base.id}-1`,
        submittedAt: on(2),
        fileName: `slip-${unit.code}.png`,
        fileSize: 120_000 + i * 1000,
        status,
        ...extra,
      })
      const approved = () => slip('approved', { reviewedAt: on(3) })
      const receipt = () => ({ number: receiptNumber(period, unit.code), issuedAt: on(4), amount: base.total })

      let invoice: Invoice = base
      if (p === 0) {
        invoice = { ...base, slips: [approved()], receipt: receipt() }
      } else if (p === 1) {
        if (i === list.length - 1) invoice = { ...base, slips: [approved()] } // paid, waiting for the receipt
        else if (i === list.length - 2) invoice = base // never paid: overdue
        else invoice = { ...base, slips: [approved()], receipt: receipt() }
      } else if (base.tenantPhone === DEMO_TENANT_PHONE) {
        invoice = base // the demo tenant has something to pay
      } else {
        const k = other++ % 5
        if (k === 0) invoice = { ...base, slips: [approved()], receipt: receipt() }
        else if (k === 1) invoice = { ...base, slips: [slip('pending')] }
        else if (k === 2) invoice = { ...base, slips: [slip('rejected', { reviewedAt: on(3), rejectReason: 'ยอดเงินในสลิปไม่ตรงกับใบแจ้งหนี้' })] }
        else if (k === 3) invoice = base
        else invoice = { ...base, slips: [approved()] }
      }
      invoices.push(invoice)

      if (p === 2) {
        notify('invoiceIssued', invoice, issuedAt, invoice.tenantPhone !== DEMO_TENANT_PHONE && i % 2 === 0)
        if (invoice.slips.some((s) => s.status === 'rejected')) notify('slipRejected', invoice, on(3), false)
        if (invoice.receipt) notify('receiptIssued', invoice, invoice.receipt.issuedAt, true)
      }
    })
  })

  // current month: most billable units are read, the last two are still waiting
  const now = billable(property, current)
  now.slice(0, Math.max(0, now.length - 2)).forEach(({ unit }) => nextReading(unit.id, current, 3))

  return { version: 1, rates, readings, invoices, notifications }
}

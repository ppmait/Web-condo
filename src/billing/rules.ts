import { dueDateOf, isValidPeriod, periodEnd, periodStart } from './periods'
import type { Lease, PropertyData, Unit } from '../property/types'
import type {
  BillingData,
  CommonLine,
  Invoice,
  MeterReading,
  MeterReadingInput,
  Period,
  Rates,
  SlipFile,
  UsageLine,
} from './types'

/** field name → i18n key of the error; `{}` means valid */
export type FieldErrors = Record<string, string>

export const DEFAULT_RATES: Rates = { water: 18, electric: 7, common: 60 }

export const SLIP_MAX_BYTES = 5 * 1024 * 1024

const isWholeNumber = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n)

/** Whole baht, halves round up. The tiny extra absorbs binary floating point error such as 2.4999999999999996. */
export const roundBaht = (amount: number): number => Math.floor(amount + 0.5 + 1e-9)

export function computeLines(
  reading: MeterReading,
  areaSqm: number,
  rates: Rates,
): { water: UsageLine; electric: UsageLine; common: CommonLine; total: number } {
  const waterUnits = reading.waterCurr - reading.waterPrev
  const electricUnits = reading.electricCurr - reading.electricPrev
  const water = { units: waterUnits, rate: rates.water, amount: roundBaht(waterUnits * rates.water) }
  const electric = { units: electricUnits, rate: rates.electric, amount: roundBaht(electricUnits * rates.electric) }
  const common = { areaSqm, rate: rates.common, amount: roundBaht(areaSqm * rates.common) }
  // round each line first, then add: the total is always the sum of the amounts printed on the invoice
  return { water, electric, common, total: water.amount + electric.amount + common.amount }
}

/**
 * The units billed in a period, each with the lease that is billed: one lease per unit (the one that starts later
 * when two overlap the month). Leases that were cancelled before the first day of the period are not billed.
 */
export function billable(property: PropertyData, period: Period): { unit: Unit; lease: Lease }[] {
  const start = periodStart(period)
  const end = periodEnd(period)
  const result: { unit: Unit; lease: Lease }[] = []
  for (const unit of property.units) {
    const candidates = property.leases.filter(
      (l) => l.unitId === unit.id && l.startDate <= end && l.endDate >= start && (!l.cancelledAt || l.cancelledAt >= start),
    )
    if (candidates.length === 0) continue
    const lease = candidates.reduce((latest, l) => (l.startDate > latest.startDate ? l : latest))
    result.push({ unit, lease })
  }
  return result.sort((a, b) => a.unit.code.localeCompare(b.unit.code))
}

export function previousReading(readings: MeterReading[], unitId: string, period: Period): MeterReading | undefined {
  return readings
    .filter((r) => r.unitId === unitId && r.period < period)
    .reduce<MeterReading | undefined>((latest, r) => (!latest || r.period > latest.period ? r : latest), undefined)
}

export const isLatestReading = (readings: MeterReading[], unitId: string, period: Period): boolean =>
  !readings.some((r) => r.unitId === unitId && r.period > period)

export function validateRates(rates: Rates): FieldErrors {
  const errors: FieldErrors = {}
  for (const key of ['water', 'electric', 'common'] as const) {
    if (!isWholeNumber(rates[key]) || rates[key] <= 0) errors[key] = 'billing.errors.rate'
  }
  return errors
}

export function validateReading(
  input: MeterReadingInput,
  ctx: { readings: MeterReading[]; invoices: Invoice[]; selfId?: string },
): FieldErrors {
  const errors: FieldErrors = {}
  if (!isValidPeriod(input.period)) errors.period = 'billing.errors.reading'
  for (const key of ['waterPrev', 'waterCurr', 'electricPrev', 'electricCurr'] as const) {
    if (!isWholeNumber(input[key]) || input[key] < 0) errors[key] = 'billing.errors.reading'
  }
  if (!errors.waterPrev && !errors.waterCurr && input.waterCurr < input.waterPrev) errors.waterCurr = 'billing.errors.readingOrder'
  if (!errors.electricPrev && !errors.electricCurr && input.electricCurr < input.electricPrev) {
    errors.electricCurr = 'billing.errors.readingOrder'
  }

  const others = ctx.readings.filter((r) => r.id !== ctx.selfId)
  const earlier = previousReading(others, input.unitId, input.period)
  if (earlier) {
    // the "before" value is the "after" value of the previous period
    if (!errors.waterPrev && input.waterPrev !== earlier.waterCurr) errors.waterPrev = 'billing.errors.readingPrev'
    if (!errors.electricPrev && input.electricPrev !== earlier.electricCurr) errors.electricPrev = 'billing.errors.readingPrev'
  }

  if (ctx.invoices.some((i) => i.unitId === input.unitId && i.period === input.period)) {
    errors.reading = 'billing.errors.readingLocked'
  } else if (!isLatestReading(others, input.unitId, input.period)) {
    errors.reading = 'billing.errors.readingChained'
  }
  return errors
}

const compact = (code: string) => code.replace('-', '')

export const invoiceNumber = (period: Period, unitCode: string): string => `INV-${period.replace('-', '')}-${compact(unitCode)}`

export const receiptNumber = (period: Period, unitCode: string): string => `RC-${period.replace('-', '')}-${compact(unitCode)}`

export function buildInvoice(args: {
  id: string
  unit: Unit
  lease: Lease
  reading: MeterReading
  rates: Rates
  period: Period
  today: string
}): Invoice {
  const { id, unit, lease, reading, rates, period, today } = args
  const lines = computeLines(reading, unit.areaSqm, rates)
  return {
    id,
    number: invoiceNumber(period, unit.code),
    period,
    unitId: unit.id,
    unitCode: unit.code,
    leaseId: lease.id,
    tenantName: lease.tenantName,
    tenantPhone: lease.tenantPhone,
    water: lines.water,
    electric: lines.electric,
    common: lines.common,
    total: lines.total,
    issuedAt: today,
    dueDate: dueDateOf(period),
    slips: [],
  }
}

export type InvoiceStatus = 'paid' | 'verifying' | 'overdue' | 'unpaid'

export function invoiceStatus(invoice: Invoice, today: string): InvoiceStatus {
  if (invoice.slips.some((s) => s.status === 'approved')) return 'paid'
  if (invoice.slips.some((s) => s.status === 'pending')) return 'verifying'
  return invoice.dueDate < today ? 'overdue' : 'unpaid'
}

/** Paid, but the juristic office has not issued the receipt yet. */
export const needsReceipt = (invoice: Invoice): boolean =>
  invoice.slips.some((s) => s.status === 'approved') && !invoice.receipt

const SLIP_TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' }

/** Returns the i18n key of the problem, or null when the file is acceptable. */
export function validateSlipFile(file: SlipFile): string | null {
  const dot = file.name.lastIndexOf('.')
  const extension = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : ''
  const expectedType = SLIP_TYPES[extension]
  if (!expectedType || file.type !== expectedType) return 'billing.errors.slip'
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > SLIP_MAX_BYTES) return 'billing.errors.slip'
  return null
}

/** The invoices a tenant may see: those issued to their phone number, newest first. */
export function tenantInvoices(invoices: Invoice[], phone: string): Invoice[] {
  const wanted = phone.trim()
  if (wanted === '') return []
  return invoices
    .filter((i) => i.tenantPhone === wanted)
    .sort((a, b) => b.period.localeCompare(a.period) || b.issuedAt.localeCompare(a.issuedAt) || a.number.localeCompare(b.number))
}

export function summarize(data: BillingData, property: PropertyData, period: Period, _today: string) {
  const ofPeriod = data.invoices.filter((i) => i.period === period)
  const billed = ofPeriod.reduce((sum, i) => sum + i.total, 0)
  const paid = ofPeriod.filter((i) => i.slips.some((s) => s.status === 'approved')).reduce((sum, i) => sum + i.total, 0)
  const awaitingReadings = billable(property, period).filter(
    ({ unit }) => !data.readings.some((r) => r.unitId === unit.id && r.period === period),
  ).length
  return {
    billed,
    paid,
    outstanding: billed - paid,
    pendingSlips: data.invoices.reduce((count, i) => count + i.slips.filter((s) => s.status === 'pending').length, 0),
    awaitingReadings,
  }
}

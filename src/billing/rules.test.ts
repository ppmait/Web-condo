import { describe, expect, it } from 'vitest'
import type { Lease, PropertyData, Unit } from '../property/types'
import {
  buildInvoice,
  billable,
  computeLines,
  DEFAULT_RATES,
  invoiceNumber,
  invoiceStatus,
  isLatestReading,
  needsReceipt,
  previousReading,
  receiptNumber,
  roundBaht,
  summarize,
  tenantInvoices,
  validateRates,
  validateReading,
  validateSlipFile,
} from './rules'
import type { BillingData, Invoice, MeterReading, Rates, Slip } from './types'

const TODAY = '2026-11-08'
const RATES: Rates = { water: 18, electric: 7, common: 60 }
const MB = 1024 * 1024

const unit = (over: Partial<Unit> = {}): Unit => ({
  id: 'u1',
  code: 'A-1204',
  tower: 'A',
  floor: 12,
  areaSqm: 40,
  type: 'oneBed',
  ownerName: 'คุณเจ้าของ',
  ownership: 'forRent',
  listRent: 18000,
  closed: false,
  ...over,
})

const lease = (over: Partial<Lease> = {}): Lease => ({
  id: 'l1',
  unitId: 'u1',
  tenantName: 'คุณผู้เช่า',
  tenantPhone: '0810000001',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  monthlyRent: 18000,
  deposit: 36000,
  ...over,
})

const reading = (over: Partial<MeterReading> = {}): MeterReading => ({
  id: 'r1',
  unitId: 'u1',
  period: '2026-10',
  waterPrev: 100,
  waterCurr: 116,
  electricPrev: 1000,
  electricCurr: 1280,
  ...over,
})

const slip = (over: Partial<Slip> = {}): Slip => ({
  id: 's1',
  submittedAt: '2026-11-02',
  fileName: 'slip.png',
  fileSize: 1000,
  status: 'pending',
  ...over,
})

const invoice = (over: Partial<Invoice> = {}): Invoice => ({
  id: 'inv1',
  number: 'INV-202610-A1204',
  period: '2026-10',
  unitId: 'u1',
  unitCode: 'A-1204',
  leaseId: 'l1',
  tenantName: 'คุณผู้เช่า',
  tenantPhone: '0810000001',
  water: { units: 16, rate: 18, amount: 288 },
  electric: { units: 280, rate: 7, amount: 1960 },
  common: { areaSqm: 40, rate: 60, amount: 2400 },
  total: 4648,
  issuedAt: '2026-11-01',
  dueDate: '2026-11-05',
  slips: [],
  ...over,
})

const property = (units: Unit[], leases: Lease[]): PropertyData => ({ version: 1, units, leases, inspections: [] })

describe('roundBaht', () => {
  it.each([
    [0, 0],
    [0.5, 1],
    [1.5, 2],
    [2.5, 3],
    [2.49, 2],
    [2.51, 3],
    [1137.5, 1138],
    [4648, 4648],
  ])('rounds %s to %s (half up)', (input, expected) => {
    expect(roundBaht(input)).toBe(expected)
  })
})

describe('computeLines', () => {
  it('prices water, electricity and the common fee', () => {
    const lines = computeLines(reading(), 40, RATES)
    expect(lines.water).toEqual({ units: 16, rate: 18, amount: 288 })
    expect(lines.electric).toEqual({ units: 280, rate: 7, amount: 1960 })
    expect(lines.common).toEqual({ areaSqm: 40, rate: 60, amount: 2400 })
    expect(lines.total).toBe(4648)
  })

  it('has a zero line when nothing was used', () => {
    const lines = computeLines(reading({ waterCurr: 100, electricCurr: 1000 }), 40, RATES)
    expect(lines.water.amount).toBe(0)
    expect(lines.electric.amount).toBe(0)
    expect(lines.total).toBe(2400)
  })

  it('rounds the common fee half up and the total is the sum of the rounded lines', () => {
    const lines = computeLines(reading(), 45.5, { ...RATES, common: 25 }) // 45.5 × 25 = 1137.5
    expect(lines.common.amount).toBe(1138)
    expect(lines.total).toBe(lines.water.amount + lines.electric.amount + lines.common.amount)
  })

  it('is exact for the sample 53.3 sqm unit', () => {
    expect(computeLines(reading(), 53.3, RATES).common.amount).toBe(3198)
  })

  it('handles large readings', () => {
    const lines = computeLines(reading({ waterPrev: 0, waterCurr: 99999, electricPrev: 0, electricCurr: 999999 }), 999, RATES)
    expect(lines.water.amount).toBe(99999 * 18)
    expect(lines.electric.amount).toBe(999999 * 7)
    expect(lines.common.amount).toBe(999 * 60)
  })
})

describe('billable', () => {
  const period = '2026-11' // 2026-11-01 … 2026-11-30
  const ids = (p: PropertyData) => billable(p, period).map((b) => `${b.unit.code}/${b.lease.id}`)

  it.each([
    ['covers the whole period', lease({ startDate: '2026-01-01', endDate: '2027-01-01' }), true],
    ['starts in the middle', lease({ startDate: '2026-11-15', endDate: '2027-11-14' }), true],
    ['ends in the middle', lease({ startDate: '2025-11-01', endDate: '2026-11-10' }), true],
    ['ends on the first day', lease({ startDate: '2025-11-01', endDate: '2026-11-01' }), true],
    ['starts on the last day', lease({ startDate: '2026-11-30', endDate: '2027-11-29' }), true],
    ['starts on the first day of the next period', lease({ startDate: '2026-12-01', endDate: '2027-11-30' }), false],
    ['ended the day before the period', lease({ startDate: '2025-10-01', endDate: '2026-10-31' }), false],
    ['cancelled before the first day', lease({ cancelledAt: '2026-10-31', cancelReason: '' }), false],
    ['cancelled on the first day', lease({ cancelledAt: '2026-11-01', cancelReason: '' }), true],
    ['cancelled later in the period', lease({ cancelledAt: '2026-11-20', cancelReason: '' }), true],
    ['has not started yet', lease({ startDate: '2027-02-01', endDate: '2028-01-31' }), false],
  ])('a lease that %s', (_name, l, expected) => {
    expect(ids(property([unit()], [l]))).toEqual(expected ? ['A-1204/l1'] : [])
  })

  it('bills one lease per unit: the one that starts later when two overlap the period', () => {
    const first = lease({ id: 'old', startDate: '2026-01-01', endDate: '2026-11-10' })
    const second = lease({ id: 'new', startDate: '2026-11-11', endDate: '2027-11-10' })
    expect(ids(property([unit()], [first, second]))).toEqual(['A-1204/new'])
  })

  it('still bills a unit that was closed after the lease was made', () => {
    expect(ids(property([unit({ closed: true })], [lease()]))).toEqual(['A-1204/l1'])
  })

  it('sorts by unit code and works across a year boundary', () => {
    const units = [unit({ id: 'u2', code: 'B-0301' }), unit({ id: 'u1', code: 'A-1204' })]
    const leases = [lease({ id: 'l2', unitId: 'u2' }), lease({ id: 'l1', unitId: 'u1' })]
    expect(billable(property(units, leases), '2026-12').map((b) => b.unit.code)).toEqual(['A-1204', 'B-0301'])
    expect(billable(property([unit()], [lease({ endDate: '2027-01-31' })]), '2027-01').map((b) => b.unit.code)).toEqual(['A-1204'])
  })
})

describe('previousReading and isLatestReading', () => {
  const readings = [
    reading({ id: 'a', period: '2026-08' }),
    reading({ id: 'b', period: '2026-10' }),
    reading({ id: 'c', period: '2026-09', unitId: 'other' }),
  ]

  it('finds the latest earlier reading of the same unit', () => {
    expect(previousReading(readings, 'u1', '2026-11')?.id).toBe('b')
    expect(previousReading(readings, 'u1', '2026-10')?.id).toBe('a')
    expect(previousReading(readings, 'u1', '2026-08')).toBeUndefined()
    expect(previousReading(readings, 'nobody', '2026-11')).toBeUndefined()
  })

  it('knows whether a reading is the latest of its unit', () => {
    expect(isLatestReading(readings, 'u1', '2026-10')).toBe(true)
    expect(isLatestReading(readings, 'u1', '2026-08')).toBe(false)
    expect(isLatestReading(readings, 'u1', '2026-11')).toBe(true)
  })
})

describe('validateRates', () => {
  it('accepts positive whole baht', () => {
    expect(validateRates(RATES)).toEqual({})
    expect(validateRates(DEFAULT_RATES)).toEqual({})
  })

  it.each([0, -1, 1.5, Number.NaN])('rejects %s on any field', (bad) => {
    expect(validateRates({ ...RATES, water: bad }).water).toBe('billing.errors.rate')
    expect(validateRates({ ...RATES, electric: bad }).electric).toBe('billing.errors.rate')
    expect(validateRates({ ...RATES, common: bad }).common).toBe('billing.errors.rate')
  })
})

describe('validateReading', () => {
  const input = (over: Partial<Omit<MeterReading, 'id'>> = {}) => {
    const { id: _id, ...rest } = reading()
    return { ...rest, ...over }
  }
  const ctx = (over: { readings?: MeterReading[]; invoices?: Invoice[]; selfId?: string } = {}) => ({
    readings: [] as MeterReading[],
    invoices: [] as Invoice[],
    ...over,
  })

  it('accepts a first reading with its own previous values', () => {
    expect(validateReading(input(), ctx())).toEqual({})
  })

  it.each([
    ['not a whole number', 100.5],
    ['negative', -1],
    ['not a number', Number.NaN],
  ])('rejects a meter value that is %s', (_n, bad) => {
    expect(validateReading(input({ waterCurr: bad }), ctx()).waterCurr).toBe('billing.errors.reading')
    expect(validateReading(input({ electricPrev: bad }), ctx()).electricPrev).toBe('billing.errors.reading')
  })

  it('rejects a current value below the previous one, separately for water and electricity', () => {
    expect(validateReading(input({ waterCurr: 99 }), ctx()).waterCurr).toBe('billing.errors.readingOrder')
    expect(validateReading(input({ electricCurr: 999 }), ctx()).electricCurr).toBe('billing.errors.readingOrder')
    expect(validateReading(input({ waterCurr: 100, electricCurr: 1000 }), ctx())).toEqual({})
  })

  it('requires the previous value to match the current value of the previous period', () => {
    const earlier = [reading({ id: 'x', period: '2026-09', waterCurr: 100, electricCurr: 1000 })]
    expect(validateReading(input({ waterPrev: 100, electricPrev: 1000 }), ctx({ readings: earlier }))).toEqual({})
    const e = validateReading(input({ waterPrev: 90, electricPrev: 1001 }), ctx({ readings: earlier }))
    expect(e.waterPrev).toBe('billing.errors.readingPrev')
    expect(e.electricPrev).toBe('billing.errors.readingPrev')
  })

  it('locks a reading once the unit has an invoice for that period', () => {
    const e = validateReading(input(), ctx({ invoices: [invoice()] }))
    expect(e.reading).toBe('billing.errors.readingLocked')
  })

  it('does not lock because of an invoice of another period or unit', () => {
    expect(validateReading(input(), ctx({ invoices: [invoice({ period: '2026-09' }), invoice({ unitId: 'u9' })] }))).toEqual({})
  })

  it('only lets the latest reading of a unit be changed', () => {
    const later = [reading({ id: 'later', period: '2026-11', waterPrev: 116, waterCurr: 130, electricPrev: 1280, electricCurr: 1500 })]
    expect(validateReading(input(), ctx({ readings: later })).reading).toBe('billing.errors.readingChained')
    expect(validateReading(input({ period: '2026-11', waterPrev: 116, waterCurr: 131, electricPrev: 1280, electricCurr: 1500 }), ctx({ readings: later, selfId: 'later' }))).toEqual({})
  })

  it('does not count its own previous version as an earlier or later reading', () => {
    const current = [reading({ id: 'self' })]
    expect(validateReading(input({ waterCurr: 120 }), ctx({ readings: current, selfId: 'self' }))).toEqual({})
  })

  it('rejects an impossible period', () => {
    expect(validateReading(input({ period: '2026-13' }), ctx()).period).toBe('billing.errors.reading')
  })
})

describe('numbers', () => {
  it('builds the invoice and receipt numbers without the dash in the unit code', () => {
    expect(invoiceNumber('2026-11', 'A-1204')).toBe('INV-202611-A1204')
    expect(receiptNumber('2026-11', 'B-0301')).toBe('RC-202611-B0301')
  })
})

describe('buildInvoice', () => {
  it('snapshots rates, unit code and tenant, and starts with no slips and no receipt', () => {
    const built = buildInvoice({ id: 'x', unit: unit(), lease: lease(), reading: reading(), rates: RATES, period: '2026-10', today: TODAY })
    expect(built).toMatchObject({
      id: 'x',
      number: 'INV-202610-A1204',
      period: '2026-10',
      unitId: 'u1',
      unitCode: 'A-1204',
      leaseId: 'l1',
      tenantName: 'คุณผู้เช่า',
      tenantPhone: '0810000001',
      total: 4648,
      issuedAt: TODAY,
      dueDate: '2026-11-05',
      slips: [],
    })
    expect(built.water).toEqual({ units: 16, rate: 18, amount: 288 })
    expect(built.receipt).toBeUndefined()
  })

  it('keeps the rates it was built with even if the rates change afterwards', () => {
    const built = buildInvoice({ id: 'x', unit: unit(), lease: lease(), reading: reading(), rates: RATES, period: '2026-10', today: TODAY })
    const other = buildInvoice({ id: 'y', unit: unit(), lease: lease(), reading: reading(), rates: { water: 99, electric: 99, common: 99 }, period: '2026-10', today: TODAY })
    expect(built.water.rate).toBe(18)
    expect(other.water.rate).toBe(99)
  })
})

describe('invoiceStatus', () => {
  it('is unpaid before and on the due date, overdue after', () => {
    expect(invoiceStatus(invoice(), '2026-11-04')).toBe('unpaid')
    expect(invoiceStatus(invoice(), '2026-11-05')).toBe('unpaid')
    expect(invoiceStatus(invoice(), '2026-11-06')).toBe('overdue')
  })

  it('is verifying while a slip is pending, even when overdue', () => {
    expect(invoiceStatus(invoice({ slips: [slip()] }), '2026-12-01')).toBe('verifying')
  })

  it('is paid once a slip is approved, beating everything else', () => {
    expect(invoiceStatus(invoice({ slips: [slip({ status: 'approved' })] }), '2027-01-01')).toBe('paid')
    expect(invoiceStatus(invoice({ slips: [slip({ id: 'a', status: 'rejected' }), slip({ id: 'b', status: 'approved' })] }), TODAY)).toBe('paid')
  })

  it('goes back to unpaid or overdue when every slip was rejected', () => {
    const rejected = [slip({ status: 'rejected', rejectReason: 'ยอดไม่ตรง' })]
    expect(invoiceStatus(invoice({ slips: rejected }), '2026-11-04')).toBe('unpaid')
    expect(invoiceStatus(invoice({ slips: rejected }), '2026-11-20')).toBe('overdue')
  })
})

describe('needsReceipt', () => {
  it('is true only for a paid invoice with no receipt yet', () => {
    const paid = invoice({ slips: [slip({ status: 'approved' })] })
    expect(needsReceipt(paid)).toBe(true)
    expect(needsReceipt({ ...paid, receipt: { number: 'RC-202610-A1204', issuedAt: TODAY, amount: 4648 } })).toBe(false)
    expect(needsReceipt(invoice())).toBe(false)
    expect(needsReceipt(invoice({ slips: [slip()] }))).toBe(false)
  })
})

describe('validateSlipFile', () => {
  const file = (name: string, type: string, size = 1000) => ({ name, type, size })

  it.each([
    ['slip.png', 'image/png'],
    ['slip.PNG', 'image/png'],
    ['slip.jpg', 'image/jpeg'],
    ['slip.jpeg', 'image/jpeg'],
    ['ใบโอน 1.JPG', 'image/jpeg'],
  ])('accepts %s', (name, type) => {
    expect(validateSlipFile(file(name, type))).toBeNull()
  })

  it.each([
    ['slip.pdf', 'application/pdf'],
    ['slip.gif', 'image/gif'],
    ['slip', 'image/png'],
    ['slip.png', 'image/jpeg'],
    ['slip.jpg', 'image/png'],
    ['slip.png.exe', 'image/png'],
    ['', 'image/png'],
  ])('rejects %j with type %s', (name, type) => {
    expect(validateSlipFile(file(name, type))).toBe('billing.errors.slip')
  })

  it('accepts exactly 5 MB and rejects one byte more, and rejects an empty file', () => {
    expect(validateSlipFile(file('s.png', 'image/png', 5 * MB))).toBeNull()
    expect(validateSlipFile(file('s.png', 'image/png', 5 * MB + 1))).toBe('billing.errors.slip')
    expect(validateSlipFile(file('s.png', 'image/png', 0))).toBe('billing.errors.slip')
  })
})

describe('tenantInvoices', () => {
  const mine = [invoice({ id: 'a', period: '2026-09', number: 'INV-202609-A1204' }), invoice({ id: 'b', period: '2026-10' })]
  const others = [invoice({ id: 'c', tenantPhone: '0899999999' })]

  it('keeps only the invoices of that phone number, newest first', () => {
    expect(tenantInvoices([...mine, ...others], '0810000001').map((i) => i.id)).toEqual(['b', 'a'])
  })

  it('returns nothing for a different, empty or blank phone number', () => {
    expect(tenantInvoices(mine, '0800000000')).toEqual([])
    expect(tenantInvoices(mine, '')).toEqual([])
    expect(tenantInvoices(mine, '   ')).toEqual([])
  })
})

describe('summarize', () => {
  const units = [unit({ id: 'u1', code: 'A-1204' }), unit({ id: 'u2', code: 'A-1205' }), unit({ id: 'u3', code: 'A-1206' })]
  const leases = [lease({ id: 'l1', unitId: 'u1' }), lease({ id: 'l2', unitId: 'u2' }), lease({ id: 'l3', unitId: 'u3' })]
  const data: BillingData = {
    version: 1,
    rates: RATES,
    readings: [reading({ id: 'r1', unitId: 'u1', period: '2026-11' }), reading({ id: 'r2', unitId: 'u2', period: '2026-11' })],
    invoices: [
      invoice({ id: 'i1', period: '2026-11', total: 1000, slips: [slip({ status: 'approved' })] }),
      invoice({ id: 'i2', period: '2026-11', total: 2000, slips: [slip({ id: 'p1' })] }),
      invoice({ id: 'i3', period: '2026-10', total: 500, slips: [slip({ id: 'p2' })] }),
    ],
    notifications: [],
  }

  it('adds up the period, counts all pending slips and the units still waiting for a reading', () => {
    expect(summarize(data, property(units, leases), '2026-11', TODAY)).toEqual({
      billed: 3000,
      paid: 1000,
      outstanding: 2000,
      pendingSlips: 2,
      awaitingReadings: 1,
    })
  })

  it('is all zero for a period without invoices and no billable units', () => {
    expect(summarize({ ...data, invoices: [], readings: [] }, property([], []), '2026-11', TODAY)).toEqual({
      billed: 0,
      paid: 0,
      outstanding: 0,
      pendingSlips: 0,
      awaitingReadings: 0,
    })
  })
})

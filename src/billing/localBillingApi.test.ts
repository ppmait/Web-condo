import { describe, expect, it } from 'vitest'
import { MemoryStorage, UnreadableStorage, UnwritableStorage } from '../test/memoryStorage'
import { createLocalPropertyApi } from '../property/localPropertyApi'
import { makeSeed as makePropertySeed } from '../property/seed'
import type { PropertyApi, PropertyData } from '../property/types'
import { BILLING_KEY, createLocalBillingApi } from './localBillingApi'
import { addMonths, periodOf } from './periods'
import { billable, invoiceStatus, needsReceipt } from './rules'
import { makeBillingSeed } from './seed'
import { BillingError, type BillingApi, type BillingData, type Invoice, type MeterReadingInput } from './types'

const TODAY = '2026-11-08'
const CURRENT = periodOf(TODAY)
const PREVIOUS = addMonths(CURRENT, -1)
const PNG = { name: 'slip.png', type: 'image/png', size: 150_000 }

const makeProperty = (): PropertyApi => createLocalPropertyApi({ storage: null, today: () => TODAY })
const make = (storage: Storage | null = new MemoryStorage(), property: PropertyApi = makeProperty(), today: () => string = () => TODAY): BillingApi =>
  createLocalBillingApi({ storage, today, property })

const failure = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e as BillingError
  }
  return null
}

const propertyData = (): PropertyData => makePropertySeed(TODAY)
const seeded = (): BillingData => makeBillingSeed(propertyData(), TODAY)
const unitIdByCode = (code: string) => propertyData().units.find((u) => u.code === code)!.id

const byStatus = (data: BillingData, wanted: string, extra: (i: Invoice) => boolean = () => true) =>
  data.invoices.find((i) => invoiceStatus(i, TODAY) === wanted && extra(i))!

const reading = (unitId: string, over: Partial<MeterReadingInput> = {}): MeterReadingInput => ({
  unitId,
  period: CURRENT,
  waterPrev: 0,
  waterCurr: 10,
  electricPrev: 0,
  electricCurr: 100,
  ...over,
})

describe('seeding and persistence', () => {
  it('seeds sample data into an empty storage', async () => {
    const storage = new MemoryStorage()
    const data = await make(storage).load()
    expect(data).toEqual(seeded())
    expect(JSON.parse(storage.getItem(BILLING_KEY) as string)).toEqual(seeded())
  })

  it('returns a copy: changing the result does not change the stored data', async () => {
    const api = make()
    const first = await api.load()
    first.invoices.length = 0
    first.rates.water = 999
    expect((await api.load()).invoices.length).toBeGreaterThan(0)
    expect((await api.load()).rates.water).toBe(18)
  })

  it('keeps and shows changes across api instances, re-reading storage on every call', async () => {
    const storage = new MemoryStorage()
    const a = make(storage)
    const b = make(storage)
    await b.load()
    await a.saveRates({ water: 20, electric: 8, common: 70 })
    expect((await b.load()).rates).toEqual({ water: 20, electric: 8, common: 70 })
  })

  it('reseeds on the next call when the stored data was removed', async () => {
    const storage = new MemoryStorage()
    const api = make(storage)
    await api.saveRates({ water: 20, electric: 8, common: 70 })
    storage.removeItem(BILLING_KEY)
    expect((await api.load()).rates.water).toBe(18)
  })
})

describe('rates', () => {
  it('saves valid rates', async () => {
    const api = make()
    expect(await api.saveRates({ water: 20, electric: 8, common: 70 })).toEqual({ water: 20, electric: 8, common: 70 })
    expect((await api.load()).rates.common).toBe(70)
  })

  it.each([0, -1, 1.5, Number.NaN])('rejects %s with a field error and keeps the old rates', async (bad) => {
    const api = make()
    const e = await failure(api.saveRates({ water: bad, electric: 7, common: 60 }))
    expect(e).toBeInstanceOf(BillingError)
    expect(e?.code).toBe('invalid_input')
    expect(e?.fieldErrors?.water).toBe('billing.errors.rate')
    expect((await api.load()).rates.water).toBe(18)
  })
})

describe('meter readings', () => {
  it('records a first reading of a unit with its own "before" values and replaces it on a second save', async () => {
    const api = make()
    const unitId = unitIdByCode('B-1201') // lease starts later this month: no earlier reading
    const saved = await api.saveReading(reading(unitId, { waterPrev: 50, waterCurr: 61, electricPrev: 700, electricCurr: 790 }))
    expect(saved).toMatchObject({ unitId, period: CURRENT, waterPrev: 50, waterCurr: 61 })
    const again = await api.saveReading(reading(unitId, { waterPrev: 50, waterCurr: 70, electricPrev: 700, electricCurr: 800 }))
    expect(again.id).toBe(saved.id)
    const data = await api.load()
    expect(data.readings.filter((r) => r.unitId === unitId && r.period === CURRENT)).toHaveLength(1)
    expect(data.readings.find((r) => r.id === saved.id)?.waterCurr).toBe(70)
  })

  it('requires the "before" value to follow the previous period and the "after" value not to go down', async () => {
    const api = make()
    const data = await api.load()
    const unitId = unitIdByCode('B-1601') // awaiting a reading; has earlier readings
    const last = data.readings.filter((r) => r.unitId === unitId).sort((a, b) => b.period.localeCompare(a.period))[0]
    const wrongPrev = await failure(api.saveReading(reading(unitId, { waterPrev: last.waterCurr + 1, waterCurr: last.waterCurr + 5, electricPrev: last.electricCurr, electricCurr: last.electricCurr + 5 })))
    expect(wrongPrev?.fieldErrors?.waterPrev).toBe('billing.errors.readingPrev')
    const down = await failure(api.saveReading(reading(unitId, { waterPrev: last.waterCurr, waterCurr: last.waterCurr - 1, electricPrev: last.electricCurr, electricCurr: last.electricCurr })))
    expect(down?.fieldErrors?.waterCurr).toBe('billing.errors.readingOrder')
    const ok = await api.saveReading(reading(unitId, { waterPrev: last.waterCurr, waterCurr: last.waterCurr + 5, electricPrev: last.electricCurr, electricCurr: last.electricCurr + 5 }))
    expect(ok.waterPrev).toBe(last.waterCurr)
  })

  it('refuses to change a reading of a period that already has an invoice, or one that has a later reading', async () => {
    const api = make()
    const data = await api.load()
    const invoiced = data.invoices.find((i) => i.period === PREVIOUS)!
    const r = data.readings.find((x) => x.unitId === invoiced.unitId && x.period === PREVIOUS)!
    const locked = await failure(api.saveReading({ unitId: r.unitId, period: r.period, waterPrev: r.waterPrev, waterCurr: r.waterCurr + 1, electricPrev: r.electricPrev, electricCurr: r.electricCurr }))
    expect(locked?.fieldErrors?.reading).toBe('billing.errors.readingLocked')
    const older = data.readings.find((x) => x.unitId === invoiced.unitId && x.period === addMonths(PREVIOUS, -1))!
    const chained = await failure(api.saveReading({ unitId: older.unitId, period: older.period, waterPrev: older.waterPrev, waterCurr: older.waterCurr, electricPrev: older.electricPrev, electricCurr: older.electricCurr }))
    expect(chained?.fieldErrors?.reading).toMatch(/readingLocked|readingChained/)
  })

  it('refuses a reading for a unit that is not billed in that period', async () => {
    const api = make()
    const e = await failure(api.saveReading(reading(unitIdByCode('A-0801')))) // owner-occupied, no lease
    expect(e?.code).toBe('invalid_input')
    expect(e?.fieldErrors?.unitId).toBe('billing.errors.notBillable')
  })
})

describe('issuing invoices', () => {
  const awaiting = async (api: BillingApi) => {
    const data = await api.load()
    return billable(propertyData(), CURRENT).filter((b) => !data.readings.some((r) => r.unitId === b.unit.id && r.period === CURRENT))
  }

  it('issues an invoice for every billable unit that has a reading and skips the rest, naming them', async () => {
    const api = make()
    const waiting = await awaiting(api)
    const result = await api.issueInvoices(CURRENT)
    const data = await api.load()
    const withReading = billable(propertyData(), CURRENT).length - waiting.length
    expect(result.issued).toHaveLength(withReading)
    expect(result.skipped.filter((s) => s.reason === 'noReading').map((s) => s.unitId).sort()).toEqual(waiting.map((w) => w.unit.id).sort())
    expect(data.invoices.filter((i) => i.period === CURRENT)).toHaveLength(withReading)
  })

  it('computes the amounts from the reading, the unit area and the rates, and snapshots tenant and unit', async () => {
    const api = make()
    const { issued } = await api.issueInvoices(CURRENT)
    const i = issued.find((x) => x.unitCode === 'A-1204')!
    const r = (await api.load()).readings.find((x) => x.unitId === i.unitId && x.period === CURRENT)!
    expect(i.water.amount).toBe((r.waterCurr - r.waterPrev) * 18)
    expect(i.electric.amount).toBe((r.electricCurr - r.electricPrev) * 7)
    expect(i.common.amount).toBe(40 * 60)
    expect(i.total).toBe(i.water.amount + i.electric.amount + i.common.amount)
    expect(i).toMatchObject({ number: 'INV-202611-A1204', tenantName: 'คุณอลิสา ชัยวงศ์', tenantPhone: '0810000001', issuedAt: TODAY, dueDate: '2026-12-05', slips: [] })
  })

  it('does not create invoices twice, however often it is called', async () => {
    const api = make()
    const first = await api.issueInvoices(CURRENT)
    const second = await api.issueInvoices(CURRENT)
    expect(second.issued).toEqual([])
    expect(second.skipped.filter((s) => s.reason === 'exists')).toHaveLength(first.issued.length)
    const data = await api.load()
    expect(new Set(data.invoices.map((i) => `${i.unitId}|${i.period}`)).size).toBe(data.invoices.length)
  })

  it('gives one set of invoices when two tabs press the button at the same moment', async () => {
    const storage = new MemoryStorage()
    const property = makeProperty()
    const [a, b] = [make(storage, property), make(storage, property)]
    await a.load()
    await b.load()
    const [ra, rb] = await Promise.all([a.issueInvoices(CURRENT), b.issueInvoices(CURRENT)])
    expect(ra.issued.length + rb.issued.length).toBe(Math.max(ra.issued.length, rb.issued.length))
    const data = await make(storage, property).load()
    const current = data.invoices.filter((i) => i.period === CURRENT)
    expect(new Set(current.map((i) => i.unitId)).size).toBe(current.length)
  })

  it('keeps the old rates on old invoices and uses the new rates for new ones', async () => {
    const api = make()
    const before = (await api.load()).invoices.find((i) => i.period === PREVIOUS)!
    await api.saveRates({ water: 99, electric: 98, common: 97 })
    const { issued } = await api.issueInvoices(CURRENT)
    expect(issued[0].water.rate).toBe(99)
    expect(issued[0].common.rate).toBe(97)
    const after = (await api.load()).invoices.find((i) => i.id === before.id)!
    expect(after.water.rate).toBe(18)
    expect(after.total).toBe(before.total)
  })

  it('notifies the tenant of each new invoice, at the phone number on the invoice', async () => {
    const api = make()
    const before = (await api.load()).notifications.length
    const { issued } = await api.issueInvoices(CURRENT)
    const data = await api.load()
    const added = data.notifications.slice(before)
    expect(added).toHaveLength(issued.length)
    for (const invoice of issued) {
      const n = added.find((x) => x.invoiceId === invoice.id)!
      expect(n).toMatchObject({ type: 'invoiceIssued', recipientPhone: invoice.tenantPhone, read: false, createdAt: TODAY })
    }
  })

  it('issues nothing for a period in which no unit is billed, and rejects a malformed period', async () => {
    const api = make()
    expect(await api.issueInvoices('2020-01')).toEqual({ issued: [], skipped: [] })
    const e = await failure(api.issueInvoices('2026-13'))
    expect(e?.code).toBe('invalid_input')
  })

  it('locks the readings of an invoiced unit afterwards', async () => {
    const api = make()
    const { issued } = await api.issueInvoices(CURRENT)
    const r = (await api.load()).readings.find((x) => x.unitId === issued[0].unitId && x.period === CURRENT)!
    const e = await failure(api.saveReading({ unitId: r.unitId, period: r.period, waterPrev: r.waterPrev, waterCurr: r.waterCurr + 1, electricPrev: r.electricPrev, electricCurr: r.electricCurr }))
    expect(e?.fieldErrors?.reading).toBe('billing.errors.readingLocked')
  })
})

describe('slips', () => {
  it('records a slip on an unpaid invoice (file name, size and type only) and the invoice becomes "verifying"', async () => {
    const api = make()
    const target = byStatus(await api.load(), 'overdue', (i) => i.slips.length === 0)
    const updated = await api.submitSlip(target.id, PNG)
    expect(updated.slips.at(-1)).toMatchObject({ fileName: 'slip.png', fileSize: 150_000, status: 'pending', submittedAt: TODAY })
    expect(JSON.stringify(updated.slips.at(-1))).not.toContain('image/png')
    expect(invoiceStatus(updated, TODAY)).toBe('verifying')
  })

  it('refuses a second slip while one is waiting, and any slip on a paid invoice', async () => {
    const api = make()
    const data = await api.load()
    expect((await failure(api.submitSlip(byStatus(data, 'verifying').id, PNG)))?.code).toBe('slip_pending')
    expect((await failure(api.submitSlip(byStatus(data, 'paid').id, PNG)))?.code).toBe('already_paid')
  })

  it.each([
    ['a pdf', { name: 'slip.pdf', type: 'application/pdf', size: 1000 }],
    ['an empty file', { name: 'slip.png', type: 'image/png', size: 0 }],
    ['a file over 5 MB', { name: 'slip.png', type: 'image/png', size: 5 * 1024 * 1024 + 1 }],
  ])('refuses %s with a field error and records nothing', async (_n, file) => {
    const api = make()
    const target = byStatus(await api.load(), 'overdue', (i) => i.slips.length === 0)
    const e = await failure(api.submitSlip(target.id, file))
    expect(e?.code).toBe('invalid_input')
    expect(e?.fieldErrors?.file).toBe('billing.errors.slip')
    expect((await api.load()).invoices.find((i) => i.id === target.id)?.slips).toHaveLength(0)
  })

  it('lets the tenant send a new slip after a rejection', async () => {
    const api = make()
    const rejected = (await api.load()).invoices.find((i) => i.slips.some((s) => s.status === 'rejected') && invoiceStatus(i, TODAY) !== 'paid')!
    const updated = await api.submitSlip(rejected.id, PNG)
    expect(updated.slips.filter((s) => s.status === 'pending')).toHaveLength(1)
    expect(updated.slips.some((s) => s.status === 'rejected')).toBe(true)
  })

  it('approves a pending slip: the invoice is paid and still waits for a receipt', async () => {
    const api = make()
    const pending = byStatus(await api.load(), 'verifying')
    const slipId = pending.slips.find((s) => s.status === 'pending')!.id
    const updated = await api.approveSlip(pending.id, slipId)
    expect(updated.slips.find((s) => s.id === slipId)).toMatchObject({ status: 'approved', reviewedAt: TODAY })
    expect(invoiceStatus(updated, TODAY)).toBe('paid')
    expect(needsReceipt(updated)).toBe(true)
  })

  it('rejects a pending slip with a reason, notifies only that tenant, and the invoice can be paid again', async () => {
    const api = make()
    const data = await api.load()
    const pending = byStatus(data, 'verifying')
    const slipId = pending.slips.find((s) => s.status === 'pending')!.id
    const updated = await api.rejectSlip(pending.id, slipId, '  ยอดไม่ตรง  ')
    expect(updated.slips.find((s) => s.id === slipId)).toMatchObject({ status: 'rejected', rejectReason: 'ยอดไม่ตรง', reviewedAt: TODAY })
    expect(['unpaid', 'overdue']).toContain(invoiceStatus(updated, TODAY))
    const after = await api.load()
    const added = after.notifications.slice(data.notifications.length)
    expect(added).toEqual([expect.objectContaining({ type: 'slipRejected', invoiceId: pending.id, recipientPhone: pending.tenantPhone, read: false })])
  })

  it('does not reject without a reason', async () => {
    const api = make()
    const pending = byStatus(await api.load(), 'verifying')
    const slipId = pending.slips.find((s) => s.status === 'pending')!.id
    const e = await failure(api.rejectSlip(pending.id, slipId, '   '))
    expect(e?.code).toBe('invalid_input')
    expect(e?.fieldErrors?.reason).toBe('billing.errors.rejectReason')
    expect(invoiceStatus((await api.load()).invoices.find((i) => i.id === pending.id)!, TODAY)).toBe('verifying')
  })

  it('does not review a slip twice', async () => {
    const api = make()
    const pending = byStatus(await api.load(), 'verifying')
    const slipId = pending.slips.find((s) => s.status === 'pending')!.id
    await api.approveSlip(pending.id, slipId)
    expect((await failure(api.approveSlip(pending.id, slipId)))?.code).toBe('already_reviewed')
    expect((await failure(api.rejectSlip(pending.id, slipId, 'x')))?.code).toBe('already_reviewed')
  })

  it('reports not_found for unknown invoices and slips', async () => {
    const api = make()
    const pending = byStatus(await api.load(), 'verifying')
    expect((await failure(api.submitSlip('nope', PNG)))?.code).toBe('not_found')
    expect((await failure(api.approveSlip('nope', 'x')))?.code).toBe('not_found')
    expect((await failure(api.approveSlip(pending.id, 'nope')))?.code).toBe('not_found')
    expect((await failure(api.rejectSlip('nope', 'x', 'r')))?.code).toBe('not_found')
    expect((await failure(api.issueReceipt('nope')))?.code).toBe('not_found')
  })
})

describe('receipts', () => {
  it('issues a receipt for a paid invoice once, and notifies the tenant', async () => {
    const api = make()
    const data = await api.load()
    const target = data.invoices.find(needsReceipt)!
    const updated = await api.issueReceipt(target.id)
    expect(updated.receipt).toMatchObject({ amount: target.total, issuedAt: TODAY })
    expect(updated.receipt?.number).toMatch(/^RC-\d{6}-[A-Z]\d{3,4}$/)
    expect(needsReceipt(updated)).toBe(false)
    const after = await api.load()
    expect(after.notifications.slice(data.notifications.length)).toEqual([
      expect.objectContaining({ type: 'receiptIssued', invoiceId: target.id, recipientPhone: target.tenantPhone, read: false }),
    ])
    expect((await failure(api.issueReceipt(target.id)))?.code).toBe('receipt_exists')
  })

  it('does not issue a receipt before the invoice is paid', async () => {
    const api = make()
    const data = await api.load()
    expect((await failure(api.issueReceipt(byStatus(data, 'overdue').id)))?.code).toBe('not_payable')
    expect((await failure(api.issueReceipt(byStatus(data, 'verifying').id)))?.code).toBe('not_payable')
  })
})

describe('notifications', () => {
  it('marks one notification as read and reports an unknown id', async () => {
    const api = make()
    const unread = (await api.load()).notifications.find((n) => !n.read)!
    await api.markRead(unread.id)
    expect((await api.load()).notifications.find((n) => n.id === unread.id)?.read).toBe(true)
    expect((await failure(api.markRead('nope')))?.code).toBe('not_found')
  })

  it('marks all of one phone number as read and leaves the others alone', async () => {
    const api = make()
    const data = await api.load()
    const phones = [...new Set(data.notifications.filter((n) => !n.read).map((n) => n.recipientPhone))]
    expect(phones.length).toBeGreaterThanOrEqual(1)
    await api.markAllRead(phones[0])
    const after = await api.load()
    expect(after.notifications.filter((n) => n.recipientPhone === phones[0]).every((n) => n.read)).toBe(true)
    const others = data.notifications.filter((n) => n.recipientPhone !== phones[0])
    expect(after.notifications.filter((n) => n.recipientPhone !== phones[0])).toEqual(others)
  })
})

describe('data that cannot be trusted', () => {
  const corrupt: [string, (d: BillingData) => unknown][] = [
    ['not json', () => 'not json{'],
    ['an empty object', () => ({})],
    ['null', () => null],
    ['an array', () => []],
    ['another version', (d) => ({ ...d, version: 2 })],
    ['readings that is not an array', (d) => ({ ...d, readings: {} })],
    ['readings and invoices that all refer to units that do not exist', (d) => ({ ...d, readings: d.readings.map((r) => ({ ...r, unitId: 'ghost-' + r.unitId })), invoices: d.invoices.map((i) => ({ ...i, unitId: 'ghost-' + i.unitId })) })],
    ['rates of zero', (d) => ({ ...d, rates: { ...d.rates, water: 0 } })],
    ['an invoice whose total is not the sum of its lines', (d) => ({ ...d, invoices: [{ ...d.invoices[0], total: d.invoices[0].total + 1 }, ...d.invoices.slice(1)] })],
    ['an invoice whose water amount does not match units × rate', (d) => ({ ...d, invoices: [{ ...d.invoices[0], water: { ...d.invoices[0].water, amount: d.invoices[0].water.amount + 1 }, total: d.invoices[0].total + 1 }, ...d.invoices.slice(1)] })],
    ['two invoices with the same number', (d) => ({ ...d, invoices: [d.invoices[0], { ...d.invoices[1], number: d.invoices[0].number }, ...d.invoices.slice(2)] })],
    ['two invoices for one unit and period', (d) => ({ ...d, invoices: [...d.invoices, { ...d.invoices[0], id: 'inv-dup', number: 'INV-DUP' }] })],
    ['two pending slips on one invoice', (d) => {
      const target = d.invoices.find((i) => i.slips.some((s) => s.status === 'pending'))!
      const slips = [...target.slips, { ...target.slips[0], id: 'extra', status: 'pending' as const }]
      return { ...d, invoices: d.invoices.map((i) => (i.id === target.id ? { ...i, slips } : i)) }
    }],
    ['a receipt on an invoice without an approved slip', (d) => {
      const target = d.invoices.find((i) => !i.slips.some((s) => s.status === 'approved'))!
      return { ...d, invoices: d.invoices.map((i) => (i.id === target.id ? { ...i, receipt: { number: 'RC-X', issuedAt: TODAY, amount: i.total } } : i)) }
    }],
    ['two readings for one unit and period', (d) => ({ ...d, readings: [...d.readings, { ...d.readings[0], id: 'm-dup' }] })],
    ['a reading whose "after" value is below its "before" value', (d) => ({ ...d, readings: [{ ...d.readings[0], waterCurr: d.readings[0].waterPrev - 1 }, ...d.readings.slice(1)] })],
    ['a reading that does not continue the previous period', (d) => {
      const later = d.readings.filter((r) => r.period === CURRENT)[0]
      return { ...d, readings: d.readings.map((r) => (r.id === later.id ? { ...r, waterPrev: r.waterPrev + 1, waterCurr: r.waterCurr + 1 } : r)) }
    }],
    ['a notification for an invoice that does not exist', (d) => ({ ...d, notifications: [{ ...d.notifications[0], invoiceId: 'ghost' }, ...d.notifications.slice(1)] })],
    ['a notification for the wrong phone number', (d) => ({ ...d, notifications: [{ ...d.notifications[0], recipientPhone: '0899999999' }, ...d.notifications.slice(1)] })],
  ]

  it.each(corrupt)('starts again from sample data when storage holds %s', async (_name, build) => {
    const storage = new MemoryStorage()
    const raw = build(seeded())
    storage.setItem(BILLING_KEY, typeof raw === 'string' ? raw : JSON.stringify(raw))
    const data = await make(storage).load()
    // exactly the sample data again: untrusted data must not be kept, even partly
    expect(data).toEqual(seeded())
    expect(JSON.parse(storage.getItem(BILLING_KEY) as string)).toEqual(seeded())
  })

  it('accepts stored data that is valid', async () => {
    const storage = new MemoryStorage()
    const d = seeded()
    d.rates.water = 25
    storage.setItem(BILLING_KEY, JSON.stringify(d))
    expect((await make(storage).load()).rates.water).toBe(25)
  })

  it('keeps the billing data when a property edit leaves some references dangling (a lease moved to another unit, a unit deleted)', async () => {
    const storage = new MemoryStorage()
    const before = seeded()
    storage.setItem(BILLING_KEY, JSON.stringify(before))
    const full = propertyData()
    const a1204 = unitIdByCode('A-1204')
    const moved: PropertyData = { ...full, leases: full.leases.map((l) => (l.unitId === a1204 ? { ...l, unitId: unitIdByCode('A-0501') } : l)), inspections: [] }
    const deleted: PropertyData = { ...full, units: full.units.filter((u) => u.id !== a1204), leases: full.leases.filter((l) => l.unitId !== a1204), inspections: [] }
    const property = createLocalPropertyApi({ storage: null, today: () => TODAY })
    for (const edited of [moved, deleted]) {
      const stubbed: PropertyApi = { ...property, load: async () => edited }
      const data = await createLocalBillingApi({ storage, today: () => TODAY, property: stubbed }).load()
      expect(data).toEqual(before)
    }
  })

  it('starts again from sample data when none of the units it refers to exist (the property data was replaced)', async () => {
    const storage = new MemoryStorage()
    storage.setItem(BILLING_KEY, JSON.stringify(seeded()))
    const full = propertyData()
    const renamed: PropertyData = {
      ...full,
      units: full.units.map((u) => ({ ...u, id: 'x-' + u.id })),
      leases: full.leases.map((l) => ({ ...l, unitId: 'x-' + l.unitId })),
      inspections: [],
    }
    const property = createLocalPropertyApi({ storage: null, today: () => TODAY })
    const stubbed: PropertyApi = { ...property, load: async () => renamed }
    const data = await createLocalBillingApi({ storage, today: () => TODAY, property: stubbed }).load()
    expect(data).toEqual(makeBillingSeed(renamed, TODAY))
  })
})

describe('storage that fails', () => {
  const works = async (api: BillingApi) => {
    expect((await api.load()).invoices.length).toBeGreaterThan(0)
    await api.saveRates({ water: 21, electric: 8, common: 61 })
    expect((await api.load()).rates.water).toBe(21)
  }

  it('works in memory when reading throws', async () => works(make(new UnreadableStorage())))
  it('works in memory when writing throws', async () => works(make(new UnwritableStorage())))
  it('works with no storage at all', async () => works(make(null)))
})

describe('a failure is not cached', () => {
  it('retries after a temporary failure while loading', async () => {
    let calls = 0
    const api = make(new MemoryStorage(), makeProperty(), () => {
      if (calls++ === 0) throw new Error('clock unavailable')
      return TODAY
    })
    await expect(api.load()).rejects.toThrow('clock unavailable')
    expect((await api.load()).invoices.length).toBeGreaterThan(0)
  })

  it('passes on a failure of the property data too', async () => {
    const property = makeProperty()
    let calls = 0
    const flaky: PropertyApi = { ...property, load: () => (calls++ === 0 ? Promise.reject(new Error('property down')) : property.load()) }
    const api = createLocalBillingApi({ storage: new MemoryStorage(), today: () => TODAY, property: flaky })
    await expect(api.load()).rejects.toThrow('property down')
    expect((await api.load()).invoices.length).toBeGreaterThan(0)
  })
})

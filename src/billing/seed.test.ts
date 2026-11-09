import { describe, expect, it } from 'vitest'
import { DEMO_TENANT_PHONE } from '../auth/demoAccounts'
import { addMonths, periodOf } from './periods'
import { makeSeed as makePropertySeed } from '../property/seed'
import { billable, computeLines, invoiceNumber, invoiceStatus, needsReceipt, receiptNumber, summarize, validateRates, validateReading } from './rules'
import { makeBillingSeed } from './seed'

const TODAYS = ['2026-11-08', '2028-02-29', '2031-01-03']

describe.each(TODAYS)('makeBillingSeed(%s)', (today) => {
  const property = makePropertySeed(today)
  const data = makeBillingSeed(property, today)
  const current = periodOf(today)

  it('has valid rates and version 1', () => {
    expect(data.version).toBe(1)
    expect(validateRates(data.rates)).toEqual({})
  })

  it('has unique ids and every reference resolves to the property data', () => {
    const ids = [...data.readings, ...data.invoices, ...data.notifications].map((x) => x.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const r of data.readings) expect(property.units.some((u) => u.id === r.unitId)).toBe(true)
    for (const i of data.invoices) {
      const lease = property.leases.find((l) => l.id === i.leaseId)
      expect(lease?.unitId).toBe(i.unitId)
      expect(property.units.find((u) => u.id === i.unitId)?.code).toBe(i.unitCode)
    }
    for (const n of data.notifications) expect(data.invoices.some((i) => i.id === n.invoiceId)).toBe(true)
  })

  it('has meter readings that chain: each "before" value is the previous period\'s "after" value', () => {
    for (const r of data.readings) {
      const others = data.readings.filter((x) => x.id !== r.id)
      expect(validateReading({ unitId: r.unitId, period: r.period, waterPrev: r.waterPrev, waterCurr: r.waterCurr, electricPrev: r.electricPrev, electricCurr: r.electricCurr }, {
        readings: others.filter((x) => !(x.unitId === r.unitId && x.period > r.period)), // everything that came before
        invoices: [],
        selfId: r.id,
      }), `${r.unitId} ${r.period}`).toEqual({})
    }
  })

  it('has invoices whose amounts equal computeLines of their meter reading', () => {
    for (const i of data.invoices) {
      const unit = property.units.find((u) => u.id === i.unitId)!
      const reading = data.readings.find((r) => r.unitId === i.unitId && r.period === i.period)!
      const lines = computeLines(reading, unit.areaSqm, data.rates)
      expect({ water: i.water, electric: i.electric, common: i.common, total: i.total }).toEqual(lines)
      expect(i.number).toBe(invoiceNumber(i.period, unit.code))
      if (i.receipt) {
        expect(i.receipt.number).toBe(receiptNumber(i.period, unit.code))
        expect(i.receipt.amount).toBe(i.total)
      }
    }
  })

  it('bills exactly the units that are billable in each of the last three periods', () => {
    for (const offset of [-3, -2, -1]) {
      const period = addMonths(current, offset)
      const billed = data.invoices.filter((i) => i.period === period).map((i) => i.unitId).sort()
      const expected = billable(property, period).map((b) => b.unit.id).sort()
      expect(billed).toEqual(expected)
    }
    expect(data.invoices.some((i) => i.period === current)).toBe(false)
  })

  it('covers the invoice states: paid with receipt, paid waiting for a receipt, verifying, overdue, and a rejected slip', () => {
    const statuses = new Set(data.invoices.map((i) => invoiceStatus(i, today)))
    expect(statuses.has('paid')).toBe(true)
    expect(statuses.has('verifying')).toBe(true)
    expect(statuses.has('overdue')).toBe(true)
    expect(data.invoices.some((i) => i.receipt)).toBe(true)
    expect(data.invoices.some(needsReceipt)).toBe(true)
    expect(data.invoices.some((i) => i.slips.some((s) => s.status === 'rejected') && invoiceStatus(i, today) !== 'paid' && invoiceStatus(i, today) !== 'verifying')).toBe(true)
  })

  it('leaves at least two billable units of the current period without a reading, and none invoiced', () => {
    expect(summarize(data, property, current, today).awaitingReadings).toBeGreaterThanOrEqual(2)
    expect(data.readings.some((r) => r.period === current)).toBe(true)
  })

  it('has an unread notification for the demo tenant and a notification for every kind', () => {
    expect(data.notifications.some((n) => n.recipientPhone === DEMO_TENANT_PHONE && !n.read)).toBe(true)
    expect(new Set(data.notifications.map((n) => n.type))).toEqual(new Set(['invoiceIssued', 'slipRejected', 'receiptIssued']))
  })

  it('gives the demo tenant an invoice that can still be paid (not paid, no slip waiting)', () => {
    const payable = data.invoices.filter((i) => i.tenantPhone === DEMO_TENANT_PHONE && ['unpaid', 'overdue'].includes(invoiceStatus(i, today)))
    expect(payable.length).toBeGreaterThanOrEqual(1)
  })

  it('never has a slip or receipt dated in the future', () => {
    for (const i of data.invoices) {
      expect(i.issuedAt <= today).toBe(true)
      for (const s of i.slips) {
        expect(s.submittedAt <= today).toBe(true)
        if (s.reviewedAt) expect(s.reviewedAt <= today).toBe(true)
      }
      if (i.receipt) expect(i.receipt.issuedAt <= today).toBe(true)
    }
  })
})

describe('makeBillingSeed is relative to today', () => {
  it('shifts every invoice date when today changes and is deterministic for the same day', () => {
    const a = makeBillingSeed(makePropertySeed(TODAYS[0]), TODAYS[0])
    const b = makeBillingSeed(makePropertySeed(TODAYS[1]), TODAYS[1])
    expect(a.invoices[0].issuedAt).not.toBe(b.invoices[0].issuedAt)
    expect(makeBillingSeed(makePropertySeed(TODAYS[0]), TODAYS[0])).toEqual(a)
  })
})

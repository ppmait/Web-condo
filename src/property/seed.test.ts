import { describe, expect, it } from 'vitest'
import { leaseStatus, summarize, unitStatus, validateInspection, validateLease, validateUnit } from './rules'
import { makeSeed } from './seed'
import type { InspectionInput, LeaseInput, UnitInput } from './types'

const TODAYS = ['2026-11-08', '2031-02-14', '2028-02-29']

describe.each(TODAYS)('makeSeed(%s)', (today) => {
  const data = makeSeed(today)

  it('has 24 units, 9 leases and 6 inspections', () => {
    expect([data.units.length, data.leases.length, data.inspections.length]).toEqual([24, 9, 6])
    expect(data.version).toBe(1)
  })

  it('has unique ids and every reference resolves', () => {
    const ids = [...data.units, ...data.leases, ...data.inspections].map((x) => x.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const l of data.leases) expect(data.units.some((u) => u.id === l.unitId)).toBe(true)
    for (const i of data.inspections) expect(data.leases.some((l) => l.id === i.leaseId)).toBe(true)
  })

  it('passes the validators', () => {
    for (const u of data.units) {
      const { id, tower, ...input } = u
      expect(tower).toBe(u.code[0])
      expect(validateUnit(input as UnitInput, data.units, data.leases, id), u.code).toEqual({})
    }
    for (const l of data.leases) {
      const { id, cancelledAt: _c, cancelReason: _r, ...input } = l
      expect(validateLease(input as LeaseInput, { units: data.units, leases: data.leases, selfId: id }), id).toEqual({})
    }
    for (const i of data.inspections) {
      const { id, ...input } = i
      expect(
        validateInspection(input as InspectionInput, { leases: data.leases, inspections: data.inspections, selfId: id }),
        id,
      ).toEqual({})
    }
  })

  it('covers every lease status and every unit status', () => {
    const leaseStatuses = new Set(data.leases.map((l) => leaseStatus(l, today)))
    expect([...leaseStatuses].sort()).toEqual(['active', 'cancelled', 'ended', 'upcoming'])
    const unitStatuses = new Set(data.units.map((u) => unitStatus(u, data.leases, today)))
    expect([...unitStatuses].sort()).toEqual(['closed', 'ownerOccupied', 'rented', 'vacant'])
  })

  it('has something expiring and something waiting for a move-in', () => {
    const s = summarize(data, today)
    expect(s.totalUnits).toBe(24)
    expect(s.expiringLeases).toBeGreaterThanOrEqual(1)
    expect(s.awaitingMoveIn).toBeGreaterThanOrEqual(1)
    expect(s.vacantUnits).toBeGreaterThanOrEqual(1)
  })

  it('has both move-in and move-out inspections, some with problems', () => {
    expect(new Set(data.inspections.map((i) => i.type))).toEqual(new Set(['moveIn', 'moveOut']))
    expect(data.inspections.some((i) => i.items.some((item) => item.condition !== 'ok'))).toBe(true)
  })
})

describe('makeSeed is relative to today', () => {
  it('shifts every lease date when today changes', () => {
    const [a, b] = [makeSeed(TODAYS[0]), makeSeed(TODAYS[1])]
    a.leases.forEach((l, i) => {
      expect(l.startDate).not.toBe(b.leases[i].startDate)
      expect(l.endDate).not.toBe(b.leases[i].endDate)
    })
  })

  it('is deterministic for the same day', () => {
    expect(makeSeed(TODAYS[0])).toEqual(makeSeed(TODAYS[0]))
  })
})

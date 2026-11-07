import { describe, expect, it } from 'vitest'
import {
  damagedCount,
  isExpiringSoon,
  isLeaseEditable,
  leaseStatus,
  summarize,
  unitHasLeases,
  unitStatus,
  validateInspection,
  validateLease,
  validateUnit,
} from './rules'
import {
  CHECK_ITEMS,
  type Inspection,
  type InspectionInput,
  type Lease,
  type LeaseInput,
  type PropertyData,
  type Unit,
  type UnitInput,
} from './types'

const TODAY = '2026-11-08'

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
  tenantPhone: '0812345678',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  monthlyRent: 18000,
  deposit: 36000,
  ...over,
})

const allOk = () => CHECK_ITEMS.map((key) => ({ key, condition: 'ok' as const, note: '' }))
const inspection = (over: Partial<Inspection> = {}): Inspection => ({
  id: 'i1',
  leaseId: 'l1',
  type: 'moveIn',
  date: '2026-01-02',
  inspector: 'สมหญิง',
  items: allOk(),
  note: '',
  ...over,
})

describe('leaseStatus', () => {
  it.each([
    ['cancelled beats everything', { cancelledAt: '2026-06-01' }, 'cancelled'],
    ['cancelled beats ended', { cancelledAt: '2026-01-05', endDate: '2026-02-01' }, 'cancelled'],
    ['ended: endDate yesterday', { endDate: '2026-11-07' }, 'ended'],
    ['active: endDate is today', { endDate: TODAY }, 'active'],
    ['active: startDate is today', { startDate: TODAY, endDate: '2027-11-07' }, 'active'],
    ['upcoming: startDate tomorrow', { startDate: '2026-11-09', endDate: '2027-11-08' }, 'upcoming'],
    ['active: in the middle', {}, 'active'],
  ] as const)('%s', (_name, over, expected) => {
    expect(leaseStatus(lease(over), TODAY)).toBe(expected)
  })
})

describe('isExpiringSoon', () => {
  it.each([
    ['today', TODAY, true],
    ['today + 60', '2027-01-07', true],
    ['today + 61', '2027-01-08', false],
    ['today + 1', '2026-11-09', true],
  ])('active lease ending %s → %s', (_n, endDate, expected) => {
    expect(isExpiringSoon(lease({ endDate }), TODAY)).toBe(expected)
  })

  it('is false for cancelled, ended and upcoming leases', () => {
    expect(isExpiringSoon(lease({ endDate: '2026-12-01', cancelledAt: '2026-10-01' }), TODAY)).toBe(false)
    expect(isExpiringSoon(lease({ endDate: '2026-11-07' }), TODAY)).toBe(false)
    expect(isExpiringSoon(lease({ startDate: '2026-11-20', endDate: '2026-12-20' }), TODAY)).toBe(false)
  })
})

describe('isLeaseEditable', () => {
  it('is true for active and upcoming only', () => {
    expect(isLeaseEditable(lease(), TODAY)).toBe(true)
    expect(isLeaseEditable(lease({ startDate: '2026-12-01', endDate: '2027-12-01' }), TODAY)).toBe(true)
    expect(isLeaseEditable(lease({ endDate: '2026-11-07' }), TODAY)).toBe(false)
    expect(isLeaseEditable(lease({ cancelledAt: '2026-10-01' }), TODAY)).toBe(false)
  })
})

describe('unitStatus', () => {
  it('closed beats an active lease', () => {
    expect(unitStatus(unit({ closed: true }), [lease()], TODAY)).toBe('closed')
  })
  it('is rented with an active lease', () => {
    expect(unitStatus(unit(), [lease()], TODAY)).toBe('rented')
  })
  it('is ownerOccupied without a lease', () => {
    expect(unitStatus(unit({ ownership: 'ownerOccupied' }), [], TODAY)).toBe('ownerOccupied')
  })
  it('is vacant when for rent with no active lease', () => {
    expect(unitStatus(unit(), [], TODAY)).toBe('vacant')
  })
  it('does not count cancelled, ended, upcoming or other units leases as rented', () => {
    const others = [
      lease({ id: 'a', cancelledAt: '2026-05-01' }),
      lease({ id: 'b', endDate: '2026-11-07' }),
      lease({ id: 'c', startDate: '2026-12-01', endDate: '2027-12-01' }),
      lease({ id: 'd', unitId: 'other' }),
    ]
    expect(unitStatus(unit(), others, TODAY)).toBe('vacant')
  })
})

describe('unitHasLeases', () => {
  it('counts leases of any status for that unit only', () => {
    expect(unitHasLeases('u1', [lease({ cancelledAt: '2026-01-02' })])).toBe(true)
    expect(unitHasLeases('u1', [lease({ unitId: 'u2' })])).toBe(false)
  })
})

describe('validateUnit', () => {
  const input = (over: Partial<UnitInput> = {}): UnitInput => {
    const { id: _id, tower: _tower, ...rest } = unit()
    return { ...rest, ...over }
  }

  it('accepts a valid unit', () => {
    expect(validateUnit(input(), [], [])).toEqual({})
  })

  it.each(['', 'A1204', 'AB-1204', 'A-12', 'A-12345', 'a_1204', '1-1204'])('rejects code %j', (code) => {
    expect(validateUnit(input({ code }), [], []).code).toBe('property.errors.code')
  })

  it('accepts a lowercase code with spaces (it is normalised)', () => {
    expect(validateUnit(input({ code: ' b-0815 ' }), [], [])).toEqual({})
  })

  it('rejects a duplicate code ignoring case and spaces, but not for the unit itself', () => {
    const existing = [unit()]
    expect(validateUnit(input({ code: ' a-1204 ' }), existing, []).code).toBe('property.errors.codeTaken')
    expect(validateUnit(input(), existing, [], 'u1')).toEqual({})
  })

  it.each([0, 100, 1.5, -3, Number.NaN])('rejects floor %s', (floor) => {
    expect(validateUnit(input({ floor }), [], []).floor).toBe('property.errors.floor')
  })

  it.each([0, -1, 1000, Number.NaN, Number.POSITIVE_INFINITY])('rejects area %s', (areaSqm) => {
    expect(validateUnit(input({ areaSqm }), [], []).areaSqm).toBe('property.errors.area')
  })

  it('accepts the area limits 0.1 and 999', () => {
    expect(validateUnit(input({ areaSqm: 0.1 }), [], [])).toEqual({})
    expect(validateUnit(input({ areaSqm: 999 }), [], [])).toEqual({})
  })

  it('rejects an empty owner and a bad rent', () => {
    expect(validateUnit(input({ ownerName: '   ' }), [], []).ownerName).toBe('property.errors.owner')
    expect(validateUnit(input({ listRent: -1 }), [], []).listRent).toBe('property.errors.rent')
    expect(validateUnit(input({ listRent: 1.5 }), [], []).listRent).toBe('property.errors.rent')
    expect(validateUnit(input({ listRent: 0 }), [], [])).toEqual({})
  })

  it('rejects an unknown type or ownership', () => {
    expect(validateUnit(input({ type: 'castle' as never }), [], []).type).toBe('property.errors.type')
    expect(validateUnit(input({ ownership: 'x' as never }), [], []).ownership).toBe('property.errors.ownership')
  })

  describe('a unit that has leases', () => {
    const units = [unit()]
    const leases = [lease({ cancelledAt: '2026-02-01' })] // even a cancelled lease locks it

    it('cannot change its code or ownership', () => {
      expect(validateUnit(input({ code: 'A-1205' }), units, leases, 'u1').code).toBe('property.errors.codeLocked')
      expect(validateUnit(input({ ownership: 'ownerOccupied' }), units, leases, 'u1').ownership).toBe(
        'property.errors.codeLocked',
      )
    })

    it('can still change owner, rent and closed', () => {
      expect(validateUnit(input({ ownerName: 'คนใหม่', listRent: 20000, closed: true }), units, leases, 'u1')).toEqual({})
    })

    it('can save with the same code in a different case/spacing', () => {
      expect(validateUnit(input({ code: ' a-1204 ' }), units, leases, 'u1')).toEqual({})
    })
  })
})

describe('validateLease', () => {
  const input = (over: Partial<LeaseInput> = {}): LeaseInput => {
    const { id: _id, cancelledAt: _c, cancelReason: _r, ...rest } = lease()
    return { ...rest, ...over }
  }
  const ctx = (over: { units?: Unit[]; leases?: Lease[]; selfId?: string } = {}) => ({
    units: [unit()],
    leases: [] as Lease[],
    ...over,
  })

  it('accepts a valid lease', () => {
    expect(validateLease(input(), ctx())).toEqual({})
  })

  it('requires an existing unit that is for rent and not closed', () => {
    expect(validateLease(input({ unitId: 'nope' }), ctx()).unitId).toBe('property.errors.unitRequired')
    expect(validateLease(input(), ctx({ units: [unit({ closed: true })] })).unitId).toBe('property.errors.unitNotRentable')
    expect(validateLease(input(), ctx({ units: [unit({ ownership: 'ownerOccupied' })] })).unitId).toBe(
      'property.errors.unitNotRentable',
    )
  })

  it('validates tenant name, phone, rent and deposit', () => {
    expect(validateLease(input({ tenantName: ' ' }), ctx()).tenantName).toBe('property.errors.tenantName')
    expect(validateLease(input({ tenantPhone: '812345678' }), ctx()).tenantPhone).toBe('property.errors.tenantPhone')
    expect(validateLease(input({ tenantPhone: '081234567x' }), ctx()).tenantPhone).toBe('property.errors.tenantPhone')
    expect(validateLease(input({ monthlyRent: 0 }), ctx()).monthlyRent).toBe('property.errors.rent')
    expect(validateLease(input({ monthlyRent: 1000.5 }), ctx()).monthlyRent).toBe('property.errors.rent')
    expect(validateLease(input({ deposit: -1 }), ctx()).deposit).toBe('property.errors.deposit')
    expect(validateLease(input({ deposit: 0 }), ctx())).toEqual({})
  })

  it('rejects impossible dates and end on or before start', () => {
    expect(validateLease(input({ startDate: '2026-02-30' }), ctx()).startDate).toBe('property.errors.dates')
    expect(validateLease(input({ endDate: '2026-13-01' }), ctx()).endDate).toBe('property.errors.dates')
    expect(validateLease(input({ endDate: '2025-12-31' }), ctx()).endDate).toBe('property.errors.dates')
    expect(validateLease(input({ endDate: '2026-01-01' }), ctx()).endDate).toBe('property.errors.dates')
  })

  describe('overlap with the other non-cancelled leases of the same unit', () => {
    const existing = lease({ id: 'other', startDate: '2026-03-01', endDate: '2026-06-30' })
    const overlaps = (startDate: string, endDate: string, extra: Partial<Lease>[] = []) =>
      validateLease(input({ startDate, endDate }), ctx({ leases: [existing, ...extra.map((e, i) => lease({ id: `x${i}`, ...e }))] })).startDate

    it.each([
      ['partial overlap at the start', '2026-02-01', '2026-03-15'],
      ['partial overlap at the end', '2026-06-15', '2026-09-01'],
      ['surrounds the whole period', '2026-01-01', '2026-12-31'],
      ['inside the period', '2026-04-01', '2026-04-30'],
      ['ends on the day the other starts', '2026-01-01', '2026-03-01'],
      ['starts on the day the other ends', '2026-06-30', '2026-12-31'],
    ])('%s is an overlap', (_n, start, end) => {
      expect(overlaps(start, end)).toBe('property.errors.leaseOverlap')
    })

    it.each([
      ['ends the day before the other starts', '2026-01-01', '2026-02-28'],
      ['starts the day after the other ends', '2026-07-01', '2026-12-31'],
    ])('%s is fine', (_n, start, end) => {
      expect(overlaps(start, end)).toBeUndefined()
    })

    it('ignores cancelled leases and leases of other units', () => {
      expect(overlaps('2026-04-01', '2026-04-30', [])).toBe('property.errors.leaseOverlap')
      expect(
        validateLease(
          input({ startDate: '2026-04-01', endDate: '2026-04-30' }),
          ctx({ leases: [{ ...existing, cancelledAt: '2026-02-01' }, lease({ id: 'z', unitId: 'u2', startDate: '2026-04-01', endDate: '2026-04-30' })] }),
        ),
      ).toEqual({})
    })

    it('does not clash with itself when editing', () => {
      expect(validateLease(input({ startDate: '2026-03-10', endDate: '2026-06-20' }), ctx({ leases: [existing], selfId: 'other' }))).toEqual({})
    })
  })
})

describe('validateLease when editing a lease that already has history', () => {
  const current = lease({ id: 'l1', startDate: '2026-01-01', endDate: '2026-12-31' })
  const input = (over: Partial<LeaseInput> = {}): LeaseInput => {
    const { id: _id, cancelledAt: _c, cancelReason: _r, ...rest } = current
    return { ...rest, ...over }
  }
  const withMoveIn = [inspection({ id: 'i1', leaseId: 'l1', type: 'moveIn', date: '2026-01-06' })]
  const ctx = (over: { inspections?: Inspection[]; today?: string; units?: Unit[] } = {}) => ({
    units: over.units ?? [unit(), unit({ id: 'u2', code: 'A-1205' })],
    leases: [current],
    selfId: 'l1',
    inspections: over.inspections ?? [],
    today: over.today ?? TODAY,
  })

  it('accepts an edit that keeps the move-in inside the lease', () => {
    expect(validateLease(input({ startDate: '2026-01-05', endDate: '2027-06-30' }), ctx({ inspections: withMoveIn }))).toEqual({})
    expect(validateLease(input({ startDate: '2026-01-06' }), ctx({ inspections: withMoveIn }))).toEqual({})
  })

  it('rejects a start date after the recorded move-in', () => {
    const e = validateLease(input({ startDate: '2026-01-07' }), ctx({ inspections: withMoveIn }))
    expect(e.startDate).toBe('property.errors.leaseInspectionDates')
  })

  it('rejects an end date before the recorded move-in', () => {
    const early = [inspection({ id: 'i1', leaseId: 'l1', type: 'moveIn', date: '2026-11-30' })]
    const e = validateLease(input({ endDate: '2026-11-29' }), ctx({ inspections: early }))
    expect(e.endDate).toBe('property.errors.leaseInspectionDates')
  })

  it('does not care about inspections of other leases', () => {
    const other = [inspection({ id: 'i9', leaseId: 'other', type: 'moveIn', date: '2026-01-06' })]
    expect(validateLease(input({ startDate: '2026-03-01' }), ctx({ inspections: other }))).toEqual({})
  })

  it('does not allow moving a lease that has any inspection to another unit', () => {
    const moveOutOnly = [inspection({ id: 'i2', leaseId: 'l1', type: 'moveOut', date: '2026-12-31' })]
    expect(validateLease(input({ unitId: 'u2' }), ctx({ inspections: moveOutOnly })).unitId).toBe('property.errors.unitLocked')
    expect(validateLease(input({ unitId: 'u2' }), ctx({ inspections: withMoveIn })).unitId).toBe('property.errors.unitLocked')
  })

  it('allows moving a lease that has no inspection', () => {
    expect(validateLease(input({ unitId: 'u2' }), ctx())).toEqual({})
  })

  it('rejects an edit that would make the lease end before today (it would lock the lease for good)', () => {
    expect(validateLease(input({ endDate: '2026-11-07' }), ctx()).endDate).toBe('property.errors.leaseEndInPast')
    expect(validateLease(input({ endDate: TODAY }), ctx())).toEqual({})
  })

  it('still allows creating a lease entirely in the past (spec is silent)', () => {
    const past = input({ startDate: '2020-01-01', endDate: '2020-12-31' })
    expect(validateLease(past, { units: [unit()], leases: [], inspections: [], today: TODAY })).toEqual({})
  })
})

describe('validateInspection', () => {
  const input = (over: Partial<InspectionInput> = {}): InspectionInput => {
    const { id: _id, ...rest } = inspection()
    return { ...rest, ...over }
  }
  const ctx = (over: { leases?: Lease[]; inspections?: Inspection[]; selfId?: string } = {}) => ({
    leases: [lease()],
    inspections: [] as Inspection[],
    ...over,
  })

  it('accepts a valid move-in', () => {
    expect(validateInspection(input(), ctx())).toEqual({})
  })

  it('requires an existing lease', () => {
    expect(validateInspection(input({ leaseId: 'nope' }), ctx()).leaseId).toBe('property.errors.leaseRequired')
  })

  it('rejects a move-in before the lease starts', () => {
    expect(validateInspection(input({ date: '2025-12-31' }), ctx()).date).toBe('property.errors.inspectionDate')
    expect(validateInspection(input({ date: '2026-01-01' }), ctx())).toEqual({})
  })

  it('rejects an impossible date', () => {
    expect(validateInspection(input({ date: '2026-02-30' }), ctx()).date).toBe('property.errors.inspectionDate')
  })

  it('keeps move-out on or after move-in, and move-in on or before move-out', () => {
    const moveIn = inspection({ id: 'in', type: 'moveIn', date: '2026-01-10' })
    expect(validateInspection(input({ type: 'moveOut', date: '2026-01-09' }), ctx({ inspections: [moveIn] })).date).toBe(
      'property.errors.inspectionDate',
    )
    expect(validateInspection(input({ type: 'moveOut', date: '2026-01-10' }), ctx({ inspections: [moveIn] }))).toEqual({})
    const moveOut = inspection({ id: 'out', type: 'moveOut', date: '2026-11-30' })
    expect(validateInspection(input({ type: 'moveIn', date: '2026-12-01' }), ctx({ inspections: [moveOut] })).date).toBe(
      'property.errors.inspectionDate',
    )
  })

  it('allows only one move-in and one move-out per lease (but editing itself is fine)', () => {
    const existing = inspection({ id: 'in', type: 'moveIn' })
    expect(validateInspection(input({ type: 'moveIn' }), ctx({ inspections: [existing] })).type).toBe('property.errors.inspectionExists')
    expect(validateInspection(input({ type: 'moveIn' }), ctx({ inspections: [existing], selfId: 'in' }))).toEqual({})
    expect(validateInspection(input({ type: 'moveOut', date: '2026-12-01' }), ctx({ inspections: [existing] }))).toEqual({})
  })

  it('allows a move-out for a cancelled lease', () => {
    const cancelled = lease({ cancelledAt: '2026-06-01' })
    expect(validateInspection(input({ type: 'moveOut', date: '2026-06-02' }), ctx({ leases: [cancelled] }))).toEqual({})
  })

  it('requires an inspector', () => {
    expect(validateInspection(input({ inspector: '  ' }), ctx()).inspector).toBe('property.errors.inspector')
  })

  it('requires a note on every item that is not ok', () => {
    const items = allOk().map((i) => (i.key === 'bathroom' ? { ...i, condition: 'damaged' as const, note: '' } : i))
    expect(validateInspection(input({ items }), ctx())['item:bathroom']).toBe('property.errors.itemNote')
    const noted = items.map((i) => (i.key === 'bathroom' ? { ...i, note: 'ก๊อกน้ำรั่ว' } : i))
    expect(validateInspection(input({ items: noted }), ctx())).toEqual({})
  })

  it('requires a valid inspection type', () => {
    expect(validateInspection(input({ type: '' as never }), ctx()).type).toBe('property.errors.inspectionType')
    expect(validateInspection(input({ type: 'other' as never }), ctx()).type).toBe('property.errors.inspectionType')
  })

  it('requires all 8 items', () => {
    const e = validateInspection(input({ items: allOk().slice(1) }), ctx())
    expect(Object.keys(e)).toContain(`item:${CHECK_ITEMS[0]}`)
  })

  it('rejects negative or non-numeric meters but allows them to be empty', () => {
    expect(validateInspection(input({ waterMeter: -1 }), ctx()).waterMeter).toBe('property.errors.meter')
    expect(validateInspection(input({ electricMeter: Number.NaN }), ctx()).electricMeter).toBe('property.errors.meter')
    expect(validateInspection(input({ waterMeter: 0, electricMeter: 1234.5 }), ctx())).toEqual({})
  })
})

describe('damagedCount', () => {
  it('counts items that are not ok', () => {
    const items = allOk().map((i, n) => (n < 3 ? { ...i, condition: n === 0 ? ('missing' as const) : ('damaged' as const), note: 'x' } : i))
    expect(damagedCount(inspection({ items }))).toBe(3)
    expect(damagedCount(inspection())).toBe(0)
  })
})

describe('summarize', () => {
  const data = (): PropertyData => ({
    version: 1,
    units: [
      unit({ id: 'u1' }), // rented
      unit({ id: 'u2', code: 'A-1205' }), // vacant
      unit({ id: 'u3', code: 'A-1206', ownership: 'ownerOccupied' }),
      unit({ id: 'u4', code: 'A-1207', closed: true }),
    ],
    leases: [
      lease({ id: 'l1', unitId: 'u1', endDate: '2027-01-07' }), // active, expiring (today+60), no move-in
      lease({ id: 'l2', unitId: 'u2', startDate: '2026-12-01', endDate: '2027-12-01' }), // upcoming, no move-in
      lease({ id: 'l3', unitId: 'u3', endDate: '2026-11-30' }), // active, expiring, has move-in
      lease({ id: 'l4', unitId: 'u4', cancelledAt: '2026-05-01' }), // cancelled
      lease({ id: 'l5', unitId: 'u4', endDate: '2026-10-01' }), // ended
    ],
    inspections: [inspection({ id: 'i1', leaseId: 'l3' })],
  })

  it('counts units, vacant units, expiring leases and leases awaiting move-in', () => {
    expect(summarize(data(), TODAY)).toEqual({ totalUnits: 4, vacantUnits: 1, expiringLeases: 2, awaitingMoveIn: 2 })
  })

  it('uses the given today', () => {
    expect(summarize(data(), '2027-02-01').expiringLeases).toBe(0)
  })
})

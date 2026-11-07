import { describe, expect, it } from 'vitest'
import { MemoryStorage, UnreadableStorage, UnwritableStorage } from '../test/memoryStorage'
import { addDays } from './dates'
import { PROPERTY_KEY, createLocalPropertyApi } from './localPropertyApi'
import { makeSeed } from './seed'
import {
  CHECK_ITEMS,
  PropertyError,
  type InspectionInput,
  type LeaseInput,
  type PropertyApi,
  type PropertyData,
  type UnitInput,
} from './types'

const TODAY = '2026-11-08'

const make = (storage: Storage | null = new MemoryStorage(), today: () => string = () => TODAY) =>
  createLocalPropertyApi({ storage, today })

const failure = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e as PropertyError
  }
  return null
}

const unitByCode = (d: PropertyData, code: string) => d.units.find((u) => u.code === code)!
const leaseOf = (d: PropertyData, code: string) => d.leases.find((l) => l.unitId === unitByCode(d, code).id)!

const newUnit = (over: Partial<UnitInput> = {}): UnitInput => ({
  code: 'C-0101',
  floor: 1,
  areaSqm: 30,
  type: 'studio',
  ownerName: 'คุณสมมติ',
  ownership: 'forRent',
  listRent: 10000,
  closed: false,
  ...over,
})

const newLease = (unitId: string, over: Partial<LeaseInput> = {}): LeaseInput => ({
  unitId,
  tenantName: 'คุณผู้เช่าใหม่',
  tenantPhone: '0891234567',
  startDate: addDays(TODAY, 1000),
  endDate: addDays(TODAY, 1365),
  monthlyRent: 15000,
  deposit: 30000,
  ...over,
})

const okItems = () => CHECK_ITEMS.map((key) => ({ key, condition: 'ok' as const, note: '' }))
const newInspection = (leaseId: string, over: Partial<InspectionInput> = {}): InspectionInput => ({
  leaseId,
  type: 'moveIn',
  date: TODAY,
  inspector: 'สมหญิง',
  items: okItems(),
  note: '',
  ...over,
})

describe('seeding and persistence', () => {
  it('seeds sample data into an empty storage', async () => {
    const storage = new MemoryStorage()
    const data = await make(storage).load()
    expect(data.units).toHaveLength(24)
    expect(JSON.parse(storage.getItem(PROPERTY_KEY) as string).units).toHaveLength(24)
  })

  it('keeps changes across api instances on the same storage', async () => {
    const storage = new MemoryStorage()
    await make(storage).createUnit(newUnit())
    expect(unitByCode(await make(storage).load(), 'C-0101').ownerName).toBe('คุณสมมติ')
  })

  it('returns a copy: changing the result does not change the stored data', async () => {
    const api = make()
    const first = await api.load()
    first.units.length = 0
    first.units.push = () => 0
    expect((await api.load()).units).toHaveLength(24)
  })
})

describe('units', () => {
  it('creates a unit with a normalised code and derived tower', async () => {
    const api = make()
    const unit = await api.createUnit(newUnit({ code: ' c-0101 ', ownerName: '  คุณสมมติ  ' }))
    expect(unit.code).toBe('C-0101')
    expect(unit.tower).toBe('C')
    expect(unit.ownerName).toBe('คุณสมมติ')
    expect(unitByCode(await api.load(), 'C-0101').id).toBe(unit.id)
  })

  it('rejects a duplicate code (any case) with a field error', async () => {
    const e = await failure(make().createUnit(newUnit({ code: 'a-1204' })))
    expect(e).toBeInstanceOf(PropertyError)
    expect(e?.code).toBe('invalid_input')
    expect(e?.fieldErrors?.code).toBe('property.errors.codeTaken')
  })

  it('rejects invalid input with every field error and changes nothing', async () => {
    const api = make()
    const e = await failure(api.createUnit(newUnit({ code: 'x', floor: 0, areaSqm: 0, ownerName: '', listRent: -1 })))
    expect(Object.keys(e?.fieldErrors ?? {}).sort()).toEqual(['areaSqm', 'code', 'floor', 'listRent', 'ownerName'])
    expect((await api.load()).units).toHaveLength(24)
  })

  it('updates a unit and recomputes the tower when the code changes', async () => {
    const api = make()
    const created = await api.createUnit(newUnit())
    const updated = await api.updateUnit(created.id, newUnit({ code: 'D-0202', ownerName: 'คนใหม่' }))
    expect(updated).toMatchObject({ id: created.id, code: 'D-0202', tower: 'D', ownerName: 'คนใหม่' })
  })

  it('deletes a unit that has no leases', async () => {
    const api = make()
    const created = await api.createUnit(newUnit())
    await api.deleteUnit(created.id)
    expect((await api.load()).units.some((u) => u.id === created.id)).toBe(false)
  })

  it('refuses to delete a unit that has leases and keeps it', async () => {
    const api = make()
    const data = await api.load()
    const e = await failure(api.deleteUnit(unitByCode(data, 'A-1204').id))
    expect(e?.code).toBe('unit_has_leases')
    expect((await api.load()).units).toHaveLength(24)
  })

  it('refuses to change the code of a unit that has leases', async () => {
    const api = make()
    const u = unitByCode(await api.load(), 'A-1204')
    const { id: _id, tower: _tower, ...input } = u
    const e = await failure(api.updateUnit(u.id, { ...input, code: 'A-1299' }))
    expect(e?.fieldErrors?.code).toBe('property.errors.codeLocked')
  })

  it('reports not_found for unknown ids', async () => {
    const api = make()
    expect((await failure(api.updateUnit('nope', newUnit())))?.code).toBe('not_found')
    expect((await failure(api.deleteUnit('nope')))?.code).toBe('not_found')
  })
})

describe('leases', () => {
  it('creates a lease on a unit for rent', async () => {
    const api = make()
    const u = unitByCode(await api.load(), 'A-1204')
    const lease = await api.createLease(newLease(u.id, { tenantName: '  คุณใหม่  ' }))
    expect(lease.tenantName).toBe('คุณใหม่')
    expect((await api.load()).leases).toHaveLength(10)
  })

  it.each([
    ['owner-occupied', 'A-0801'],
    ['closed', 'B-0302'],
  ])('refuses a lease on a %s unit', async (_n, code) => {
    const api = make()
    const u = unitByCode(await api.load(), code)
    const e = await failure(api.createLease(newLease(u.id)))
    expect(e?.fieldErrors?.unitId).toBe('property.errors.unitNotRentable')
  })

  it('refuses a lease that overlaps, including one that starts on the day another ends', async () => {
    const api = make()
    const data = await api.load()
    const u = unitByCode(data, 'A-1204')
    const existing = leaseOf(data, 'A-1204')
    const e1 = await failure(api.createLease(newLease(u.id, { startDate: addDays(TODAY, 10), endDate: addDays(TODAY, 20) })))
    expect(e1?.fieldErrors?.startDate).toBe('property.errors.leaseOverlap')
    const e2 = await failure(api.createLease(newLease(u.id, { startDate: existing.endDate, endDate: addDays(existing.endDate, 365) })))
    expect(e2?.fieldErrors?.startDate).toBe('property.errors.leaseOverlap')
    const ok = await api.createLease(
      newLease(u.id, { startDate: addDays(existing.endDate, 1), endDate: addDays(existing.endDate, 366) }),
    )
    expect(ok.id).toBeTruthy()
  })

  it('edits a lease without clashing with itself', async () => {
    const api = make()
    const l = leaseOf(await api.load(), 'A-1204')
    const { id, cancelledAt: _c, cancelReason: _r, ...input } = l
    const updated = await api.updateLease(id, { ...input, monthlyRent: l.monthlyRent + 500 })
    expect(updated.monthlyRent).toBe(l.monthlyRent + 500)
  })

  it('locks ended and cancelled leases', async () => {
    const api = make()
    const data = await api.load()
    const ended = leaseOf(data, 'B-0801')
    const cancelled = leaseOf(data, 'B-0802')
    for (const l of [ended, cancelled]) {
      const { id, cancelledAt: _c, cancelReason: _r, ...input } = l
      expect((await failure(api.updateLease(id, input)))?.code).toBe('lease_locked')
      expect((await failure(api.cancelLease(id, 'x')))?.code).toBe('lease_locked')
    }
  })

  it('cancels an active lease once, recording today and the trimmed reason', async () => {
    const api = make()
    const l = leaseOf(await api.load(), 'A-1204')
    const cancelled = await api.cancelLease(l.id, '  ผู้เช่าย้ายออก  ')
    expect(cancelled.cancelledAt).toBe(TODAY)
    expect(cancelled.cancelReason).toBe('ผู้เช่าย้ายออก')
    expect((await failure(api.cancelLease(l.id, 'again')))?.code).toBe('lease_locked')
  })

  it('reports not_found for unknown lease ids', async () => {
    const api = make()
    const { unitId: _u, ...rest } = newLease('x')
    void rest
    expect((await failure(api.updateLease('nope', newLease('x'))))?.code).toBe('not_found')
    expect((await failure(api.cancelLease('nope', '')))?.code).toBe('not_found')
  })
})

describe('inspections', () => {
  it('records a move-in for a lease that has none', async () => {
    const api = make()
    const l = leaseOf(await api.load(), 'A-1902')
    const saved = await api.saveInspection(newInspection(l.id, { inspector: '  สมหญิง  ', date: l.startDate }))
    expect(saved.inspector).toBe('สมหญิง')
    expect((await api.load()).inspections).toHaveLength(7)
  })

  it('rejects a second move-in for the same lease', async () => {
    const api = make()
    const l = leaseOf(await api.load(), 'A-1204') // already has a move-in
    const e = await failure(api.saveInspection(newInspection(l.id, { date: l.startDate })))
    expect(e?.code).toBe('invalid_input')
    expect(e?.fieldErrors?.type).toBe('property.errors.inspectionExists')
  })

  it('edits an existing inspection in place (no duplicate)', async () => {
    const api = make()
    const data = await api.load()
    const existing = data.inspections[0]
    const { id, ...input } = existing
    const saved = await api.saveInspection({ ...input, note: 'แก้ไขแล้ว' }, id)
    expect(saved.id).toBe(id)
    const after = await api.load()
    expect(after.inspections).toHaveLength(data.inspections.length)
    expect(after.inspections.find((i) => i.id === id)?.note).toBe('แก้ไขแล้ว')
  })

  it('reports not_found for an unknown inspection id', async () => {
    const api = make()
    const l = leaseOf(await api.load(), 'A-1902')
    expect((await failure(api.saveInspection(newInspection(l.id), 'nope')))?.code).toBe('not_found')
  })

  it('requires a note for items that are not ok', async () => {
    const api = make()
    const l = leaseOf(await api.load(), 'A-1902')
    const items = okItems().map((i) => (i.key === 'kitchen' ? { ...i, condition: 'damaged' as const } : i))
    const e = await failure(api.saveInspection(newInspection(l.id, { date: l.startDate, items })))
    expect(e?.fieldErrors?.['item:kitchen']).toBe('property.errors.itemNote')
  })
})

describe('data that cannot be trusted', () => {
  const valid = (): PropertyData => makeSeed(TODAY)
  const corrupt: [string, (d: PropertyData) => unknown][] = [
    ['not json', () => 'not json{'],
    ['an empty object', () => ({})],
    ['null', () => null],
    ['an array', () => []],
    ['another version', (d) => ({ ...d, version: 2 })],
    ['units that is not an array', (d) => ({ ...d, units: {} })],
    ['a unit with a wrong type', (d) => ({ ...d, units: [{ ...d.units[0], floor: '12' }, ...d.units.slice(1)] })],
    ['a unit missing fields', (d) => ({ ...d, units: [{ id: 'x' }, ...d.units.slice(1)] })],
    ['a unit with an unknown type', (d) => ({ ...d, units: [{ ...d.units[0], type: 'castle' }, ...d.units.slice(1)] })],
    ['a lease pointing at a unit that does not exist', (d) => ({ ...d, leases: [{ ...d.leases[0], unitId: 'ghost' }, ...d.leases.slice(1)] })],
    ['an inspection pointing at a lease that does not exist', (d) => ({ ...d, inspections: [{ ...d.inspections[0], leaseId: 'ghost' }, ...d.inspections.slice(1)] })],
    ['duplicate unit codes', (d) => ({ ...d, units: [d.units[0], { ...d.units[1], code: d.units[0].code }, ...d.units.slice(2)] })],
    ['duplicate ids', (d) => ({ ...d, units: [d.units[0], { ...d.units[1], id: d.units[0].id }, ...d.units.slice(2)] })],
    ['an impossible lease date', (d) => ({ ...d, leases: [{ ...d.leases[0], startDate: '2026-02-30' }, ...d.leases.slice(1)] })],
    ['an inspection with fewer than 8 items', (d) => ({ ...d, inspections: [{ ...d.inspections[0], items: d.inspections[0].items.slice(1) }, ...d.inspections.slice(1)] })],
  ]

  it.each(corrupt)('starts again from sample data when storage holds %s', async (_name, build) => {
    const storage = new MemoryStorage()
    const raw = build(valid())
    storage.setItem(PROPERTY_KEY, typeof raw === 'string' ? raw : JSON.stringify(raw))
    const data = await make(storage).load()
    expect(data.units).toHaveLength(24)
    expect(data.leases).toHaveLength(9)
    const stored = JSON.parse(storage.getItem(PROPERTY_KEY) as string)
    expect(stored.version).toBe(1)
    expect(stored.units).toHaveLength(24)
  })

  it('accepts stored data that is valid', async () => {
    const storage = new MemoryStorage()
    const d = valid()
    d.units[0].ownerName = 'เจ้าของที่แก้ไว้'
    storage.setItem(PROPERTY_KEY, JSON.stringify(d))
    expect((await make(storage).load()).units[0].ownerName).toBe('เจ้าของที่แก้ไว้')
  })
})

describe('storage that fails', () => {
  const works = async (api: PropertyApi) => {
    expect((await api.load()).units).toHaveLength(24)
    const created = await api.createUnit(newUnit())
    expect(unitByCode(await api.load(), 'C-0101').id).toBe(created.id)
  }

  it('works in memory when reading throws', async () => works(make(new UnreadableStorage())))
  it('works in memory when writing throws', async () => works(make(new UnwritableStorage())))
  it('works with no storage at all', async () => works(make(null)))
})

describe('a failure is not cached', () => {
  it('retries after a temporary failure while loading', async () => {
    let calls = 0
    const api = make(new MemoryStorage(), () => {
      if (calls++ === 0) throw new Error('clock unavailable')
      return TODAY
    })
    await expect(api.load()).rejects.toThrow('clock unavailable')
    expect((await api.load()).units).toHaveLength(24)
  })
})

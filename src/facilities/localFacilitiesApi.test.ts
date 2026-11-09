import { describe, expect, it } from 'vitest'
import { DEMO_TENANT_PHONE } from '../auth/demoAccounts'
import { addDays } from '../property/dates'
import { createLocalPropertyApi } from '../property/localPropertyApi'
import { makeSeed as makePropertySeed } from '../property/seed'
import type { Lease, PropertyApi, PropertyData } from '../property/types'
import { MemoryStorage, UnreadableStorage, UnwritableStorage } from '../test/memoryStorage'
import { FACILITIES_KEY, createLocalFacilitiesApi } from './localFacilitiesApi'
import { weekStart } from './rules'
import { makeFacilitiesSeed } from './seed'
import { FacilitiesError, type Booking, type CreateBookingInput, type FacilitiesApi, type FacilitiesData } from './types'

const TODAY = '2026-11-08'
const day = (n: number) => addDays(TODAY, n)

const makeProperty = (): PropertyApi => createLocalPropertyApi({ storage: null, today: () => TODAY })
const make = (storage: Storage | null = new MemoryStorage(), property: PropertyApi = makeProperty()): FacilitiesApi =>
  createLocalFacilitiesApi({ storage, today: () => TODAY, property })

const failure = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e as FacilitiesError
  }
  return null
}

const propertyData = (): PropertyData => makePropertySeed(TODAY)
const seeded = (): FacilitiesData => makeFacilitiesSeed(propertyData(), TODAY)
const active = (l: Lease) => !l.cancelledAt && l.startDate <= TODAY && TODAY <= l.endDate
const activeLeases = () => propertyData().leases.filter(active)
const facility = (data: FacilitiesData, key: string) => data.facilities.find((f) => f.key === key)!
const unitCode = (id: string) => propertyData().units.find((u) => u.id === id)!.code

class FullStorage extends MemoryStorage {
  full = false
  setItem(key: string, value: string) {
    if (this.full) throw new Error('QuotaExceededError')
    super.setItem(key, value)
  }
}

const request = (facilityId: string, over: Partial<CreateBookingInput> = {}): CreateBookingInput => ({
  facilityId,
  date: day(5),
  startHour: 9,
  endHour: 11,
  people: 2,
  tenantPhone: DEMO_TENANT_PHONE,
  tenantName: 'สมชาย ผู้เช่า',
  ...over,
})

/** a valid booking record for crafting stored data */
const record = (n: number, facilityId: string, unitId: string, over: Partial<Booking> = {}): Booking => ({
  id: `crafted-${n}`,
  code: `BK-${String(900 + n).padStart(4, '0')}`,
  facilityId,
  unitId,
  unitCode: unitCode(unitId),
  leaseId: 'l',
  tenantName: 'คนอื่น',
  tenantPhone: '0800009999',
  date: day(5),
  startHour: 9,
  endHour: 10,
  people: 5,
  status: 'confirmed',
  createdAt: TODAY,
  history: [
    { status: 'pending', at: TODAY, note: '', byName: 'คนอื่น' },
    { status: 'confirmed', at: TODAY, note: '', byName: 'สมหญิง นิติบุคคล' },
  ],
  ...over,
})

/** storage that holds the sample data with its bookings replaced */
function storageWith(bookings: (data: FacilitiesData) => Booking[]) {
  const data = seeded()
  data.bookings = bookings(data)
  data.notifications = []
  const storage = new MemoryStorage()
  storage.setItem(FACILITIES_KEY, JSON.stringify(data))
  return storage
}

/** units that are not the demo tenant's, used to fill a facility */
const otherUnits = () => activeLeases().filter((l) => l.tenantPhone !== DEMO_TENANT_PHONE).map((l) => l.unitId)

describe('seeding and persistence', () => {
  it('seeds sample data into an empty storage, exactly', async () => {
    const storage = new MemoryStorage()
    expect(await make(storage).load()).toEqual(seeded())
    expect(JSON.parse(storage.getItem(FACILITIES_KEY) as string)).toEqual(seeded())
  })

  it('returns a copy: changing the result does not change the stored data', async () => {
    const api = make()
    const first = await api.load()
    first.bookings.length = 0
    expect((await api.load()).bookings.length).toBeGreaterThan(0)
  })

  it('sees what another tab wrote, because it reads storage on every call', async () => {
    const storage = new MemoryStorage()
    const property = makeProperty()
    const [a, b] = [make(storage, property), make(storage, property)]
    const data = await a.load()
    const created = await b.createBooking(request(facility(data, 'meeting').id, { date: day(9) }))
    expect((await a.load()).bookings.some((x) => x.id === created.id)).toBe(true)
  })
})

describe('createBooking', () => {
  it('creates a pending booking with the next code, a snapshot of unit and tenant, one history entry, and tells the juristic office once', async () => {
    const api = make()
    const before = await api.load()
    const created = await api.createBooking(request(facility(before, 'meeting').id, { date: day(9), startHour: 14, endHour: 16 }))
    expect(created.code).toBe(`BK-${String(before.bookings.length + 1).padStart(4, '0')}`)
    expect(created).toMatchObject({ status: 'pending', unitCode: 'A-1204', tenantPhone: DEMO_TENANT_PHONE, tenantName: 'คุณอลิสา ชัยวงศ์', createdAt: TODAY, people: 2, date: day(9) })
    expect(created.history).toEqual([{ status: 'pending', at: TODAY, note: '', byName: 'สมชาย ผู้เช่า' }])
    const after = await api.load()
    expect(after.bookings.find((b) => b.id === created.id)).toEqual(created)
    expect(after.notifications.slice(before.notifications.length)).toEqual([expect.objectContaining({ type: 'bookingCreated', refId: created.id, recipient: 'role:juristic', read: false })])
  })

  it('refuses incomplete or impossible input with the field messages and creates nothing', async () => {
    const api = make()
    const before = await api.load()
    const e = await failure(api.createBooking(request(facility(before, 'pool').id, { date: TODAY, startHour: 9, endHour: 14, people: 0 })))
    expect(e?.code).toBe('invalid_input')
    expect(e?.fieldErrors).toMatchObject({ date: 'facilities.errors.date', time: 'facilities.errors.time', people: 'facilities.errors.people' })
    expect((await failure(api.createBooking(request('ghost'))))?.fieldErrors?.facilityId).toBe('facilities.errors.facility')
    expect(await api.load()).toEqual(before)
  })

  it('refuses a tenant without an active lease: none at all, expired, cancelled or not started yet', async () => {
    const api = make()
    const data = await api.load()
    const p = propertyData()
    const phones = new Set(activeLeases().map((l) => l.tenantPhone))
    const cases = ['0899999999', p.leases.find((l) => !l.cancelledAt && l.endDate < TODAY)?.tenantPhone, p.leases.find((l) => l.cancelledAt)?.tenantPhone, p.leases.find((l) => !l.cancelledAt && l.startDate > TODAY)?.tenantPhone]
    const without = cases.filter((x): x is string => x !== undefined && !phones.has(x))
    expect(without.length).toBeGreaterThanOrEqual(3)
    for (const phone of without) expect((await failure(api.createBooking(request(facility(data, 'pool').id, { tenantPhone: phone, date: day(11) }))))?.code).toBe('no_lease')
  })

  it('refuses a facility that is closed, and takes it again once it is open', async () => {
    const api = make()
    const data = await api.load()
    const bbq = facility(data, 'bbq')
    expect(bbq.closed).toBe(true)
    expect((await failure(api.createBooking(request(bbq.id, { startHour: 12, endHour: 14, date: day(11) }))))?.code).toBe('closed')
    await api.setFacilityClosed(bbq.id, false, '')
    await expect(api.createBooking(request(bbq.id, { startHour: 12, endHour: 14, date: day(11) }))).resolves.toBeDefined()
  })

  it('takes a booking that exactly fills the hour and refuses one person more, checking every hour', async () => {
    const pool = facility(seeded(), 'pool')
    const units = otherUnits()
    const storage = storageWith(() => [record(1, pool.id, units[0], { startHour: 9, endHour: 10, people: 5 }), record(2, pool.id, units[1], { startHour: 9, endHour: 11, people: 5 }), record(3, pool.id, units[2], { startHour: 9, endHour: 10, people: 5 })]) // hour 9: 15, hour 10: 5
    const api = make(storage)
    await expect(api.createBooking(request(pool.id, { startHour: 9, endHour: 10, people: 5 }))).resolves.toBeDefined() // exactly full: 20 of 20
    const full = (await api.load()).bookings.filter((b) => b.date === day(5) && b.facilityId === pool.id)
    expect(full.reduce((n, b) => n + (b.startHour <= 9 && b.endHour > 9 ? b.people : 0), 0)).toBe(20)
    expect((await failure(api.createBooking(request(pool.id, { startHour: 9, endHour: 10, people: 1, tenantPhone: '0810000002', date: day(5) }))))?.code).toBe('no_capacity')
    // a longer request is refused as soon as ONE of its hours is full
    expect((await failure(api.createBooking(request(pool.id, { startHour: 8, endHour: 11, people: 1, tenantPhone: '0810000002' }))))?.code).toBe('no_capacity')
    // but hour 10 alone still has room
    await expect(api.createBooking(request(pool.id, { startHour: 10, endHour: 11, people: 5, tenantPhone: '0810000002' }))).resolves.toBeDefined()
  })

  it('does not count rejected or cancelled bookings against the capacity', async () => {
    const pool = facility(seeded(), 'pool')
    const units = otherUnits()
    const storage = storageWith(() => [
      record(1, pool.id, units[0], { people: 5, status: 'rejected', history: [{ status: 'pending', at: TODAY, note: '', byName: 'x' }, { status: 'rejected', at: TODAY, note: 'เต็ม', byName: 'y' }] }),
      record(2, pool.id, units[1], { people: 5, status: 'cancelled', history: [{ status: 'pending', at: TODAY, note: '', byName: 'x' }, { status: 'cancelled', at: TODAY, note: '', byName: 'x' }] }),
    ])
    await expect(make(storage).createBooking(request(pool.id, { people: 5, startHour: 9, endHour: 10 }))).resolves.toBeDefined()
  })

  it('allows two bookings a week for a unit, refuses the third, and gives the place back when one is cancelled or rejected', async () => {
    // two days in the same Monday–Sunday week, both within the 14 days
    const first = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].find((n) => weekStart(day(n)) === weekStart(day(n + 1)))!
    const [d1, d2, d3] = [day(first), day(first + 1), day(first)]
    const empty = storageWith(() => [])
    const api = make(empty)
    const data = await api.load()
    const meeting = facility(data, 'meeting').id
    const one = await api.createBooking(request(meeting, { date: d1 }))
    await api.createBooking(request(meeting, { date: d2, startHour: 12, endHour: 13 }))
    expect((await failure(api.createBooking(request(meeting, { date: d3, startHour: 15, endHour: 16 }))))?.code).toBe('quota_exceeded')
    await api.cancelBooking(one.id, DEMO_TENANT_PHONE)
    await expect(api.createBooking(request(meeting, { date: d3, startHour: 15, endHour: 16 }))).resolves.toBeDefined()
    // rejecting one of the two gives a place back as well
    const third = await failure(api.createBooking(request(meeting, { date: d1, startHour: 17, endHour: 18 })))
    expect(third?.code).toBe('quota_exceeded')
    const pending = (await api.load()).bookings.find((b) => b.status === 'pending' && b.date === d2)!
    await api.decideBooking(pending.id, 'rejected', 'ปิดซ่อม', 'สมหญิง นิติบุคคล')
    await expect(api.createBooking(request(meeting, { date: d1, startHour: 17, endHour: 18 }))).resolves.toBeDefined()
  })

  it('counts the quota per week of the day of use: two bookings in the next week are fine after two this week', async () => {
    const monday = [1, 2, 3, 4, 5, 6, 7].find((n) => weekStart(day(n)) === day(n))! // a Monday
    const api = make(storageWith(() => []))
    const meeting = facility(await api.load(), 'meeting').id
    await api.createBooking(request(meeting, { date: day(monday), startHour: 9, endHour: 10 }))
    await api.createBooking(request(meeting, { date: day(monday + 1), startHour: 9, endHour: 10 }))
    await expect(api.createBooking(request(meeting, { date: day(monday + 7), startHour: 9, endHour: 10 }))).resolves.toBeDefined()
  })

  it('takes only one of two tabs that book the last free places at the same moment', async () => {
    const pool = facility(seeded(), 'pool')
    const units = otherUnits()
    const storage = storageWith(() => [record(1, pool.id, units[0]), record(2, pool.id, units[1]), record(3, pool.id, units[2])]) // 15 of 20 at hour 9
    const property = makeProperty()
    const [a, b] = [make(storage, property), make(storage, property)]
    const results = await Promise.allSettled([a.createBooking(request(pool.id, { startHour: 9, endHour: 10, people: 5 })), b.createBooking(request(pool.id, { startHour: 9, endHour: 10, people: 5, tenantPhone: '0810000002' }))])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => (r.reason as FacilitiesError).code)).toEqual(['no_capacity'])
    const load = (await a.load()).bookings.filter((x) => x.facilityId === pool.id && x.date === day(5) && x.startHour <= 9 && x.endHour > 9).reduce((n, x) => n + x.people, 0)
    expect(load).toBeLessThanOrEqual(20)
  })

  it('takes only one of two tabs that use the last place of a unit’s weekly quota, and gives different codes otherwise', async () => {
    const first = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].find((n) => weekStart(day(n)) === weekStart(day(n + 1)))!
    const storage = storageWith(() => [])
    const property = makeProperty()
    const [a, b] = [make(storage, property), make(storage, property)]
    const meeting = facility(await a.load(), 'meeting').id
    await a.createBooking(request(meeting, { date: day(first), startHour: 8, endHour: 9 }))
    const results = await Promise.allSettled([a.createBooking(request(meeting, { date: day(first), startHour: 10, endHour: 11 })), b.createBooking(request(meeting, { date: day(first + 1), startHour: 10, endHour: 11 }))])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => (r.reason as FacilitiesError).code)).toEqual(['quota_exceeded'])
    const codes = (await a.load()).bookings.map((x) => x.code)
    expect(new Set(codes).size).toBe(codes.length)
  })
})

describe('cancelBooking', () => {
  it('lets the owner cancel a pending or confirmed booking before its day, and tells the juristic office', async () => {
    const api = make()
    const data = await api.load()
    const mine = data.bookings.filter((b) => b.tenantPhone === DEMO_TENANT_PHONE && (b.status === 'pending' || b.status === 'confirmed') && b.date > TODAY)
    expect(mine.length).toBeGreaterThanOrEqual(2)
    const updated = await api.cancelBooking(mine[0].id, DEMO_TENANT_PHONE)
    expect(updated.status).toBe('cancelled')
    expect(updated.history.at(-1)).toMatchObject({ status: 'cancelled', at: TODAY })
    const added = (await api.load()).notifications.slice(data.notifications.length)
    expect(added).toEqual([expect.objectContaining({ type: 'bookingCancelled', refId: mine[0].id, recipient: 'role:juristic' })])
    await expect(api.cancelBooking(mine[1].id, DEMO_TENANT_PHONE)).resolves.toBeDefined()
  })

  it('refuses the day itself, a past day, a finished status, somebody else’s booking and a ghost', async () => {
    const meeting = facility(seeded(), 'meeting').id
    const units = otherUnits()
    const storage = storageWith(() => [
      record(1, meeting, activeLeases().find((l) => l.tenantPhone === DEMO_TENANT_PHONE)!.unitId, { tenantPhone: DEMO_TENANT_PHONE, date: TODAY, startHour: 9, endHour: 10, status: 'confirmed' }),
      record(2, meeting, activeLeases().find((l) => l.tenantPhone === DEMO_TENANT_PHONE)!.unitId, { tenantPhone: DEMO_TENANT_PHONE, date: day(-3), startHour: 9, endHour: 10, status: 'confirmed' }),
      record(3, meeting, units[0], { tenantPhone: '0810000002', date: day(5), startHour: 9, endHour: 10, status: 'pending', history: [{ status: 'pending', at: TODAY, note: '', byName: 'x' }] }),
    ])
    const api = make(storage)
    const before = await api.load()
    expect((await failure(api.cancelBooking('crafted-1', DEMO_TENANT_PHONE)))?.code).toBe('invalid_transition')
    expect((await failure(api.cancelBooking('crafted-2', DEMO_TENANT_PHONE)))?.code).toBe('invalid_transition')
    expect((await failure(api.cancelBooking('crafted-3', DEMO_TENANT_PHONE)))?.code).toBe('not_owner')
    expect((await failure(api.cancelBooking('ghost', DEMO_TENANT_PHONE)))?.code).toBe('not_found')
    await api.cancelBooking('crafted-3', '0810000002')
    expect((await failure(api.cancelBooking('crafted-3', '0810000002')))?.code).toBe('invalid_transition')
    expect((await api.load()).notifications).toHaveLength(before.notifications.length + 1)
  })
})

describe('decideBooking', () => {
  const pendingOf = (data: FacilitiesData) => data.bookings.find((b) => b.status === 'pending' && b.date >= TODAY)!

  it('confirms a pending booking and tells the tenant once, with the status', async () => {
    const api = make()
    const data = await api.load()
    const target = pendingOf(data)
    const updated = await api.decideBooking(target.id, 'confirmed', '', 'สมหญิง นิติบุคคล')
    expect(updated.status).toBe('confirmed')
    expect(updated.history.at(-1)).toEqual({ status: 'confirmed', at: TODAY, note: '', byName: 'สมหญิง นิติบุคคล' })
    const added = (await api.load()).notifications.slice(data.notifications.length)
    expect(added).toEqual([expect.objectContaining({ type: 'bookingDecided', refId: target.id, recipient: target.tenantPhone, status: 'confirmed', read: false })])
  })

  it('rejects with a trimmed reason, and refuses a rejection without one or over 300 characters', async () => {
    const api = make()
    const data = await api.load()
    const target = pendingOf(data)
    for (const bad of ['', '   ', 'x'.repeat(301)]) {
      const e = await failure(api.decideBooking(target.id, 'rejected', bad, 'x'))
      expect(e?.code).toBe('invalid_input')
      expect(e?.fieldErrors?.reason).toBe('facilities.errors.reason')
    }
    expect(await api.load()).toEqual(data)
    const updated = await api.decideBooking(target.id, 'rejected', '  ช่วงนั้นมีกิจกรรม  ', 'x')
    expect(updated.history.at(-1)).toMatchObject({ status: 'rejected', note: 'ช่วงนั้นมีกิจกรรม' })
  })

  it('refuses to decide twice, after a cancellation or after the day, and adds no second notice', async () => {
    const api = make()
    const data = await api.load()
    const target = pendingOf(data)
    await api.decideBooking(target.id, 'confirmed', '', 'x')
    const count = (await api.load()).notifications.length
    expect((await failure(api.decideBooking(target.id, 'confirmed', '', 'x')))?.code).toBe('invalid_transition')
    expect((await failure(api.decideBooking(target.id, 'rejected', 'ไม่ว่าง', 'x')))?.code).toBe('invalid_transition')
    const other = data.bookings.find((b) => b.status === 'pending' && b.id !== target.id && b.date > TODAY)!
    await api.cancelBooking(other.id, other.tenantPhone)
    expect((await failure(api.decideBooking(other.id, 'confirmed', '', 'x')))?.code).toBe('invalid_transition')
    expect((await failure(api.decideBooking('ghost', 'confirmed', '', 'x')))?.code).toBe('not_found')
    const meeting = facility(data, 'meeting').id
    const storage = storageWith(() => [record(1, meeting, otherUnits()[0], { date: day(-1), status: 'pending', history: [{ status: 'pending', at: day(-3), note: '', byName: 'x' }] })])
    expect((await failure(make(storage).decideBooking('crafted-1', 'confirmed', '', 'x')))?.code).toBe('invalid_transition')
    expect((await api.load()).notifications.length).toBe(count + 1) // only the cancellation above
  })

  it('gives one result, and one notice, when two tabs decide the same booking at once', async () => {
    const storage = new MemoryStorage()
    const property = makeProperty()
    const [a, b] = [make(storage, property), make(storage, property)]
    const data = await a.load()
    const target = pendingOf(data)
    const results = await Promise.allSettled([a.decideBooking(target.id, 'confirmed', '', 'A'), b.decideBooking(target.id, 'rejected', 'ไม่ว่าง', 'B')])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect((await a.load()).notifications.filter((n) => n.type === 'bookingDecided' && n.refId === target.id)).toHaveLength(1)
  })
})

describe('setFacilityClosed', () => {
  it('closes with a trimmed note and opens again, without touching the bookings that exist', async () => {
    const api = make()
    const data = await api.load()
    const pool = facility(data, 'pool')
    const closed = await api.setFacilityClosed(pool.id, true, '  ซ่อมระบบน้ำ  ')
    expect(closed).toMatchObject({ closed: true, closedNote: 'ซ่อมระบบน้ำ' })
    expect((await failure(api.createBooking(request(pool.id, { date: day(11) }))))?.code).toBe('closed')
    expect((await api.load()).bookings).toEqual(data.bookings)
    const open = await api.setFacilityClosed(pool.id, false, 'ไม่ใช้')
    expect(open.closed).toBe(false)
    expect(open.closedNote).toBeUndefined()
  })

  it('refuses a ghost facility and a note over 300 characters', async () => {
    const api = make()
    const data = await api.load()
    expect((await failure(api.setFacilityClosed('ghost', true, '')))?.code).toBe('not_found')
    const e = await failure(api.setFacilityClosed(facility(data, 'pool').id, true, 'x'.repeat(301)))
    expect(e?.code).toBe('invalid_input')
    expect(e?.fieldErrors?.note).toBe('facilities.errors.note')
  })
})

describe('parcels', () => {
  const unitWith = (phone: string) => activeLeases().find((l) => l.tenantPhone === phone)!
  const parcelInput = (unitId: string, over = {}) => ({ unitId, carrier: '  Kerry Express ', trackingNo: ' TH123 ', location: 'frontDesk' as const, ...over })

  it('registers a parcel for a unit with an active lease: next code, waiting, a snapshot of that tenant, and a notice to that phone only', async () => {
    const api = make()
    const data = await api.load()
    const lease = unitWith(DEMO_TENANT_PHONE)
    const parcel = await api.registerParcel(parcelInput(lease.unitId), 'สมหญิง นิติบุคคล')
    expect(parcel).toMatchObject({ code: `PK-${String(data.parcels.length + 1).padStart(4, '0')}`, status: 'waiting', carrier: 'Kerry Express', trackingNo: 'TH123', location: 'frontDesk', unitCode: 'A-1204', tenantPhone: DEMO_TENANT_PHONE, tenantName: lease.tenantName, registeredAt: TODAY })
    expect(parcel.history).toEqual([{ status: 'waiting', at: TODAY, note: '', byName: 'สมหญิง นิติบุคคล' }])
    const added = (await api.load()).notifications.slice(data.notifications.length)
    expect(added).toEqual([expect.objectContaining({ type: 'parcelArrived', refId: parcel.id, recipient: DEMO_TENANT_PHONE, read: false })])
  })

  it('leaves the tracking number out when it is empty', async () => {
    const api = make()
    const parcel = await api.registerParcel(parcelInput(unitWith(DEMO_TENANT_PHONE).unitId, { trackingNo: '   ' }), 'x')
    expect(parcel.trackingNo).toBeUndefined()
  })

  it('refuses a unit without an active lease (expired, cancelled, not started, owner only), a ghost unit and bad input', async () => {
    const api = make()
    const data = await api.load()
    const p = propertyData()
    const leased = new Set(activeLeases().map((l) => l.unitId))
    const bare = p.units.filter((u) => !leased.has(u.id))
    expect(bare.length).toBeGreaterThanOrEqual(3)
    for (const u of bare.slice(0, 4)) expect((await failure(api.registerParcel(parcelInput(u.id), 'x')))?.code).toBe('no_lease')
    expect((await failure(api.registerParcel(parcelInput('ghost'), 'x')))?.code).toBe('not_found')
    const e = await failure(api.registerParcel(parcelInput(unitWith(DEMO_TENANT_PHONE).unitId, { carrier: '', trackingNo: 'x'.repeat(41), location: 'roof' }), 'x'))
    expect(e?.code).toBe('invalid_input')
    expect(Object.keys(e?.fieldErrors ?? {}).sort()).toEqual(['carrier', 'location', 'trackingNo'])
    expect(await api.load()).toEqual(data)
  })

  it('marks a parcel picked up once, with a trimmed note, and refuses a second time or a long note', async () => {
    const api = make()
    const data = await api.load()
    const target = data.parcels.find((x) => x.status === 'waiting')!
    const e = await failure(api.markPickedUp(target.id, 'x'.repeat(301), 'x'))
    expect(e?.fieldErrors?.note).toBe('facilities.errors.note')
    const done = await api.markPickedUp(target.id, '  รับโดยญาติ  ', 'สมหญิง นิติบุคคล')
    expect(done.status).toBe('pickedUp')
    expect(done.history.at(-1)).toEqual({ status: 'pickedUp', at: TODAY, note: 'รับโดยญาติ', byName: 'สมหญิง นิติบุคคล' })
    expect((await failure(api.markPickedUp(target.id, '', 'x')))?.code).toBe('invalid_transition')
    expect((await failure(api.markPickedUp('ghost', '', 'x')))?.code).toBe('not_found')
  })

  it('does not register the same parcel twice from two tabs with different codes', async () => {
    const storage = new MemoryStorage()
    const property = makeProperty()
    const [a, b] = [make(storage, property), make(storage, property)]
    await a.load()
    const unitId = unitWith(DEMO_TENANT_PHONE).unitId
    const [x, y] = await Promise.all([a.registerParcel(parcelInput(unitId), 'A'), b.registerParcel(parcelInput(unitId), 'B')])
    expect(x.code).not.toBe(y.code)
    const codes = (await a.load()).parcels.map((p) => p.code)
    expect(new Set(codes).size).toBe(codes.length)
  })
})

describe('markRead and markAllRead', () => {
  it('marks one notification read, ignores one that does not exist, and marks all of one recipient', async () => {
    const api = make()
    const data = await api.load()
    const unread = data.notifications.find((n) => !n.read)!
    await api.markRead(unread.id)
    expect((await api.load()).notifications.find((n) => n.id === unread.id)!.read).toBe(true)
    await expect(api.markRead('ghost')).resolves.toBeUndefined()
    const others = data.notifications.filter((n) => n.recipient !== DEMO_TENANT_PHONE && !n.read).length
    await api.markAllRead(DEMO_TENANT_PHONE)
    const after = await api.load()
    expect(after.notifications.filter((n) => n.recipient === DEMO_TENANT_PHONE).every((n) => n.read)).toBe(true)
    expect(after.notifications.filter((n) => n.recipient !== DEMO_TENANT_PHONE && !n.read)).toHaveLength(others - (unread.recipient !== DEMO_TENANT_PHONE ? 1 : 0))
  })
})

describe('a full or unwritable storage', () => {
  const writes: [string, (api: FacilitiesApi, d: FacilitiesData) => Promise<unknown>][] = [
    ['booking', (api, d) => api.createBooking(request(facility(d, 'meeting').id, { date: day(11) }))],
    ['cancelling', (api, d) => api.cancelBooking(d.bookings.find((b) => b.tenantPhone === DEMO_TENANT_PHONE && (b.status === 'pending' || b.status === 'confirmed') && b.date > TODAY)!.id, DEMO_TENANT_PHONE)],
    ['deciding', (api, d) => api.decideBooking(d.bookings.find((b) => b.status === 'pending' && b.date >= TODAY)!.id, 'confirmed', '', 'x')],
    ['closing a facility', (api, d) => api.setFacilityClosed(facility(d, 'pool').id, true, '')],
    ['registering a parcel', (api) => api.registerParcel({ unitId: activeLeases().find((l) => l.tenantPhone === DEMO_TENANT_PHONE)!.unitId, carrier: 'Kerry', trackingNo: '', location: 'locker' }, 'x')],
    ['marking a parcel picked up', (api, d) => api.markPickedUp(d.parcels.find((p) => p.status === 'waiting')!.id, '', 'x')],
  ]

  it.each(writes)('refuses %s with storage_failed when the storage became full, keeps everything, and works again once there is room', async (_name, run) => {
    const storage = new FullStorage()
    const api = make(storage)
    const before = await api.load()
    storage.full = true
    expect((await failure(run(api, before)))?.code).toBe('storage_failed')
    storage.full = false
    expect(await api.load()).toEqual(before)
    await expect(run(api, before)).resolves.toBeDefined()
  })

  it.each(writes)('refuses %s when the storage can never be written, instead of keeping it only in memory', async (_name, run) => {
    const api = make(new UnwritableStorage())
    const before = await api.load()
    expect((await failure(run(api, before)))?.code).toBe('storage_failed')
    expect(await api.load()).toEqual(before)
  })

  it('still works when reading throws, and with no storage at all', async () => {
    for (const storage of [new UnreadableStorage(), null]) {
      const api = make(storage)
      const d = await api.load()
      await expect(writes[3][1](api, d)).resolves.toBeDefined()
    }
  })
})

describe('data that cannot be trusted', () => {
  type Edit = (d: FacilitiesData) => unknown
  const withBooking = (d: FacilitiesData, over: Partial<Booking>) => ({ ...d, bookings: [{ ...d.bookings[0], ...over }, ...d.bookings.slice(1)] })
  const corrupt: [string, Edit][] = [
    ['not json', () => 'not json{'],
    ['an empty object', () => ({})],
    ['null', () => null],
    ['an array', () => []],
    ['another version', (d) => ({ ...d, version: 2 })],
    ['bookings that is not an array', (d) => ({ ...d, bookings: {} })],
    ['two bookings with the same id', (d) => ({ ...d, bookings: [d.bookings[0], { ...d.bookings[1], id: d.bookings[0].id }, ...d.bookings.slice(2)] })],
    ['two bookings with the same code', (d) => ({ ...d, bookings: [d.bookings[0], { ...d.bookings[1], code: d.bookings[0].code }, ...d.bookings.slice(2)] })],
    ['a booking code of the wrong shape', (d) => withBooking(d, { code: 'B-1' })],
    ['an unknown facility key', (d) => ({ ...d, facilities: [{ ...d.facilities[0], key: 'sauna' as never }, ...d.facilities.slice(1)] })],
    ['a booking of a facility that does not exist', (d) => withBooking(d, { facilityId: 'ghost' })],
    ['an unknown status', (d) => withBooking(d, { status: 'lost' as never })],
    ['hours outside the opening hours', (d) => withBooking(d, { startHour: 2, endHour: 4 })],
    ['a booking of four hours', (d) => withBooking(d, { startHour: 8, endHour: 12 })],
    ['a fractional hour', (d) => withBooking(d, { startHour: 8.5 })],
    ['more than five people', (d) => withBooking(d, { people: 6 })],
    ['an impossible date', (d) => withBooking(d, { date: '2026-02-30' })],
    ['an empty history', (d) => withBooking(d, { history: [] })],
    ['a history that does not start with pending', (d) => withBooking(d, { history: [{ status: 'confirmed', at: TODAY, note: '', byName: 'x' }], status: 'confirmed' })],
    ['a history that does not end in the current status', (d) => withBooking(d, { status: d.bookings[0].status === 'cancelled' ? 'pending' : 'cancelled' })],
    ['a history that goes back from rejected to confirmed', (d) => withBooking(d, { status: 'confirmed', history: [{ status: 'pending', at: TODAY, note: '', byName: 'x' }, { status: 'rejected', at: TODAY, note: 'x', byName: 'x' }, { status: 'confirmed', at: TODAY, note: '', byName: 'x' }] })],
    ['bookings that overfill a facility', (d) => ({ ...d, bookings: [...d.bookings, ...Array.from({ length: 5 }, (_, i) => record(i + 1, facility(d, 'pool').id, d.bookings[0].unitId, { date: day(12), startHour: 7, endHour: 8 }))] })],
    ['three active bookings of one unit in one week', (d) => ({ ...d, bookings: [...d.bookings, ...Array.from({ length: 3 }, (_, i) => record(i + 1, facility(d, 'meeting').id, d.bookings[0].unitId, { date: day(12), startHour: 8 + i, endHour: 9 + i, people: 1 }))] })],
    ['a parcel code of the wrong shape', (d) => ({ ...d, parcels: [{ ...d.parcels[0], code: 'P1' }, ...d.parcels.slice(1)] })],
    ['a parcel with an empty carrier', (d) => ({ ...d, parcels: [{ ...d.parcels[0], carrier: ' ' }, ...d.parcels.slice(1)] })],
    ['a parcel with an unknown place', (d) => ({ ...d, parcels: [{ ...d.parcels[0], location: 'roof' as never }, ...d.parcels.slice(1)] })],
    ['a parcel history that skips', (d) => ({ ...d, parcels: [{ ...d.parcels[0], status: 'pickedUp' as const, history: [{ status: 'pickedUp' as const, at: TODAY, note: '', byName: 'x' }] }, ...d.parcels.slice(1)] })],
    ['a notification for a booking that does not exist', (d) => ({ ...d, notifications: [{ ...d.notifications[0], refId: 'ghost' }, ...d.notifications.slice(1)] })],
    ['a notification of an unknown type', (d) => ({ ...d, notifications: [{ ...d.notifications[0], type: 'ping' as never }, ...d.notifications.slice(1)] })],
    ['bookings and parcels that all refer to units that do not exist', (d) => ({ ...d, bookings: d.bookings.map((b) => ({ ...b, unitId: 'ghost-' + b.unitId })), parcels: d.parcels.map((p) => ({ ...p, unitId: 'ghost-' + p.unitId })) })],
  ]

  it.each(corrupt)('starts again from sample data when storage holds %s', async (_name, build) => {
    const storage = new MemoryStorage()
    const raw = build(seeded())
    storage.setItem(FACILITIES_KEY, typeof raw === 'string' ? raw : JSON.stringify(raw))
    const data = await make(storage).load()
    expect(data).toEqual(seeded()) // exactly the sample data again: untrusted data must not be kept, even partly
    expect(JSON.parse(storage.getItem(FACILITIES_KEY) as string)).toEqual(seeded())
  })

  it('accepts stored data that is valid', async () => {
    const storage = new MemoryStorage()
    const d = seeded()
    d.facilities[0].closed = true
    storage.setItem(FACILITIES_KEY, JSON.stringify(d))
    expect((await make(storage).load()).facilities[0].closed).toBe(true)
  })

  it('keeps everything when a property edit leaves some references dangling (a lease moved, a unit deleted)', async () => {
    const storage = new MemoryStorage()
    const before = seeded()
    storage.setItem(FACILITIES_KEY, JSON.stringify(before))
    const full = propertyData()
    const unit = before.bookings[0].unitId
    const moved: PropertyData = { ...full, leases: full.leases.map((l) => (l.unitId === unit ? { ...l, unitId: full.units.find((u) => u.id !== unit)!.id } : l)), inspections: [] }
    const deleted: PropertyData = { ...full, units: full.units.filter((u) => u.id !== unit), leases: full.leases.filter((l) => l.unitId !== unit), inspections: [] }
    for (const edited of [moved, deleted]) {
      const stubbed: PropertyApi = { ...makeProperty(), load: async () => edited }
      expect(await createLocalFacilitiesApi({ storage, today: () => TODAY, property: stubbed }).load()).toEqual(before)
    }
  })

  it('starts again from sample data when none of the units it refers to exist (the property data was replaced)', async () => {
    const storage = new MemoryStorage()
    storage.setItem(FACILITIES_KEY, JSON.stringify(seeded()))
    const full = propertyData()
    const renamed: PropertyData = { ...full, units: full.units.map((u) => ({ ...u, id: 'x-' + u.id })), leases: full.leases.map((l) => ({ ...l, unitId: 'x-' + l.unitId })), inspections: [] }
    const stubbed: PropertyApi = { ...makeProperty(), load: async () => renamed }
    expect(await createLocalFacilitiesApi({ storage, today: () => TODAY, property: stubbed }).load()).toEqual(makeFacilitiesSeed(renamed, TODAY))
  })
})

describe('a failure is not cached', () => {
  it('retries after a temporary failure of the property data', async () => {
    const property = makeProperty()
    let calls = 0
    const flaky: PropertyApi = { ...property, load: () => (calls++ === 0 ? Promise.reject(new Error('property down')) : property.load()) }
    const api = createLocalFacilitiesApi({ storage: new MemoryStorage(), today: () => TODAY, property: flaky })
    await expect(api.load()).rejects.toThrow('property down')
    expect((await api.load()).bookings.length).toBeGreaterThan(0)
  })
})

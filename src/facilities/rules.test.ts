import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import th from '../i18n/th.json'
import {
  MAX_PEOPLE,
  bookingBadge,
  canCancel,
  canDecide,
  fits,
  freeAt,
  hourlyLoad,
  nextCode,
  parcelBadge,
  quotaUsed,
  validateBooking,
  validateNote,
  validateParcel,
  validateReason,
  weekStart,
} from './rules'
import type { Booking, BookingInput, BookingStatus, Facility, ParcelInput } from './types'

const TODAY = '2026-11-08' // a Sunday
const pool: Facility = { id: 'f-pool', key: 'pool', openHour: 6, closeHour: 22, capacity: 20, closed: false }
const meeting: Facility = { id: 'f-meet', key: 'meeting', openHour: 8, closeHour: 20, capacity: 10, closed: false }

const input = (over: Partial<BookingInput> = {}): BookingInput => ({ facilityId: pool.id, date: '2026-11-10', startHour: 9, endHour: 11, people: 2, ...over })
const booking = (over: Partial<Booking> = {}): Booking => ({
  id: 'b1',
  code: 'BK-0001',
  facilityId: pool.id,
  unitId: 'u1',
  unitCode: 'A-1204',
  leaseId: 'l1',
  tenantName: 'ผู้เช่า',
  tenantPhone: '0810000001',
  date: '2026-11-10',
  startHour: 9,
  endHour: 11,
  people: 2,
  status: 'pending',
  createdAt: TODAY,
  history: [{ status: 'pending', at: TODAY, note: '', byName: 'ผู้เช่า' }],
  ...over,
})

describe('validateBooking', () => {
  it('accepts a complete request', () => {
    expect(validateBooking(input(), pool, TODAY)).toEqual({})
  })

  it('needs a facility that exists', () => {
    expect(validateBooking(input(), undefined, TODAY).facilityId).toBe('facilities.errors.facility')
  })

  it.each([
    ['today', '2026-11-08', false],
    ['yesterday', '2026-11-07', false],
    ['tomorrow', '2026-11-09', true],
    ['14 days ahead', '2026-11-22', true],
    ['15 days ahead', '2026-11-23', false],
    ['not a real date', '2026-02-30', false],
    ['empty', '', false],
  ])('the date %s (%s): %s', (_n, date, ok) => {
    expect(validateBooking(input({ date }), pool, TODAY).date).toBe(ok ? undefined : 'facilities.errors.date')
  })

  it('counts the 14 days across a month and a year boundary', () => {
    expect(validateBooking(input({ date: '2027-01-05' }), pool, '2026-12-22')).toEqual({})
    expect(validateBooking(input({ date: '2027-01-06' }), pool, '2026-12-22').date).toBe('facilities.errors.date')
  })

  it.each([
    ['inside the opening hours', 6, 9, true],
    ['up to closing time', 19, 22, true],
    ['starts before opening', 5, 7, false],
    ['ends after closing', 21, 23, false],
    ['empty (start = end)', 9, 9, false],
    ['backwards', 11, 9, false],
    ['three hours', 9, 12, true],
    ['four hours', 9, 13, false],
    ['fractional start', 9.5, 11, false],
    ['not a number', Number.NaN, 11, false],
  ])('the time %s (%s–%s): %s', (_n, startHour, endHour, ok) => {
    expect(validateBooking(input({ startHour, endHour }), pool, TODAY).time).toBe(ok ? undefined : 'facilities.errors.time')
  })

  it('uses the opening hours of that facility', () => {
    expect(validateBooking(input({ facilityId: meeting.id, startHour: 7, endHour: 9 }), meeting, TODAY).time).toBe('facilities.errors.time')
    expect(validateBooking(input({ facilityId: meeting.id, startHour: 8, endHour: 10 }), meeting, TODAY)).toEqual({})
  })

  it.each([
    [0, false],
    [1, true],
    [MAX_PEOPLE, true],
    [MAX_PEOPLE + 1, false],
    [1.5, false],
    [Number.NaN, false],
  ])('%s people: %s', (people, ok) => {
    expect(validateBooking(input({ people }), pool, TODAY).people).toBe(ok ? undefined : 'facilities.errors.people')
  })
})

describe('capacity by the hour', () => {
  const list = [
    booking({ id: 'a', startHour: 11, endHour: 13, people: 5 }),
    booking({ id: 'b', startHour: 12, endHour: 14, people: 3, status: 'confirmed' }),
    booking({ id: 'c', startHour: 11, endHour: 13, people: 9, status: 'rejected' }),
    booking({ id: 'd', startHour: 11, endHour: 13, people: 9, status: 'cancelled' }),
    booking({ id: 'e', startHour: 11, endHour: 13, people: 9, facilityId: meeting.id }),
    booking({ id: 'f', startHour: 11, endHour: 13, people: 9, date: '2026-11-11' }),
  ]

  it('adds up the people of pending and confirmed bookings of that facility and day, hour by hour (the end hour is not used)', () => {
    const load = hourlyLoad(list, pool.id, '2026-11-10')
    expect([...load.entries()].sort((x, y) => x[0] - y[0])).toEqual([[11, 5], [12, 8], [13, 3]])
  })

  it('tells the free places of an hour, never below zero', () => {
    expect(freeAt(pool, list, '2026-11-10', 12)).toBe(12)
    expect(freeAt(pool, list, '2026-11-10', 10)).toBe(20)
    expect(freeAt(pool, [booking({ people: 5, startHour: 9, endHour: 10 }), ...Array.from({ length: 4 }, (_, i) => booking({ id: `x${i}`, people: 5, startHour: 9, endHour: 10 })), booking({ id: 'y', people: 5, startHour: 9, endHour: 10 })], '2026-11-10', 9)).toBe(0)
  })

  it('fits when the request just fills the hour, and not when it is one person over', () => {
    const full = [booking({ id: 'a', people: 5, startHour: 9, endHour: 10 }), booking({ id: 'b', people: 5, startHour: 9, endHour: 10 }), booking({ id: 'c', people: 5, startHour: 9, endHour: 10 })] // 15 of 20
    expect(fits(pool, full, input({ startHour: 9, endHour: 10, people: 5 }))).toBe(true) // 20 of 20
    expect(fits(pool, [...full, booking({ id: 'd', people: 1, startHour: 9, endHour: 10 })], input({ startHour: 9, endHour: 10, people: 5 }))).toBe(false) // 21
  })

  it('checks every hour of the request: one crowded hour is enough to refuse', () => {
    const crowded = [booking({ id: 'a', people: 5, startHour: 11, endHour: 12 }), booking({ id: 'b', people: 5, startHour: 11, endHour: 12 }), booking({ id: 'c', people: 5, startHour: 11, endHour: 12 }), booking({ id: 'd', people: 4, startHour: 11, endHour: 12 })] // hour 11: 19 of 20
    expect(fits(pool, crowded, input({ startHour: 9, endHour: 11, people: 5 }))).toBe(true) // hours 9 and 10 only
    expect(fits(pool, crowded, input({ startHour: 9, endHour: 12, people: 2 }))).toBe(false) // hour 11 would be 21
    expect(fits(pool, crowded, input({ startHour: 10, endHour: 13, people: 1 }))).toBe(true) // 20 of 20 at hour 11
  })

  it('ignores rejected and cancelled bookings', () => {
    const dead = [booking({ id: 'a', people: 5, status: 'rejected' }), booking({ id: 'b', people: 5, status: 'cancelled' })]
    expect(fits(pool, dead, input({ people: 5 }))).toBe(true)
  })
})

describe('weekStart and the weekly quota', () => {
  it.each([
    ['2026-11-09', '2026-11-09'], // Monday
    ['2026-11-15', '2026-11-09'], // Sunday
    ['2026-11-08', '2026-11-02'], // Sunday of the week before
    ['2026-12-31', '2026-12-28'], // across a month
    ['2027-01-01', '2026-12-28'], // across a year
    ['2028-02-29', '2028-02-28'], // leap day (a Tuesday)
  ])('the week of %s starts on %s', (date, monday) => {
    expect(weekStart(date)).toBe(monday)
  })

  it('counts the pending and confirmed bookings of one unit in the week of the date', () => {
    const list = [
      booking({ id: 'a', date: '2026-11-09' }),
      booking({ id: 'b', date: '2026-11-15', status: 'confirmed' }),
      booking({ id: 'c', date: '2026-11-16' }), // the next week
      booking({ id: 'd', date: '2026-11-10', status: 'rejected' }),
      booking({ id: 'e', date: '2026-11-10', status: 'cancelled' }),
      booking({ id: 'f', date: '2026-11-10', unitId: 'u2' }),
    ]
    expect(quotaUsed(list, 'u1', '2026-11-12')).toBe(2)
    expect(quotaUsed(list, 'u1', '2026-11-16')).toBe(1)
    expect(quotaUsed(list, 'u2', '2026-11-10')).toBe(1)
    expect(quotaUsed(list, 'u3', '2026-11-10')).toBe(0)
  })

  it('counts a week that crosses a month and a year as one', () => {
    const list = [booking({ id: 'a', date: '2026-12-29' }), booking({ id: 'b', date: '2027-01-03' })]
    expect(quotaUsed(list, 'u1', '2026-12-30')).toBe(2)
    expect(quotaUsed(list, 'u1', '2027-01-04')).toBe(0)
  })
})

describe('who may cancel and decide', () => {
  it.each([
    ['pending', '2026-11-09', true],
    ['confirmed', '2026-11-09', true],
    ['pending', '2026-11-08', false], // the day itself is too late
    ['confirmed', '2026-11-07', false],
    ['rejected', '2026-11-20', false],
    ['cancelled', '2026-11-20', false],
  ] as [BookingStatus, string, boolean][])('cancel a %s booking of %s: %s', (status, date, ok) => {
    expect(canCancel(booking({ status, date }), TODAY)).toBe(ok)
  })

  it.each([
    ['pending', '2026-11-08', true], // the day itself can still be decided
    ['pending', '2026-11-20', true],
    ['pending', '2026-11-07', false],
    ['confirmed', '2026-11-20', false],
    ['rejected', '2026-11-20', false],
    ['cancelled', '2026-11-20', false],
  ] as [BookingStatus, string, boolean][])('decide a %s booking of %s: %s', (status, date, ok) => {
    expect(canDecide(booking({ status, date }), TODAY)).toBe(ok)
  })
})

describe('reasons, notes and parcels', () => {
  it('needs a reason of 1–300 characters after trimming', () => {
    expect(validateReason('')).toBe('facilities.errors.reason')
    expect(validateReason('   ')).toBe('facilities.errors.reason')
    expect(validateReason('x')).toBeNull()
    expect(validateReason('x'.repeat(300))).toBeNull()
    expect(validateReason('x'.repeat(301))).toBe('facilities.errors.reason')
    expect(validateReason(`  ${'x'.repeat(300)}  `)).toBeNull()
  })

  it('accepts an empty note and 300 characters, refuses 301', () => {
    expect(validateNote('')).toBeNull()
    expect(validateNote('x'.repeat(300))).toBeNull()
    expect(validateNote('x'.repeat(301))).toBe('facilities.errors.note')
  })

  const parcel = (over: Partial<ParcelInput> = {}): ParcelInput => ({ unitId: 'u1', carrier: 'Kerry', trackingNo: '', location: 'frontDesk', ...over })

  it('accepts a complete parcel, with or without a tracking number', () => {
    expect(validateParcel(parcel())).toEqual({})
    expect(validateParcel(parcel({ trackingNo: 'TH123456789' }))).toEqual({})
  })

  it('needs a unit, a carrier of 1–40 characters, a tracking number of at most 40 and a valid place', () => {
    expect(validateParcel(parcel({ unitId: '' })).unitId).toBe('facilities.errors.unit')
    expect(validateParcel(parcel({ carrier: '' })).carrier).toBe('facilities.errors.carrier')
    expect(validateParcel(parcel({ carrier: '   ' })).carrier).toBe('facilities.errors.carrier')
    expect(validateParcel(parcel({ carrier: 'x'.repeat(40) }))).toEqual({})
    expect(validateParcel(parcel({ carrier: 'x'.repeat(41) })).carrier).toBe('facilities.errors.carrier')
    expect(validateParcel(parcel({ trackingNo: 'x'.repeat(40) }))).toEqual({})
    expect(validateParcel(parcel({ trackingNo: 'x'.repeat(41) })).trackingNo).toBe('facilities.errors.tracking')
    expect(validateParcel(parcel({ location: 'roof' as never })).location).toBe('facilities.errors.location')
  })
})

describe('nextCode', () => {
  it('starts at 0001 for each prefix', () => {
    expect(nextCode([], 'BK')).toBe('BK-0001')
    expect(nextCode([], 'PK')).toBe('PK-0001')
  })

  it('is one more than the highest number of that prefix, not the count', () => {
    expect(nextCode([{ code: 'BK-0009' }, { code: 'BK-0002' }], 'BK')).toBe('BK-0010')
  })

  it('skips codes of another shape or prefix, and grows past four digits', () => {
    expect(nextCode([{ code: 'PK-0500' }, { code: 'BK-abc' }, { code: 'BK-0003' }], 'BK')).toBe('BK-0004')
    expect(nextCode([{ code: 'PK-9999' }], 'PK')).toBe('PK-10000')
  })
})

describe('badges', () => {
  it('gives every status a style', () => {
    expect((['pending', 'confirmed', 'rejected', 'cancelled'] as BookingStatus[]).map(bookingBadge)).toEqual(['pending', 'settled', 'critical', 'inactive'])
    expect((['waiting', 'pickedUp'] as const).map(parcelBadge)).toEqual(['pending', 'settled'])
  })
})

describe('texts', () => {
  const lookup = (file: unknown, path: string) => path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], file)
  const keys = [
    ...['pool', 'fitness', 'meeting', 'bbq'].map((k) => `facilities.names.${k}`),
    ...['pending', 'confirmed', 'rejected', 'cancelled'].map((k) => `facilities.status.booking.${k}`),
    ...['waiting', 'pickedUp'].map((k) => `facilities.status.parcel.${k}`),
    ...['frontDesk', 'locker'].map((k) => `facilities.location.${k}`),
    ...['incomplete', 'facility', 'date', 'time', 'people', 'reason', 'note', 'unit', 'carrier', 'tracking', 'location', 'noCapacity', 'quotaExceeded', 'closed', 'noLease', 'storageFailed'].map((k) => `facilities.errors.${k}`),
  ]

  it.each(keys)('has a different Thai and English text for %s', (key) => {
    const [a, b] = [lookup(th, key), lookup(en, key)]
    expect(typeof a === 'string' && a.trim() !== '').toBe(true)
    expect(typeof b === 'string' && b.trim() !== '').toBe(true)
    expect(a).not.toBe(b)
  })

  it('uses the wording the requirement asks for', () => {
    expect(lookup(th, 'facilities.status.booking.pending')).toBe('รอยืนยันการจองส่วนกลาง')
  })
})

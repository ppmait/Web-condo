import { describe, expect, it } from 'vitest'
import { DEMO_TENANT_PHONE } from '../auth/demoAccounts'
import { addDays, isValidDate } from '../property/dates'
import { makeSeed as makePropertySeed } from '../property/seed'
import { isFacilitiesData } from './localFacilitiesApi'
import { WEEKLY_QUOTA, fits, hourlyLoad, isActive, quotaUsed } from './rules'
import { makeFacilitiesSeed } from './seed'
import type { Booking, BookingStatus } from './types'

describe.each(['2026-11-08', '2028-02-29', '2031-01-03'])('makeFacilitiesSeed for %s', (today) => {
  const property = makePropertySeed(today)
  const data = makeFacilitiesSeed(property, today)

  it('is trusted by the stored-data check', () => {
    expect(isFacilitiesData(JSON.parse(JSON.stringify(data)), property)).toBe(true)
  })

  it('has the four facilities, the barbecue area closed for renovation', () => {
    expect(data.facilities.map((f) => f.key)).toEqual(['pool', 'fitness', 'meeting', 'bbq'])
    expect(data.facilities.filter((f) => f.closed).map((f) => f.key)).toEqual(['bbq'])
    expect(data.facilities.find((f) => f.key === 'bbq')!.closedNote).toBeTruthy()
    expect(data.facilities.map((f) => [f.capacity, f.openHour, f.closeHour])).toEqual([[20, 6, 22], [15, 6, 22], [10, 8, 20], [12, 10, 21]])
  })

  it('has bookings of every status, unique ids and BK codes in order', () => {
    for (const s of ['pending', 'confirmed', 'rejected', 'cancelled'] as BookingStatus[]) expect(data.bookings.some((b) => b.status === s)).toBe(true)
    expect(new Set(data.bookings.map((b) => b.id)).size).toBe(data.bookings.length)
    expect(data.bookings.map((b) => b.code)).toEqual(data.bookings.map((_, i) => `BK-${String(i + 1).padStart(4, '0')}`))
  })

  it('gives the demo tenant at least three bookings of different statuses, one of them still cancellable', () => {
    const mine = data.bookings.filter((b) => b.tenantPhone === DEMO_TENANT_PHONE)
    expect(new Set(mine.map((b) => b.status)).size).toBeGreaterThanOrEqual(3)
    expect(mine.some((b) => (b.status === 'pending' || b.status === 'confirmed') && b.date > today)).toBe(true)
  })

  it('never breaks the rules it will enforce: capacity per hour and two bookings a week per unit', () => {
    const active = data.bookings.filter(isActive)
    for (const b of active) {
      const facility = data.facilities.find((f) => f.id === b.facilityId)!
      const others = active.filter((x) => x.id !== b.id)
      expect(fits(facility, others, b)).toBe(true)
      expect(quotaUsed(active, b.unitId, b.date)).toBeLessThanOrEqual(WEEKLY_QUOTA)
    }
    expect(hourlyLoad(active, data.facilities[0].id, today).size).toBeGreaterThanOrEqual(0)
  })

  it('has a history that follows the flow, ends in the current status and is never in the future', () => {
    const allowed: Record<BookingStatus, BookingStatus[]> = { pending: ['confirmed', 'rejected', 'cancelled'], confirmed: ['cancelled'], rejected: [], cancelled: [] }
    for (const b of data.bookings as Booking[]) {
      expect(b.history[0].status).toBe('pending')
      expect(b.history.at(-1)!.status).toBe(b.status)
      b.history.forEach((h, i) => {
        expect(isValidDate(h.at)).toBe(true)
        expect(h.at <= today).toBe(true)
        if (i > 0) {
          expect(h.at >= b.history[i - 1].at).toBe(true)
          expect(allowed[b.history[i - 1].status]).toContain(h.status)
        }
      })
      expect(b.createdAt).toBe(b.history[0].at)
      expect(b.date >= addDays(today, -20) && b.date <= addDays(today, 14)).toBe(true)
      if (b.status === 'rejected') expect(b.history.at(-1)!.note).toBeTruthy()
    }
  })

  it('has parcels: waiting and picked up, the demo unit with both, codes in order', () => {
    expect(data.parcels.some((p) => p.status === 'waiting')).toBe(true)
    expect(data.parcels.some((p) => p.status === 'pickedUp')).toBe(true)
    const mine = data.parcels.filter((p) => p.tenantPhone === DEMO_TENANT_PHONE)
    expect(mine.some((p) => p.status === 'waiting') && mine.some((p) => p.status === 'pickedUp')).toBe(true)
    expect(data.parcels.map((p) => p.code)).toEqual(data.parcels.map((_, i) => `PK-${String(i + 1).padStart(4, '0')}`))
    for (const p of data.parcels) {
      expect(p.history[0].status).toBe('waiting')
      expect(p.history.at(-1)!.status).toBe(p.status)
      expect(p.registeredAt).toBe(p.history[0].at)
      expect(p.history.every((h) => h.at <= today)).toBe(true)
    }
  })

  it('has notifications that match the data and go to the right recipients, with unread ones for each audience', () => {
    for (const n of data.notifications) {
      if (n.type === 'parcelArrived') {
        const p = data.parcels.find((x) => x.id === n.refId)!
        expect(n.recipient).toBe(p.tenantPhone)
      } else {
        const b = data.bookings.find((x) => x.id === n.refId)!
        expect(n.recipient).toBe(n.type === 'bookingDecided' ? b.tenantPhone : 'role:juristic')
      }
      expect(n.createdAt <= today).toBe(true)
    }
    expect(data.notifications.filter((n) => n.type === 'bookingCreated')).toHaveLength(data.bookings.length)
    expect(data.notifications.filter((n) => n.type === 'parcelArrived')).toHaveLength(data.parcels.length)
    expect(data.notifications.some((n) => !n.read && n.recipient === DEMO_TENANT_PHONE)).toBe(true)
    expect(data.notifications.some((n) => !n.read && n.recipient === 'role:juristic')).toBe(true)
  })
})

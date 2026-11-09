import { DEMO_TENANT_PHONE } from '../auth/demoAccounts'
import { addDays } from '../property/dates'
import type { Lease, PropertyData } from '../property/types'
import type { Booking, BookingStatus, Facility, FacilitiesData, FacilitiesNotification, FacilityKey, HistoryEntry, Parcel, ParcelLocation } from './types'

const JURISTIC_NAME = 'สมหญิง นิติบุคคล'

export const SAMPLE_FACILITIES: Facility[] = [
  { id: 'fac-pool', key: 'pool', openHour: 6, closeHour: 22, capacity: 20, closed: false },
  { id: 'fac-fitness', key: 'fitness', openHour: 6, closeHour: 22, capacity: 15, closed: false },
  { id: 'fac-meeting', key: 'meeting', openHour: 8, closeHour: 20, capacity: 10, closed: false },
  { id: 'fac-bbq', key: 'bbq', openHour: 10, closeHour: 21, capacity: 12, closed: true, closedNote: 'ปรับปรุงพื้นที่ปิ้งย่าง เปิดให้จองอีกครั้งเร็ว ๆ นี้' },
]

interface BookingSpec {
  facility: FacilityKey
  who: 'demo' | number
  /** days from today (negative: already past) */
  date: number
  start: number
  end: number
  people: number
  status: BookingStatus
  /** days before today that it was requested */
  createdAgo: number
  /** days before today that it was decided or cancelled */
  decidedAgo?: number
  note?: string
}

// ordered by the day they were requested, so the codes follow the order of the requests
const BOOKINGS: BookingSpec[] = [
  { facility: 'pool', who: 'demo', date: -5, start: 9, end: 11, people: 2, status: 'confirmed', createdAgo: 8, decidedAgo: 7 },
  { facility: 'meeting', who: 1, date: 3, start: 10, end: 11, people: 4, status: 'confirmed', createdAgo: 2, decidedAgo: 1 },
  { facility: 'fitness', who: 2, date: 2, start: 18, end: 20, people: 2, status: 'cancelled', createdAgo: 2, decidedAgo: 1 },
  { facility: 'fitness', who: 'demo', date: 2, start: 18, end: 19, people: 1, status: 'confirmed', createdAgo: 1, decidedAgo: 0 },
  { facility: 'pool', who: 'demo', date: 4, start: 17, end: 19, people: 3, status: 'rejected', createdAgo: 1, decidedAgo: 0, note: 'ช่วงเวลานั้นมีกิจกรรมของนิติบุคคล' },
  { facility: 'meeting', who: 'demo', date: 3, start: 10, end: 12, people: 4, status: 'pending', createdAgo: 0 },
  { facility: 'pool', who: 0, date: 2, start: 9, end: 12, people: 5, status: 'pending', createdAgo: 0 },
]

interface ParcelSpec {
  who: 'demo' | number
  carrier: string
  trackingNo?: string
  location: ParcelLocation
  registeredAgo: number
  /** days before today that it was picked up */
  pickedUpAgo?: number
}

const PARCELS: ParcelSpec[] = [
  { who: 1, carrier: 'Thailand Post', trackingNo: 'EP123456789TH', location: 'frontDesk', registeredAgo: 9, pickedUpAgo: 8 },
  { who: 'demo', carrier: 'Shopee Xpress', location: 'frontDesk', registeredAgo: 6, pickedUpAgo: 5 },
  { who: 0, carrier: 'J&T Express', trackingNo: 'JT7001234567', location: 'locker', registeredAgo: 2 },
  { who: 'demo', carrier: 'Kerry Express', trackingNo: 'KR1234567', location: 'frontDesk', registeredAgo: 1 },
  { who: 'demo', carrier: 'Flash Express', location: 'locker', registeredAgo: 0 },
]

/**
 * Sample data built from the property data: the four facilities (the barbecue area is closed for renovation), seven
 * bookings of every status that respect the capacity and the weekly quota, five parcels, and notifications that match
 * the history. Every date is relative to `today`.
 */
export function makeFacilitiesSeed(property: PropertyData, today: string): FacilitiesData {
  const units = new Set(property.units.map((u) => u.id))
  const active: Lease[] = property.leases.filter((l) => !l.cancelledAt && l.startDate <= today && today <= l.endDate && units.has(l.unitId))
  const demo = active.find((l) => l.tenantPhone === DEMO_TENANT_PHONE)
  const others = active.filter((l) => l !== demo)
  const leaseFor = (who: 'demo' | number): Lease | undefined => (who === 'demo' ? demo : others.length > 0 ? others[who % others.length] : demo)
  const d = (n: number) => addDays(today, n)

  const bookings: Booking[] = []
  const parcels: Parcel[] = []
  const notifications: FacilitiesNotification[] = []
  let noteSerial = 0
  const notify = (n: Omit<FacilitiesNotification, 'id'>) => notifications.push({ id: `fn-${++noteSerial}`, ...n })

  for (const spec of BOOKINGS) {
    const lease = leaseFor(spec.who)
    if (!lease) continue
    const unit = property.units.find((u) => u.id === lease.unitId)!
    const facility = SAMPLE_FACILITIES.find((f) => f.key === spec.facility)!
    const n = bookings.length + 1
    const history: HistoryEntry<BookingStatus>[] = [{ status: 'pending', at: d(-spec.createdAgo), note: '', byName: lease.tenantName }]
    if (spec.status === 'confirmed' || spec.status === 'rejected') history.push({ status: spec.status, at: d(-(spec.decidedAgo ?? 0)), note: spec.note ?? '', byName: JURISTIC_NAME })
    if (spec.status === 'cancelled') history.push({ status: 'cancelled', at: d(-(spec.decidedAgo ?? 0)), note: '', byName: lease.tenantName })
    const booking: Booking = {
      id: `bk-${n}`,
      code: `BK-${String(n).padStart(4, '0')}`,
      facilityId: facility.id,
      unitId: unit.id,
      unitCode: unit.code,
      leaseId: lease.id,
      tenantName: lease.tenantName,
      tenantPhone: lease.tenantPhone,
      date: d(spec.date),
      startHour: spec.start,
      endHour: spec.end,
      people: spec.people,
      status: spec.status,
      createdAt: d(-spec.createdAgo),
      history,
    }
    bookings.push(booking)
    // the office has seen the older requests; the ones made today are still new
    notify({ type: 'bookingCreated', refId: booking.id, recipient: 'role:juristic', createdAt: booking.createdAt, read: spec.createdAgo > 0 })
    if (spec.status === 'confirmed' || spec.status === 'rejected') {
      // the demo tenant has not yet read that a request was turned down
      notify({ type: 'bookingDecided', refId: booking.id, recipient: booking.tenantPhone, createdAt: history[1].at, read: !(spec.status === 'rejected' && spec.who === 'demo'), status: spec.status })
    }
    if (spec.status === 'cancelled') notify({ type: 'bookingCancelled', refId: booking.id, recipient: 'role:juristic', createdAt: history[1].at, read: true })
  }

  for (const spec of PARCELS) {
    const lease = leaseFor(spec.who)
    if (!lease) continue
    const unit = property.units.find((u) => u.id === lease.unitId)!
    const n = parcels.length + 1
    const history: HistoryEntry<'waiting' | 'pickedUp'>[] = [{ status: 'waiting', at: d(-spec.registeredAgo), note: '', byName: JURISTIC_NAME }]
    if (spec.pickedUpAgo !== undefined) history.push({ status: 'pickedUp', at: d(-spec.pickedUpAgo), note: 'รับโดยผู้เช่า', byName: JURISTIC_NAME })
    const parcel: Parcel = {
      id: `pk-${n}`,
      code: `PK-${String(n).padStart(4, '0')}`,
      unitId: unit.id,
      unitCode: unit.code,
      leaseId: lease.id,
      tenantName: lease.tenantName,
      tenantPhone: lease.tenantPhone,
      carrier: spec.carrier,
      ...(spec.trackingNo ? { trackingNo: spec.trackingNo } : {}),
      location: spec.location,
      status: spec.pickedUpAgo === undefined ? 'waiting' : 'pickedUp',
      registeredAt: d(-spec.registeredAgo),
      history,
    }
    parcels.push(parcel)
    notify({ type: 'parcelArrived', refId: parcel.id, recipient: parcel.tenantPhone, createdAt: parcel.registeredAt, read: parcel.status === 'pickedUp' })
  }

  return { version: 1, facilities: SAMPLE_FACILITIES.map((f) => ({ ...f })), bookings, parcels, notifications }
}

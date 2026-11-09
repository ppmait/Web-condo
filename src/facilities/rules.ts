import { addDays, daysBetween, isValidDate } from '../property/dates'
import type { Booking, BookingInput, BookingStatus, Facility, ParcelInput, ParcelStatus } from './types'

/** field name → i18n key of the error; `{}` means valid */
export type FieldErrors = Record<string, string>

export const MAX_PEOPLE = 5
export const MAX_HOURS = 3
export const MAX_AHEAD_DAYS = 14
export const WEEKLY_QUOTA = 2
export const REASON_MAX = 300
export const NOTE_MAX = 300
export const CARRIER_MAX = 40
export const TRACKING_MAX = 40

const isWhole = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n)

/** Pending and confirmed bookings are the ones that hold places and count against the quota. */
export const isActive = (booking: Booking): boolean => booking.status === 'pending' || booking.status === 'confirmed'

/** A booking is made from tomorrow up to 14 days ahead, for 1–3 whole hours inside the opening hours, for 1–5 people. */
export function validateBooking(input: BookingInput, facility: Facility | undefined, today: string): FieldErrors {
  const errors: FieldErrors = {}
  if (!facility) {
    errors.facilityId = 'facilities.errors.facility'
  }
  const ahead = typeof input.date === 'string' && isValidDate(input.date) ? daysBetween(today, input.date) : NaN
  if (!(ahead >= 1 && ahead <= MAX_AHEAD_DAYS)) errors.date = 'facilities.errors.date'
  if (facility) {
    const { startHour: s, endHour: e } = input
    const ok = isWhole(s) && isWhole(e) && s >= facility.openHour && e <= facility.closeHour && e > s && e - s <= MAX_HOURS
    if (!ok) errors.time = 'facilities.errors.time'
  }
  if (!isWhole(input.people) || input.people < 1 || input.people > MAX_PEOPLE) errors.people = 'facilities.errors.people'
  return errors
}

/** The people holding places in each hour of one facility on one day (the end hour of a booking is not used). */
export function hourlyLoad(bookings: Booking[], facilityId: string, date: string): Map<number, number> {
  const load = new Map<number, number>()
  for (const b of bookings) {
    if (!isActive(b) || b.facilityId !== facilityId || b.date !== date) continue
    for (let h = b.startHour; h < b.endHour; h++) load.set(h, (load.get(h) ?? 0) + b.people)
  }
  return load
}

/** Places still free in one hour; never below zero. */
export const freeAt = (facility: Facility, bookings: Booking[], date: string, hour: number): number =>
  Math.max(0, facility.capacity - (hourlyLoad(bookings, facility.id, date).get(hour) ?? 0))

/** True when every hour of the request still has room for its people. */
export function fits(facility: Facility, bookings: Booking[], input: BookingInput): boolean {
  const load = hourlyLoad(bookings, facility.id, input.date)
  for (let h = input.startHour; h < input.endHour; h++) {
    if ((load.get(h) ?? 0) + input.people > facility.capacity) return false
  }
  return true
}

/** The Monday of the week (Monday–Sunday) a date falls in. */
export function weekStart(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay() // 0 = Sunday
  return addDays(date, -((day + 6) % 7))
}

/** How many bookings of the unit already hold the week of `date`. */
export function quotaUsed(bookings: Booking[], unitId: string, date: string): number {
  const week = weekStart(date)
  return bookings.filter((b) => isActive(b) && b.unitId === unitId && weekStart(b.date) === week).length
}

/** The owner may cancel a pending or confirmed booking up to the day before it. */
export const canCancel = (booking: Booking, today: string): boolean => isActive(booking) && booking.date > today

/** The juristic office decides a pending booking until the day of use has passed. */
export const canDecide = (booking: Booking, today: string): boolean => booking.status === 'pending' && booking.date >= today

/** Returns the i18n key of the problem, or null when the reason is fine. */
export function validateReason(text: string): string | null {
  const reason = text.trim()
  return reason === '' || reason.length > REASON_MAX ? 'facilities.errors.reason' : null
}

/** Returns the i18n key of the problem, or null when the note is fine (it may be empty). */
export const validateNote = (note: string): string | null => (note.trim().length > NOTE_MAX ? 'facilities.errors.note' : null)

export function validateParcel(input: ParcelInput): FieldErrors {
  const errors: FieldErrors = {}
  if (!input.unitId) errors.unitId = 'facilities.errors.unit'
  const carrier = input.carrier.trim()
  if (carrier === '' || carrier.length > CARRIER_MAX) errors.carrier = 'facilities.errors.carrier'
  if (input.trackingNo.trim().length > TRACKING_MAX) errors.trackingNo = 'facilities.errors.tracking'
  if (input.location !== 'frontDesk' && input.location !== 'locker') errors.location = 'facilities.errors.location'
  return errors
}

/** BK-0001 / PK-0001 … one more than the highest number of that prefix; other codes are ignored. */
export function nextCode(items: { code: string }[], prefix: 'BK' | 'PK'): string {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`)
  let highest = 0
  for (const item of items) {
    const match = pattern.exec(item.code)
    if (match) highest = Math.max(highest, Number(match[1]))
  }
  return `${prefix}-${String(highest + 1).padStart(4, '0')}`
}

export type BadgeStyle = 'pending' | 'settled' | 'critical' | 'inactive'

const BOOKING_BADGES: Record<BookingStatus, BadgeStyle> = { pending: 'pending', confirmed: 'settled', rejected: 'critical', cancelled: 'inactive' }
const PARCEL_BADGES: Record<ParcelStatus, BadgeStyle> = { waiting: 'pending', pickedUp: 'settled' }

export const bookingBadge = (status: BookingStatus): BadgeStyle => BOOKING_BADGES[status]
export const parcelBadge = (status: ParcelStatus): BadgeStyle => PARCEL_BADGES[status]

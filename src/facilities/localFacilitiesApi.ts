import { isValidDate, todayISO } from '../property/dates'
import { localPropertyApi } from '../property/localPropertyApi'
import type { Lease, PropertyApi, PropertyData } from '../property/types'
import {
  CARRIER_MAX,
  MAX_HOURS,
  MAX_PEOPLE,
  TRACKING_MAX,
  WEEKLY_QUOTA,
  canCancel,
  canDecide,
  fits,
  isActive,
  nextCode,
  quotaUsed,
  validateBooking,
  validateNote,
  validateParcel,
  validateReason,
  type FieldErrors,
} from './rules'
import { makeFacilitiesSeed } from './seed'
import {
  FacilitiesError,
  type Booking,
  type BookingStatus,
  type FacilitiesApi,
  type FacilitiesData,
  type FacilitiesNotification,
  type Facility,
  type FacilityKey,
  type HistoryEntry,
  type NotificationType,
  type Parcel,
  type ParcelStatus,
  type Recipient,
} from './types'

export const FACILITIES_KEY = 'condo:facilities'

interface Options {
  /** Defaults to the browser localStorage. `null` keeps everything in memory. */
  storage?: Storage | null
  today?: () => string
  /** the property data the bookings and parcels refer to (units, leases) */
  property?: PropertyApi
}

const FACILITY_KEYS: FacilityKey[] = ['pool', 'fitness', 'meeting', 'bbq']
const BOOKING_STATUSES: BookingStatus[] = ['pending', 'confirmed', 'rejected', 'cancelled']
const PARCEL_STATUSES: ParcelStatus[] = ['waiting', 'pickedUp']
const NOTIFICATION_TYPES: NotificationType[] = ['bookingCreated', 'bookingDecided', 'bookingCancelled', 'parcelArrived']

/** who may follow whom in a history */
const BOOKING_FLOW: Record<BookingStatus, BookingStatus[]> = { pending: ['confirmed', 'rejected', 'cancelled'], confirmed: ['cancelled'], rejected: [], cancelled: [] }
const PARCEL_FLOW: Record<ParcelStatus, ParcelStatus[]> = { waiting: ['pickedUp'], pickedUp: [] }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isString = (v: unknown): v is string => typeof v === 'string'
const isWhole = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const isDate = (v: unknown): v is string => isString(v) && isValidDate(v)

function isFacility(v: unknown): v is Facility {
  return (
    isRecord(v) &&
    isString(v.id) &&
    FACILITY_KEYS.includes(v.key as FacilityKey) &&
    isWhole(v.openHour) &&
    isWhole(v.closeHour) &&
    v.openHour >= 0 &&
    v.openHour < v.closeHour &&
    v.closeHour <= 24 &&
    isWhole(v.capacity) &&
    v.capacity > 0 &&
    typeof v.closed === 'boolean' &&
    (v.closedNote === undefined || isString(v.closedNote))
  )
}

function isHistory<S extends string>(v: unknown, statuses: S[]): v is HistoryEntry<S>[] {
  return Array.isArray(v) && v.length > 0 && v.every((h) => isRecord(h) && statuses.includes(h.status as S) && isDate(h.at) && isString(h.note) && isString(h.byName))
}

function historyFollows<S extends string>(history: HistoryEntry<S>[], flow: Record<S, S[]>, first: S, last: S): boolean {
  if (history[0].status !== first || history.at(-1)?.status !== last) return false
  for (let i = 1; i < history.length; i++) {
    if (!flow[history[i - 1].status].includes(history[i].status) || history[i].at < history[i - 1].at) return false
  }
  return true
}

function isBooking(v: unknown): v is Booking {
  return (
    isRecord(v) &&
    isString(v.id) &&
    isString(v.code) &&
    /^BK-\d+$/.test(v.code) &&
    isString(v.facilityId) &&
    isString(v.unitId) &&
    isString(v.unitCode) &&
    isString(v.leaseId) &&
    isString(v.tenantName) &&
    isString(v.tenantPhone) &&
    isDate(v.date) &&
    isWhole(v.startHour) &&
    isWhole(v.endHour) &&
    isWhole(v.people) &&
    v.people >= 1 &&
    v.people <= MAX_PEOPLE &&
    BOOKING_STATUSES.includes(v.status as BookingStatus) &&
    isDate(v.createdAt) &&
    isHistory(v.history, BOOKING_STATUSES)
  )
}

function isParcel(v: unknown): v is Parcel {
  return (
    isRecord(v) &&
    isString(v.id) &&
    isString(v.code) &&
    /^PK-\d+$/.test(v.code) &&
    isString(v.unitId) &&
    isString(v.unitCode) &&
    isString(v.leaseId) &&
    isString(v.tenantName) &&
    isString(v.tenantPhone) &&
    isString(v.carrier) &&
    v.carrier.trim() !== '' &&
    v.carrier.length <= CARRIER_MAX &&
    (v.trackingNo === undefined || (isString(v.trackingNo) && v.trackingNo.length <= TRACKING_MAX)) &&
    (v.location === 'frontDesk' || v.location === 'locker') &&
    PARCEL_STATUSES.includes(v.status as ParcelStatus) &&
    isDate(v.registeredAt) &&
    isHistory(v.history, PARCEL_STATUSES)
  )
}

function isNotification(v: unknown): v is FacilitiesNotification {
  return (
    isRecord(v) &&
    isString(v.id) &&
    NOTIFICATION_TYPES.includes(v.type as NotificationType) &&
    isString(v.refId) &&
    isString(v.recipient) &&
    isDate(v.createdAt) &&
    typeof v.read === 'boolean' &&
    (v.status === undefined || BOOKING_STATUSES.includes(v.status as BookingStatus))
  )
}

/**
 * Stored data is trusted only if it has the right shape and agrees with itself (histories, capacity, quota). It is
 * also replaced when it belongs to another property (none of the units it refers to exist). Partly dangling
 * references are kept: an ordinary edit (a lease moved, a unit deleted) must never wipe bookings and parcels, which
 * carry their own snapshot.
 */
export function isFacilitiesData(v: unknown, property: PropertyData): v is FacilitiesData {
  if (!isRecord(v) || v.version !== 1) return false
  const { facilities, bookings, parcels, notifications } = v
  if (!Array.isArray(facilities) || !Array.isArray(bookings) || !Array.isArray(parcels) || !Array.isArray(notifications)) return false
  if (!facilities.every(isFacility) || !bookings.every(isBooking) || !parcels.every(isParcel) || !notifications.every(isNotification)) return false
  const facs = facilities as Facility[]
  const books = bookings as Booking[]
  const pars = parcels as Parcel[]
  const notes = notifications as FacilitiesNotification[]

  const ids = [...facs, ...books, ...pars, ...notes].map((x) => x.id)
  if (new Set(ids).size !== ids.length) return false
  if (new Set(books.map((b) => b.code)).size !== books.length || new Set(pars.map((p) => p.code)).size !== pars.length) return false

  for (const b of books) {
    const facility = facs.find((f) => f.id === b.facilityId)
    if (!facility) return false
    const hours = b.endHour - b.startHour
    if (b.startHour < facility.openHour || b.endHour > facility.closeHour || hours < 1 || hours > MAX_HOURS) return false
    if (!historyFollows(b.history, BOOKING_FLOW, 'pending', b.status)) return false
  }
  for (const p of pars) if (!historyFollows(p.history, PARCEL_FLOW, 'waiting', p.status)) return false

  // what the rules promise: no hour above its capacity, no unit above its weekly quota
  const holding = books.filter(isActive)
  for (const b of holding) {
    const facility = facs.find((f) => f.id === b.facilityId)!
    if (!fits(facility, holding.filter((x) => x.id !== b.id), b)) return false
    if (quotaUsed(holding, b.unitId, b.date) > WEEKLY_QUOTA) return false
  }

  const bookingIds = new Set(books.map((b) => b.id))
  const parcelIds = new Set(pars.map((p) => p.id))
  if (!notes.every((n) => (n.type === 'parcelArrived' ? parcelIds.has(n.refId) : bookingIds.has(n.refId)))) return false

  const units = new Set(property.units.map((u) => u.id))
  const referenced = [...books.map((b) => b.unitId), ...pars.map((p) => p.unitId)]
  return !(referenced.length > 0 && !referenced.some((id) => units.has(id)))
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

function invalid(errors: FieldErrors): never {
  throw new FacilitiesError('invalid_input', errors)
}

/** The day to write on a new history entry: today, but never earlier than the entry before it (a clock may move back). */
const stamp = (history: { at: string }[], day: string): string => {
  const last = history.at(-1)?.at ?? day
  return last > day ? last : day
}

/** The lease in force today: not cancelled, started, not ended; the one that started last when there are several. */
function activeLease(property: PropertyData, day: string, match: (l: Lease) => boolean): Lease | undefined {
  return property.leases
    .filter((l) => match(l) && !l.cancelledAt && l.startDate <= day && day <= l.endDate)
    .reduce<Lease | undefined>((latest, l) => (!latest || l.startDate > latest.startDate ? l : latest), undefined)
}

export function createLocalFacilitiesApi(opts: Options = {}): FacilitiesApi {
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage
  const today = opts.today ?? todayISO
  const property = opts.property ?? localPropertyApi

  // Storage is the source of truth and is re-read on every call, because another browser tab may have changed it.
  // Memory is only a fallback for when storage cannot be read (or, for notices only, written).
  let memory: FacilitiesData | null = null
  let persistFailed = false

  const read = (): { readable: boolean; text: string | null } => {
    if (!storage) return { readable: false, text: null }
    try {
      return { readable: true, text: storage.getItem(FACILITIES_KEY) }
    } catch {
      return { readable: false, text: null }
    }
  }
  /** Keeps working in memory when storage cannot be written. Only for reading notices (low stakes). */
  const persist = (data: FacilitiesData) => {
    memory = data
    try {
      storage?.setItem(FACILITIES_KEY, JSON.stringify(data))
      persistFailed = false
    } catch {
      persistFailed = true
    }
  }
  /**
   * Writes for real or not at all: false when the storage refuses (e.g. it is full). Memory only changes on success.
   * Used for everything a person must be able to rely on. With no storage object at all there is nothing to refuse:
   * memory is all there is.
   */
  const persistStrict = (data: FacilitiesData): boolean => {
    try {
      storage?.setItem(FACILITIES_KEY, JSON.stringify(data))
    } catch {
      return false
    }
    memory = data
    persistFailed = false
    return true
  }
  const seed = (prop: PropertyData): FacilitiesData => {
    const seeded = makeFacilitiesSeed(prop, today()) // may throw: nothing is cached, the next call simply tries again
    persist(seeded)
    return seeded
  }

  /** The freshest data. Call it synchronously right before changing anything, after the property data was loaded. */
  const fresh = (prop: PropertyData): FacilitiesData => {
    const { readable, text } = read()
    if (readable) {
      // storage is the truth whenever it holds valid data, even if this tab once failed to save: another tab may have
      // written since, and a stale copy in memory must never hide or overwrite that
      try {
        const parsed: unknown = JSON.parse(text ?? 'null')
        if (isFacilitiesData(parsed, prop)) {
          memory = parsed
          return parsed
        }
      } catch {
        // not JSON: untrusted
      }
      // nothing valid in storage: keep working from memory only if this tab could not save (the storage never got it)
      if (persistFailed && memory && isFacilitiesData(memory, prop)) return memory
      return seed(prop)
    }
    return memory && isFacilitiesData(memory, prop) ? memory : seed(prop)
  }

  const findBooking = (data: FacilitiesData, id: string): Booking => {
    const booking = data.bookings.find((b) => b.id === id)
    if (!booking) throw new FacilitiesError('not_found')
    return booking
  }

  const notify = (data: FacilitiesData, type: NotificationType, refId: string, recipient: Recipient, status?: BookingStatus) =>
    data.notifications.push({ id: newId(), type, refId, recipient, createdAt: today(), read: false, ...(status ? { status } : {}) })

  /** Every write a person relies on works on a copy and either lands in storage or changes nothing. */
  const commit = <T>(data: FacilitiesData, result: T): T => {
    if (!persistStrict(data)) throw new FacilitiesError('storage_failed')
    return clone(result)
  }

  return {
    async load() {
      return clone(fresh(await property.load()))
    },

    async createBooking(input) {
      const prop = await property.load()
      const data = clone(fresh(prop))
      const day = today()
      const facility = data.facilities.find((f) => f.id === input.facilityId)
      const errors = validateBooking(input, facility, day)
      if (Object.keys(errors).length > 0 || !facility) invalid(errors)
      const phone = input.tenantPhone.trim()
      const lease = activeLease(prop, day, (l) => l.tenantPhone === phone)
      const unit = lease && prop.units.find((u) => u.id === lease.unitId)
      if (!lease || !unit) throw new FacilitiesError('no_lease')
      if (facility.closed) throw new FacilitiesError('closed')
      if (quotaUsed(data.bookings, unit.id, input.date) >= WEEKLY_QUOTA) throw new FacilitiesError('quota_exceeded')
      if (!fits(facility, data.bookings, input)) throw new FacilitiesError('no_capacity')

      const booking: Booking = {
        id: newId(),
        code: nextCode(data.bookings, 'BK'),
        facilityId: facility.id,
        unitId: unit.id,
        unitCode: unit.code,
        leaseId: lease.id,
        tenantName: lease.tenantName,
        tenantPhone: lease.tenantPhone,
        date: input.date,
        startHour: input.startHour,
        endHour: input.endHour,
        people: input.people,
        status: 'pending',
        createdAt: day,
        history: [{ status: 'pending', at: day, note: '', byName: input.tenantName.trim() || lease.tenantName }],
      }
      data.bookings.push(booking)
      notify(data, 'bookingCreated', booking.id, 'role:juristic')
      return commit(data, booking)
    },

    async cancelBooking(bookingId, actorPhone) {
      const prop = await property.load()
      const data = clone(fresh(prop))
      const booking = findBooking(data, bookingId)
      if (booking.tenantPhone !== actorPhone.trim()) throw new FacilitiesError('not_owner')
      if (!canCancel(booking, today())) throw new FacilitiesError('invalid_transition')
      booking.status = 'cancelled'
      booking.history.push({ status: 'cancelled', at: stamp(booking.history, today()), note: '', byName: booking.tenantName })
      notify(data, 'bookingCancelled', booking.id, 'role:juristic')
      return commit(data, booking)
    },

    async decideBooking(bookingId, decision, reason, actorName) {
      const prop = await property.load()
      const data = clone(fresh(prop))
      const problem = decision === 'rejected' ? validateReason(reason) : validateNote(reason)
      if (problem) invalid({ reason: problem })
      const booking = findBooking(data, bookingId)
      if (!canDecide(booking, today())) throw new FacilitiesError('invalid_transition')
      booking.status = decision
      booking.history.push({ status: decision, at: stamp(booking.history, today()), note: reason.trim(), byName: actorName })
      notify(data, 'bookingDecided', booking.id, booking.tenantPhone, decision)
      return commit(data, booking)
    },

    async setFacilityClosed(facilityId, closed, note) {
      const prop = await property.load()
      const data = clone(fresh(prop))
      const problem = validateNote(note)
      if (problem) invalid({ note: problem })
      const facility = data.facilities.find((f) => f.id === facilityId)
      if (!facility) throw new FacilitiesError('not_found')
      facility.closed = closed
      if (closed && note.trim() !== '') facility.closedNote = note.trim()
      else delete facility.closedNote
      return commit(data, facility)
    },

    async registerParcel(input, actorName) {
      const prop = await property.load()
      const data = clone(fresh(prop))
      const errors = validateParcel(input)
      if (Object.keys(errors).length > 0) invalid(errors)
      const unit = prop.units.find((u) => u.id === input.unitId)
      if (!unit) throw new FacilitiesError('not_found')
      const lease = activeLease(prop, today(), (l) => l.unitId === unit.id)
      if (!lease) throw new FacilitiesError('no_lease')
      const tracking = input.trackingNo.trim()
      const parcel: Parcel = {
        id: newId(),
        code: nextCode(data.parcels, 'PK'),
        unitId: unit.id,
        unitCode: unit.code,
        leaseId: lease.id,
        tenantName: lease.tenantName,
        tenantPhone: lease.tenantPhone,
        carrier: input.carrier.trim(),
        ...(tracking ? { trackingNo: tracking } : {}),
        location: input.location,
        status: 'waiting',
        registeredAt: today(),
        history: [{ status: 'waiting', at: today(), note: '', byName: actorName }],
      }
      data.parcels.push(parcel)
      notify(data, 'parcelArrived', parcel.id, parcel.tenantPhone)
      return commit(data, parcel)
    },

    async markPickedUp(parcelId, note, actorName) {
      const prop = await property.load()
      const data = clone(fresh(prop))
      const problem = validateNote(note)
      if (problem) invalid({ note: problem })
      const parcel = data.parcels.find((p) => p.id === parcelId)
      if (!parcel) throw new FacilitiesError('not_found')
      if (parcel.status !== 'waiting') throw new FacilitiesError('invalid_transition')
      parcel.status = 'pickedUp'
      parcel.history.push({ status: 'pickedUp', at: stamp(parcel.history, today()), note: note.trim(), byName: actorName })
      return commit(data, parcel)
    },

    async markRead(notificationId) {
      const prop = await property.load()
      const data = fresh(prop)
      const n = data.notifications.find((x) => x.id === notificationId)
      if (!n || n.read) return
      n.read = true
      persist(data)
    },

    async markAllRead(recipient) {
      const prop = await property.load()
      const data = fresh(prop)
      let changed = false
      for (const n of data.notifications) {
        if (n.recipient === recipient && !n.read) {
          n.read = true
          changed = true
        }
      }
      if (changed) persist(data)
    },
  }
}

export const localFacilitiesApi = createLocalFacilitiesApi()

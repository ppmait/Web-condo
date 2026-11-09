export type FacilityKey = 'pool' | 'fitness' | 'meeting' | 'bbq'

export interface Facility {
  id: string
  key: FacilityKey
  /** opens at the start of this hour (0–23) */
  openHour: number
  /** closes at the start of this hour; the last bookable hour is closeHour − 1 */
  closeHour: number
  /** people per hour */
  capacity: number
  closed: boolean
  closedNote?: string
}

export type BookingStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled'
export type ParcelStatus = 'waiting' | 'pickedUp'
export type ParcelLocation = 'frontDesk' | 'locker'

export interface HistoryEntry<S> {
  status: S
  /** YYYY-MM-DD */
  at: string
  note: string
  byName: string
}

export interface Booking {
  id: string
  /** BK-0001 … */
  code: string
  facilityId: string
  /** snapshots of the unit and the tenant when the booking was made */
  unitId: string
  unitCode: string
  leaseId: string
  tenantName: string
  tenantPhone: string
  /** the day of use, YYYY-MM-DD */
  date: string
  startHour: number
  /** exclusive */
  endHour: number
  people: number
  status: BookingStatus
  createdAt: string
  /** history[0] is always the request (`pending`) */
  history: HistoryEntry<BookingStatus>[]
}

export interface BookingInput {
  facilityId: string
  date: string
  startHour: number
  endHour: number
  people: number
}

/** What the api needs to book: the form plus who is asking. */
export type CreateBookingInput = BookingInput & { tenantPhone: string; tenantName: string }

export interface Parcel {
  id: string
  /** PK-0001 … */
  code: string
  unitId: string
  unitCode: string
  leaseId: string
  /** the tenant of the active lease when it was registered */
  tenantName: string
  tenantPhone: string
  carrier: string
  trackingNo?: string
  location: ParcelLocation
  status: ParcelStatus
  registeredAt: string
  /** history[0] is always the registration (`waiting`) */
  history: HistoryEntry<ParcelStatus>[]
}

export interface ParcelInput {
  unitId: string
  carrier: string
  trackingNo: string
  location: ParcelLocation
}

export type NotificationType = 'bookingCreated' | 'bookingDecided' | 'bookingCancelled' | 'parcelArrived'

/** A phone number, or `role:juristic` for the juristic office. */
export type Recipient = string

export interface FacilitiesNotification {
  id: string
  type: NotificationType
  /** the booking id, or the parcel id for parcelArrived */
  refId: string
  recipient: Recipient
  /** YYYY-MM-DD */
  createdAt: string
  read: boolean
  /** for bookingDecided: confirmed or rejected */
  status?: BookingStatus
}

export interface FacilitiesData {
  version: 1
  facilities: Facility[]
  bookings: Booking[]
  parcels: Parcel[]
  notifications: FacilitiesNotification[]
}

export type FacilitiesErrorCode =
  | 'invalid_input'
  | 'not_found'
  | 'invalid_transition'
  | 'no_lease'
  | 'no_capacity'
  | 'quota_exceeded'
  | 'closed'
  | 'not_owner'
  | 'storage_failed'

export class FacilitiesError extends Error {
  readonly code: FacilitiesErrorCode
  /** field name → i18n key; only set for `invalid_input` */
  readonly fieldErrors?: Record<string, string>

  constructor(code: FacilitiesErrorCode, fieldErrors?: Record<string, string>) {
    super(code)
    this.name = 'FacilitiesError'
    this.code = code
    this.fieldErrors = fieldErrors
  }
}

/** Boundary to the (future) backend. The mock lives in localFacilitiesApi.ts. */
export interface FacilitiesApi {
  load(): Promise<FacilitiesData>
  createBooking(input: CreateBookingInput): Promise<Booking>
  cancelBooking(bookingId: string, actorPhone: string): Promise<Booking>
  decideBooking(bookingId: string, decision: 'confirmed' | 'rejected', reason: string, actorName: string): Promise<Booking>
  setFacilityClosed(facilityId: string, closed: boolean, note: string): Promise<Facility>
  registerParcel(input: ParcelInput, actorName: string): Promise<Parcel>
  markPickedUp(parcelId: string, note: string, actorName: string): Promise<Parcel>
  markRead(notificationId: string): Promise<void>
  markAllRead(recipient: Recipient): Promise<void>
}

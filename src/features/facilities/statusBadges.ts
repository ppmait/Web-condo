import type { Status } from '../../components/StatusBadge'
import { bookingBadge, parcelBadge } from '../../facilities/rules'
import type { BookingStatus, ParcelStatus } from '../../facilities/types'

/** The badge style of a booking status. Its text is `facilities.status.booking.<status>`. */
export const bookingStatusBadge = (status: BookingStatus): Status => bookingBadge(status)

/** The badge style of a parcel status. Its text is `facilities.status.parcel.<status>`. */
export const parcelStatusBadge = (status: ParcelStatus): Status => parcelBadge(status)

import { describe, expect, it } from 'vitest'
import en from '../../i18n/en.json'
import th from '../../i18n/th.json'
import type { BookingStatus, ParcelStatus } from '../../facilities/types'
import { bookingStatusBadge, parcelStatusBadge } from './statusBadges'

const BOOKINGS: BookingStatus[] = ['pending', 'confirmed', 'rejected', 'cancelled']
const PARCELS: ParcelStatus[] = ['waiting', 'pickedUp']
type Texts = { facilities: { status: { booking: Record<string, string>; parcel: Record<string, string> } } }

describe('status badges', () => {
  it('gives every status a style', () => {
    expect(BOOKINGS.map(bookingStatusBadge)).toEqual(['pending', 'settled', 'critical', 'inactive'])
    expect(PARCELS.map(parcelStatusBadge)).toEqual(['pending', 'settled'])
  })

  it.each([...BOOKINGS.map((s) => ['booking', s] as const), ...PARCELS.map((s) => ['parcel', s] as const)])('has a Thai and an English text for the %s status %s (never colour alone)', (kind, status) => {
    const [a, b] = [th, en].map((file) => (file as Texts).facilities.status[kind][status])
    expect(a?.trim()).toBeTruthy()
    expect(b?.trim()).toBeTruthy()
    expect(a).not.toBe(b)
  })
})

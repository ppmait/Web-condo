import { act, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEMO_TENANT_PHONE } from '../auth/demoAccounts'
import { addDays } from '../property/dates'
import { TEST_TODAY } from '../test/renderProperty'
import { makeTestFacilities } from '../test/testFacilities'
import { FacilitiesProvider } from './FacilitiesProvider'
import { FACILITIES_KEY } from './localFacilitiesApi'
import { FacilitiesError, type CreateBookingInput, type FacilitiesApi, type FacilitiesData } from './types'
import { useFacilities } from './useFacilities'

const holder: { value?: ReturnType<typeof useFacilities> } = {}
const facilities = () => holder.value as ReturnType<typeof useFacilities>

function Probe() {
  const current = useFacilities()
  useEffect(() => {
    holder.value = current
  })
  return (
    <div>
      <span data-testid="status">{current.status}</span>
      <span data-testid="bookings">{current.data.bookings.length}</span>
      <span data-testid="today">{current.today}</span>
    </div>
  )
}

const mount = (api: FacilitiesApi, today: () => string = () => TEST_TODAY) =>
  render(
    <FacilitiesProvider api={api} today={today}>
      <Probe />
    </FacilitiesProvider>,
  )

/** The status text shows first; the hook value is copied in an effect, so wait for that copy too. */
async function ready() {
  await screen.findByText('ready')
  await vi.waitFor(() => expect(holder.value?.status).toBe('ready'))
}

const booking = (facilityId: string, over: Partial<CreateBookingInput> = {}): CreateBookingInput => ({
  facilityId,
  date: addDays(TEST_TODAY, 12), // a different week from the sample bookings, so the weekly quota is not used up
  startHour: 14,
  endHour: 15,
  people: 2,
  tenantPhone: DEMO_TENANT_PHONE,
  tenantName: 'สมชาย ผู้เช่า',
  ...over,
})

afterEach(() => vi.restoreAllMocks())

describe('FacilitiesProvider', () => {
  it('starts loading, then is ready with the data and today', async () => {
    const { facilities: api } = makeTestFacilities()
    const expected = await api.load()
    mount(api)
    expect(screen.getByTestId('status')).toHaveTextContent('loading')
    await ready()
    expect(screen.getByTestId('bookings')).toHaveTextContent(String(expected.bookings.length))
    expect(screen.getByTestId('today')).toHaveTextContent(TEST_TODAY)
  })

  it('reloads after a change, so every screen sees it', async () => {
    mount(makeTestFacilities().facilities)
    await ready()
    const before = facilities().data.bookings.length
    const meeting = facilities().data.facilities.find((f) => f.key === 'meeting')!
    await act(async () => {
      await facilities().createBooking(booking(meeting.id))
    })
    expect(facilities().data.bookings.length).toBe(before + 1)
  })

  it('throws the FacilitiesError on to the caller and leaves the data unchanged', async () => {
    mount(makeTestFacilities().facilities)
    await ready()
    const before = facilities().data.bookings.length
    let error: unknown
    await act(async () => {
      error = await facilities().createBooking(booking('ghost')).catch((e: unknown) => e)
    })
    expect(error).toBeInstanceOf(FacilitiesError)
    expect((error as FacilitiesError).code).toBe('invalid_input')
    expect(facilities().data.bookings.length).toBe(before)
  })

  it('reflects decisions, parcels, closing a facility and notifications', async () => {
    mount(makeTestFacilities().facilities)
    await ready()
    const pending = facilities().data.bookings.find((b) => b.status === 'pending' && b.date >= TEST_TODAY)!
    await act(async () => {
      await facilities().decideBooking(pending.id, 'confirmed', '', 'สมหญิง นิติบุคคล')
    })
    expect(facilities().data.bookings.find((b) => b.id === pending.id)?.status).toBe('confirmed')
    const pool = facilities().data.facilities.find((f) => f.key === 'pool')!
    await act(async () => {
      await facilities().setFacilityClosed(pool.id, true, 'ซ่อม')
    })
    expect(facilities().data.facilities.find((f) => f.id === pool.id)?.closed).toBe(true)
    const waiting = facilities().data.parcels.find((p) => p.status === 'waiting')!
    await act(async () => {
      await facilities().markPickedUp(waiting.id, '', 'x')
    })
    expect(facilities().data.parcels.find((p) => p.id === waiting.id)?.status).toBe('pickedUp')
    const unread = facilities().data.notifications.find((n) => !n.read)!
    await act(async () => {
      await facilities().markRead(unread.id)
    })
    expect(facilities().data.notifications.find((n) => n.id === unread.id)?.read).toBe(true)
    await act(async () => {
      await facilities().markAllRead('role:juristic')
    })
    expect(facilities().data.notifications.filter((n) => n.recipient === 'role:juristic').every((n) => n.read)).toBe(true)
  })

  it('ends in the error state when loading fails (never stuck loading)', async () => {
    const api: FacilitiesApi = { ...makeTestFacilities().facilities, load: () => Promise.reject(new Error('boom')) }
    mount(api)
    expect(await screen.findByText('error')).toBeInTheDocument()
  })

  it('ends in the error state when reloading after a change fails', async () => {
    const base = makeTestFacilities().facilities
    let loads = 0
    const api: FacilitiesApi = { ...base, load: () => (loads++ === 0 ? base.load() : Promise.reject(new Error('boom'))) }
    mount(api)
    await ready()
    await act(async () => {
      await facilities().markAllRead('role:juristic')
    })
    expect(screen.getByTestId('status')).toHaveTextContent('error')
  })

  it('does not set state after unmount', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const base = makeTestFacilities().facilities
    let resolve!: (d: FacilitiesData) => void
    const api: FacilitiesApi = { ...base, load: () => new Promise<FacilitiesData>((r) => (resolve = r)) }
    const { unmount } = mount(api)
    unmount()
    resolve(await makeTestFacilities().facilities.load())
    await act(async () => {})
    expect(spy).not.toHaveBeenCalled()
  })

  it('reloads when another tab changes the stored facilities data, and ignores other keys', async () => {
    const api = makeTestFacilities().facilities
    const load = vi.spyOn(api, 'load')
    mount(api)
    await ready()
    const before = load.mock.calls.length
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'condo:maintenance' }))
    })
    expect(load.mock.calls.length).toBe(before)
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: FACILITIES_KEY }))
    })
    expect(load.mock.calls.length).toBeGreaterThan(before)
  })

  it('throws a clear error when useFacilities is used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/FacilitiesProvider/)
  })
})

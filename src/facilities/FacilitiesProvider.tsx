import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { todayISO } from '../property/dates'
import { FacilitiesContext, type FacilitiesContextValue } from './FacilitiesContext'
import { FACILITIES_KEY, localFacilitiesApi } from './localFacilitiesApi'
import type { FacilitiesApi, FacilitiesData } from './types'

const EMPTY: FacilitiesData = { version: 1, facilities: [], bookings: [], parcels: [], notifications: [] }

interface Props {
  api?: FacilitiesApi
  /** must be a stable function (module-level or memoised) — it is a dependency of the loading effect */
  today?: () => string
  children: ReactNode
}

type State = { status: 'loading' | 'ready' | 'error'; data: FacilitiesData; today: string }

export function FacilitiesProvider({ api = localFacilitiesApi, today = todayISO, children }: Props) {
  const [state, setState] = useState<State>({ status: 'loading', data: EMPTY, today: '' })

  const reload = useCallback(async () => {
    try {
      const data = await api.load()
      setState({ status: 'ready', data, today: today() })
    } catch {
      setState((s) => ({ ...s, status: 'error' }))
    }
  }, [api, today])

  useEffect(() => {
    let alive = true
    api
      .load()
      .then((data) => alive && setState({ status: 'ready', data, today: today() }))
      .catch(() => alive && setState((s) => ({ ...s, status: 'error' })))
    return () => {
      alive = false
    }
  }, [api, today])

  // another browser tab changed the stored facilities data: show it here too
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === FACILITIES_KEY) void reload()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [reload])

  const value = useMemo<FacilitiesContextValue>(() => {
    // run a change on the api, then reload so every screen sees it; errors go to the caller
    const mutate = async <T,>(run: () => Promise<T>): Promise<T> => {
      const result = await run()
      await reload()
      return result
    }
    return {
      ...state,
      createBooking: (input) => mutate(() => api.createBooking(input)),
      cancelBooking: (bookingId, actorPhone) => mutate(() => api.cancelBooking(bookingId, actorPhone)),
      decideBooking: (bookingId, decision, reason, actorName) => mutate(() => api.decideBooking(bookingId, decision, reason, actorName)),
      setFacilityClosed: (facilityId, closed, note) => mutate(() => api.setFacilityClosed(facilityId, closed, note)),
      registerParcel: (input, actorName) => mutate(() => api.registerParcel(input, actorName)),
      markPickedUp: (parcelId, note, actorName) => mutate(() => api.markPickedUp(parcelId, note, actorName)),
      markRead: (notificationId) => mutate(() => api.markRead(notificationId)),
      markAllRead: (recipient) => mutate(() => api.markAllRead(recipient)),
      reload,
    }
  }, [api, state, reload])

  return <FacilitiesContext.Provider value={value}>{children}</FacilitiesContext.Provider>
}

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { todayISO } from './dates'
import { localPropertyApi, PROPERTY_KEY } from './localPropertyApi'
import { PropertyContext, type PropertyContextValue } from './PropertyContext'
import { summarize } from './rules'
import type { PropertyApi, PropertyData } from './types'

const EMPTY: PropertyData = { version: 1, units: [], leases: [], inspections: [] }

interface Props {
  api?: PropertyApi
  /** must be a stable function (module-level or memoised) — it is a dependency of the loading effect */
  today?: () => string
  children: ReactNode
}

type State = { status: 'loading' | 'ready' | 'error'; data: PropertyData; today: string }

export function PropertyProvider({ api = localPropertyApi, today = todayISO, children }: Props) {
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

  // another browser tab changed the stored data: show it here too
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === PROPERTY_KEY) void reload()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [reload])

  const value = useMemo<PropertyContextValue>(() => {
    // run a change on the api, then reload so every screen sees the new data; errors go to the caller
    const mutate = async <T,>(run: () => Promise<T>): Promise<T> => {
      const result = await run()
      await reload()
      return result
    }
    return {
      ...state,
      summary: summarize(state.data, state.today),
      createUnit: (input) => mutate(() => api.createUnit(input)),
      updateUnit: (id, input) => mutate(() => api.updateUnit(id, input)),
      deleteUnit: (id) => mutate(() => api.deleteUnit(id)),
      createLease: (input) => mutate(() => api.createLease(input)),
      updateLease: (id, input) => mutate(() => api.updateLease(id, input)),
      cancelLease: (id, reason) => mutate(() => api.cancelLease(id, reason)),
      saveInspection: (input, id) => mutate(() => api.saveInspection(input, id)),
      reload,
    }
  }, [api, state, reload])

  return <PropertyContext.Provider value={value}>{children}</PropertyContext.Provider>
}

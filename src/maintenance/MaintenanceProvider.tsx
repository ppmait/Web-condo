import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { todayISO } from '../property/dates'
import { MaintenanceContext, type MaintenanceContextValue } from './MaintenanceContext'
import { MAINTENANCE_KEY, localMaintenanceApi } from './localMaintenanceApi'
import type { MaintenanceApi, MaintenanceData } from './types'

const EMPTY: MaintenanceData = { version: 1, technicians: [], requests: [], notifications: [] }

interface Props {
  api?: MaintenanceApi
  /** must be a stable function (module-level or memoised) — it is a dependency of the loading effect */
  today?: () => string
  children: ReactNode
}

type State = { status: 'loading' | 'ready' | 'error'; data: MaintenanceData; today: string }

export function MaintenanceProvider({ api = localMaintenanceApi, today = todayISO, children }: Props) {
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

  // another browser tab changed the stored maintenance data: show it here too
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === MAINTENANCE_KEY) void reload()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [reload])

  const value = useMemo<MaintenanceContextValue>(() => {
    // run a change on the api, then reload so every screen sees it; errors go to the caller
    const mutate = async <T,>(run: () => Promise<T>): Promise<T> => {
      const result = await run()
      await reload()
      return result
    }
    return {
      ...state,
      createRequest: (input) => mutate(() => api.createRequest(input)),
      assign: (requestId, technicianId, actorName) => mutate(() => api.assign(requestId, technicianId, actorName)),
      updateStatus: (requestId, status, note, actor) => mutate(() => api.updateStatus(requestId, status, note, actor)),
      markRead: (notificationId) => mutate(() => api.markRead(notificationId)),
      markAllRead: (recipient) => mutate(() => api.markAllRead(recipient)),
      reload,
    }
  }, [api, state, reload])

  return <MaintenanceContext.Provider value={value}>{children}</MaintenanceContext.Provider>
}

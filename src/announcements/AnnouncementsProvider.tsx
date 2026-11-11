import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { todayISO } from '../property/dates'
import { AnnouncementsContext, type AnnouncementsContextValue } from './AnnouncementsContext'
import { localAnnouncementsApi } from './localAnnouncementsApi'
import { ANNOUNCEMENTS_KEY } from './seed'
import type { AnnouncementsApi, AnnouncementsData } from './types'

const EMPTY: AnnouncementsData = { version: 1, announcements: [] }

interface Props {
  api?: AnnouncementsApi
  /** must be a stable function (module-level or memoised) — it is a dependency of the loading effect */
  today?: () => string
  children: ReactNode
}

type State = { status: 'loading' | 'ready' | 'error'; data: AnnouncementsData; today: string }

export function AnnouncementsProvider({ api = localAnnouncementsApi, today = todayISO, children }: Props) {
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

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === ANNOUNCEMENTS_KEY) void reload()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [reload])

  const value = useMemo<AnnouncementsContextValue>(() => {
    const mutate = async <T,>(run: () => Promise<T>): Promise<T> => {
      const result = await run()
      await reload()
      return result
    }

    return {
      ...state,
      create: (input, authorName) => mutate(() => api.create(input, authorName)),
      update: (id, input) => mutate(() => api.update(id, input)),
      remove: (id) => mutate(() => api.remove(id)),
      markRead: (id, phone) => mutate(() => api.markRead(id, phone)),
      markAllRead: (phone) => mutate(() => api.markAllRead(phone)),
      reload,
    }
  }, [api, state, reload])

  return <AnnouncementsContext.Provider value={value}>{children}</AnnouncementsContext.Provider>
}

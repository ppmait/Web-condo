import { createContext } from 'react'
import type { AnnouncementsApi, AnnouncementsData } from './types'

export interface AnnouncementsContextValue extends Omit<AnnouncementsApi, 'load'> {
  status: 'loading' | 'ready' | 'error'
  data: AnnouncementsData
  /** the calendar day the data was loaded for (YYYY-MM-DD); empty while loading */
  today: string
  reload(): Promise<void>
}

export const AnnouncementsContext = createContext<AnnouncementsContextValue | null>(null)

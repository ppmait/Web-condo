import { createContext } from 'react'
import type { FacilitiesApi, FacilitiesData } from './types'

export interface FacilitiesContextValue extends Omit<FacilitiesApi, 'load'> {
  status: 'loading' | 'ready' | 'error'
  data: FacilitiesData
  /** the calendar day the data was loaded for (YYYY-MM-DD); empty while loading */
  today: string
  reload(): Promise<void>
}

export const FacilitiesContext = createContext<FacilitiesContextValue | null>(null)

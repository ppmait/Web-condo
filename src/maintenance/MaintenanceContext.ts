import { createContext } from 'react'
import type { MaintenanceApi, MaintenanceData } from './types'

export interface MaintenanceContextValue extends Omit<MaintenanceApi, 'load'> {
  status: 'loading' | 'ready' | 'error'
  data: MaintenanceData
  /** the calendar day the data was loaded for (YYYY-MM-DD); empty while loading */
  today: string
  reload(): Promise<void>
}

export const MaintenanceContext = createContext<MaintenanceContextValue | null>(null)

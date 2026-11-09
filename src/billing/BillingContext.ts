import { createContext } from 'react'
import type { BillingApi, BillingData } from './types'

export interface BillingContextValue extends Omit<BillingApi, 'load'> {
  status: 'loading' | 'ready' | 'error'
  data: BillingData
  /** the calendar day the data was loaded for (YYYY-MM-DD); empty while loading */
  today: string
  reload(): Promise<void>
}

export const BillingContext = createContext<BillingContextValue | null>(null)

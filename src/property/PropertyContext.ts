import { createContext } from 'react'
import type { summarize } from './rules'
import type { Inspection, InspectionInput, Lease, LeaseInput, PropertyData, Unit, UnitInput } from './types'

export interface PropertyContextValue {
  status: 'loading' | 'ready' | 'error'
  data: PropertyData
  /** the calendar day the data was loaded for (YYYY-MM-DD); empty while loading */
  today: string
  summary: ReturnType<typeof summarize>
  createUnit(input: UnitInput): Promise<Unit>
  updateUnit(id: string, input: UnitInput): Promise<Unit>
  deleteUnit(id: string): Promise<void>
  createLease(input: LeaseInput): Promise<Lease>
  updateLease(id: string, input: LeaseInput): Promise<Lease>
  cancelLease(id: string, reason: string): Promise<Lease>
  saveInspection(input: InspectionInput, id?: string): Promise<Inspection>
  reload(): Promise<void>
}

export const PropertyContext = createContext<PropertyContextValue | null>(null)

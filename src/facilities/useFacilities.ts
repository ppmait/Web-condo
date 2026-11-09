import { useContext } from 'react'
import { FacilitiesContext, type FacilitiesContextValue } from './FacilitiesContext'

export function useFacilities(): FacilitiesContextValue {
  const ctx = useContext(FacilitiesContext)
  if (!ctx) throw new Error('useFacilities must be used inside <FacilitiesProvider>')
  return ctx
}

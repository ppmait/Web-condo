import { useContext } from 'react'
import { MaintenanceContext, type MaintenanceContextValue } from './MaintenanceContext'

export function useMaintenance(): MaintenanceContextValue {
  const ctx = useContext(MaintenanceContext)
  if (!ctx) throw new Error('useMaintenance must be used inside <MaintenanceProvider>')
  return ctx
}

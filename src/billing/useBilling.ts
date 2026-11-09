import { useContext } from 'react'
import { BillingContext, type BillingContextValue } from './BillingContext'

export function useBilling(): BillingContextValue {
  const ctx = useContext(BillingContext)
  if (!ctx) throw new Error('useBilling must be used inside <BillingProvider>')
  return ctx
}

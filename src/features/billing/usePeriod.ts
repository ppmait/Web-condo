import { useOutletContext } from 'react-router'
import type { Period } from '../../billing/types'

/** The billing period the page has selected; BillingPage passes it down through the outlet. */
export const usePeriod = (): Period => useOutletContext<{ period: Period }>().period

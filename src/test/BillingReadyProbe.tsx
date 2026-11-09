import { useBilling } from '../billing/useBilling'

/** Test-only marker that appears once the BillingProvider has loaded the data. */
export default function BillingReadyProbe() {
  const { status } = useBilling()
  return status === 'ready' ? <span data-testid="billing-ready" hidden /> : null
}

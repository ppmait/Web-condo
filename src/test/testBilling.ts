import { createLocalBillingApi } from '../billing/localBillingApi'
import type { BillingApi } from '../billing/types'
import { createLocalPropertyApi } from '../property/localPropertyApi'
import type { PropertyApi } from '../property/types'
import { TEST_TODAY } from './renderProperty'

/** Fresh in-memory property and billing apis that share the same property data and a fixed "today". */
export function makeTestBilling(opts: { today?: string } = {}): { billing: BillingApi; property: PropertyApi } {
  const day = opts.today ?? TEST_TODAY
  const property = createLocalPropertyApi({ storage: null, today: () => day })
  const billing = createLocalBillingApi({ storage: null, today: () => day, property })
  return { billing, property }
}

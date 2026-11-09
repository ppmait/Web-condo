import { createLocalFacilitiesApi } from '../facilities/localFacilitiesApi'
import type { FacilitiesApi } from '../facilities/types'
import { createLocalPropertyApi } from '../property/localPropertyApi'
import type { PropertyApi } from '../property/types'
import { TEST_TODAY } from './renderProperty'

/** Fresh in-memory property and facilities apis that share the same property data and a fixed "today". */
export function makeTestFacilities(opts: { today?: string } = {}): { facilities: FacilitiesApi; property: PropertyApi } {
  const day = opts.today ?? TEST_TODAY
  const property = createLocalPropertyApi({ storage: null, today: () => day })
  const facilities = createLocalFacilitiesApi({ storage: null, today: () => day, property })
  return { facilities, property }
}

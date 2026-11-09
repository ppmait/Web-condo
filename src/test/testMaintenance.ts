import { createLocalMaintenanceApi } from '../maintenance/localMaintenanceApi'
import type { MaintenanceApi, Photo } from '../maintenance/types'
import { createLocalPropertyApi } from '../property/localPropertyApi'
import type { PropertyApi } from '../property/types'
import { TEST_TODAY } from './renderProperty'

/** Fresh in-memory property and maintenance apis that share the same property data and a fixed "today". */
export function makeTestMaintenance(opts: { today?: string } = {}): { maintenance: MaintenanceApi; property: PropertyApi } {
  const day = opts.today ?? TEST_TODAY
  const property = createLocalPropertyApi({ storage: null, today: () => day })
  const maintenance = createLocalMaintenanceApi({ storage: null, today: () => day, property })
  return { maintenance, property }
}

/** A small photo that needs no canvas. */
export const fakePhoto = (name = 'photo.jpg'): Photo => ({ name, dataUrl: 'data:image/jpeg;base64,QUJD' })

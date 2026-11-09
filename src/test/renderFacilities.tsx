import { act, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import '../i18n'
import type { Role } from '../app/roles'
import { AuthProvider } from '../auth/AuthProvider'
import { createLocalFacilitiesApi } from '../facilities/localFacilitiesApi'
import { FacilitiesProvider } from '../facilities/FacilitiesProvider'
import type { FacilitiesApi } from '../facilities/types'
import { PropertyProvider } from '../property/PropertyProvider'
import type { PropertyApi } from '../property/types'
import FacilitiesReadyProbe from './FacilitiesReadyProbe'
import PropertyReadyProbe from './PropertyReadyProbe'
import ReadyProbe from './ReadyProbe'
import { makeFakeApi } from './renderApp'
import { TEST_TODAY } from './renderProperty'
import { makeTestFacilities } from './testFacilities'

/**
 * Renders `ui` inside AuthProvider (signed in as `as`, default tenant), PropertyProvider, FacilitiesProvider and
 * MemoryRouter. Resolves once the session, the property data and the facilities data are loaded.
 */
export async function renderFacilities(
  ui: ReactElement,
  opts: { api?: FacilitiesApi; property?: PropertyApi; today?: string; route?: string; as?: Role } = {},
) {
  const day = opts.today ?? TEST_TODAY
  const today = () => day
  const pair = makeTestFacilities({ today: day })
  const property = opts.property ?? pair.property
  const api = opts.api ?? (opts.property ? createLocalFacilitiesApi({ storage: null, today, property }) : pair.facilities)
  const result = render(
    <AuthProvider api={makeFakeApi(opts.as ?? 'tenant')}>
      <PropertyProvider api={property} today={today}>
        <FacilitiesProvider api={api} today={today}>
          <MemoryRouter initialEntries={[opts.route ?? '/tenant/facilities']}>
            {ui}
            <ReadyProbe />
            <PropertyReadyProbe />
            <FacilitiesReadyProbe />
          </MemoryRouter>
        </FacilitiesProvider>
      </PropertyProvider>
    </AuthProvider>,
  )
  await screen.findByTestId('auth-ready')
  await screen.findByTestId('property-ready')
  await screen.findByTestId('facilities-ready')
  await act(async () => {})
  return { ...result, api, property }
}

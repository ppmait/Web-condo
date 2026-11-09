import { act, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import '../i18n'
import type { Role } from '../app/roles'
import { AuthProvider } from '../auth/AuthProvider'
import { createLocalMaintenanceApi } from '../maintenance/localMaintenanceApi'
import { MaintenanceProvider } from '../maintenance/MaintenanceProvider'
import type { MaintenanceApi } from '../maintenance/types'
import { PropertyProvider } from '../property/PropertyProvider'
import type { PropertyApi } from '../property/types'
import MaintenanceReadyProbe from './MaintenanceReadyProbe'
import PropertyReadyProbe from './PropertyReadyProbe'
import ReadyProbe from './ReadyProbe'
import { makeFakeApi } from './renderApp'
import { TEST_TODAY } from './renderProperty'
import { makeTestMaintenance } from './testMaintenance'

/**
 * Renders `ui` inside AuthProvider (signed in as `as`, default tenant), PropertyProvider, MaintenanceProvider and
 * MemoryRouter. Resolves once the session, the property data and the maintenance data are loaded.
 */
export async function renderMaintenance(
  ui: ReactElement,
  opts: { api?: MaintenanceApi; property?: PropertyApi; today?: string; route?: string; as?: Role } = {},
) {
  const day = opts.today ?? TEST_TODAY
  const today = () => day
  const pair = makeTestMaintenance({ today: day })
  const property = opts.property ?? pair.property
  const api = opts.api ?? (opts.property ? createLocalMaintenanceApi({ storage: null, today, property }) : pair.maintenance)
  const result = render(
    <AuthProvider api={makeFakeApi(opts.as ?? 'tenant')}>
      <PropertyProvider api={property} today={today}>
        <MaintenanceProvider api={api} today={today}>
          <MemoryRouter initialEntries={[opts.route ?? '/tenant/maintenance']}>
            {ui}
            <ReadyProbe />
            <PropertyReadyProbe />
            <MaintenanceReadyProbe />
          </MemoryRouter>
        </MaintenanceProvider>
      </PropertyProvider>
    </AuthProvider>,
  )
  await screen.findByTestId('auth-ready')
  await screen.findByTestId('property-ready')
  await screen.findByTestId('maintenance-ready')
  await act(async () => {})
  return { ...result, api, property }
}

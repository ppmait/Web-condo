import { act, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import '../i18n'
import type { Role } from '../app/roles'
import { AuthProvider } from '../auth/AuthProvider'
import { BillingProvider } from '../billing/BillingProvider'
import { createLocalBillingApi } from '../billing/localBillingApi'
import type { BillingApi } from '../billing/types'
import { PropertyProvider } from '../property/PropertyProvider'
import type { PropertyApi } from '../property/types'
import BillingReadyProbe from './BillingReadyProbe'
import PropertyReadyProbe from './PropertyReadyProbe'
import ReadyProbe from './ReadyProbe'
import { makeFakeApi } from './renderApp'
import { TEST_TODAY } from './renderProperty'
import { makeTestBilling } from './testBilling'

/**
 * Renders `ui` inside AuthProvider (signed in as `as`, default juristic), PropertyProvider, BillingProvider and
 * MemoryRouter. Resolves once the session, the property data and the billing data are loaded.
 */
export async function renderBilling(
  ui: ReactElement,
  opts: { api?: BillingApi; property?: PropertyApi; today?: string; route?: string; as?: Role } = {},
) {
  const day = opts.today ?? TEST_TODAY
  const today = () => day
  const pair = makeTestBilling({ today: day })
  const property = opts.property ?? pair.property
  const api = opts.api ?? (opts.property ? createLocalBillingApi({ storage: null, today, property }) : pair.billing)
  const result = render(
    <AuthProvider api={makeFakeApi(opts.as ?? 'juristic')}>
      <PropertyProvider api={property} today={today}>
        <BillingProvider api={api} today={today}>
          <MemoryRouter initialEntries={[opts.route ?? '/juristic/billing']}>
            {ui}
            <ReadyProbe />
            <PropertyReadyProbe />
            <BillingReadyProbe />
          </MemoryRouter>
        </BillingProvider>
      </PropertyProvider>
    </AuthProvider>,
  )
  await screen.findByTestId('auth-ready')
  await screen.findByTestId('property-ready')
  await screen.findByTestId('billing-ready')
  await act(async () => {})
  return { ...result, api, property }
}

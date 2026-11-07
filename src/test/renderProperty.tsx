import { act, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import '../i18n'
import type { Role } from '../app/roles'
import { AuthProvider } from '../auth/AuthProvider'
import { createLocalPropertyApi } from '../property/localPropertyApi'
import { PropertyProvider } from '../property/PropertyProvider'
import type { PropertyApi } from '../property/types'
import PropertyReadyProbe from './PropertyReadyProbe'
import ReadyProbe from './ReadyProbe'
import { makeFakeApi } from './renderApp'

export const TEST_TODAY = '2026-11-08'

/** A fresh in-memory property api (sample data relative to a fixed day). */
export function makeTestApi(opts: { today?: string } = {}): PropertyApi {
  const day = opts.today ?? TEST_TODAY
  return createLocalPropertyApi({ storage: null, today: () => day })
}

/**
 * Renders `ui` inside AuthProvider (signed in as `as`, default juristic), PropertyProvider and MemoryRouter.
 * Resolves once both the session and the property data are loaded.
 */
export async function renderProperty(
  ui: ReactElement,
  opts: { api?: PropertyApi; today?: string; route?: string; as?: Role } = {},
) {
  const day = opts.today ?? TEST_TODAY
  const today = () => day
  const api = opts.api ?? makeTestApi({ today: day })
  const result = render(
    <AuthProvider api={makeFakeApi(opts.as ?? 'juristic')}>
      <PropertyProvider api={api} today={today}>
        <MemoryRouter initialEntries={[opts.route ?? '/juristic/units']}>
          {ui}
          <ReadyProbe />
          <PropertyReadyProbe />
        </MemoryRouter>
      </PropertyProvider>
    </AuthProvider>,
  )
  await screen.findByTestId('auth-ready')
  await screen.findByTestId('property-ready')
  await act(async () => {})
  return { ...result, api }
}

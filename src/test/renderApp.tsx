import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import '../i18n'
import { AppRoutes } from '../app/router'
import type { Role } from '../app/roles'
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../auth/demoAccounts'
import { createLocalAuthApi } from '../auth/localAuthApi'
import { AuthProvider } from '../auth/AuthProvider'
import type { AuthApi } from '../auth/types'
import ReadyProbe from './ReadyProbe'

const fastHash = async (s: string) => `h:${s}`

/** In-memory AuthApi. With `initial`, that role's demo account is already signed in (on the first currentUser call). */
export function makeFakeApi(initial: Role | null = null): AuthApi {
  const base = createLocalAuthApi({ storage: null, hash: fastHash })
  let pending = initial ? DEMO_ACCOUNTS.find((a) => a.role === initial) : undefined
  return {
    ...base,
    async currentUser() {
      if (pending) {
        const account = pending
        pending = undefined
        await base.login(account.username, DEMO_PASSWORD)
      }
      return base.currentUser()
    },
  }
}

/** Renders the whole route tree at `path`; resolves once the session has been loaded. */
export async function renderApp(path: string, opts: { as?: Role | null } = {}) {
  const api = makeFakeApi(opts.as ?? null)
  const result = render(
    <AuthProvider api={api}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
        <ReadyProbe />
      </MemoryRouter>
    </AuthProvider>,
  )
  await screen.findByTestId('auth-ready')
  return { ...result, api }
}

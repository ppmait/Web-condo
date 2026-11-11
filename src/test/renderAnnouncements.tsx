import { act, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import '../i18n'
import type { Role } from '../app/roles'
import { AnnouncementsProvider } from '../announcements/AnnouncementsProvider'
import type { AnnouncementsApi } from '../announcements/types'
import { AuthProvider } from '../auth/AuthProvider'
import AnnouncementsReadyProbe from './AnnouncementsReadyProbe'
import ReadyProbe from './ReadyProbe'
import { makeFakeApi } from './renderApp'
import { TEST_TODAY } from './renderProperty'
import { makeTestAnnouncements } from './testAnnouncements'

export async function renderAnnouncements(
  ui: ReactElement,
  opts: { api?: AnnouncementsApi; today?: string; route?: string; as?: Role } = {},
) {
  const day = opts.today ?? TEST_TODAY
  const today = () => day
  const api = opts.api ?? makeTestAnnouncements({ today: day }).announcements

  const result = render(
    <AuthProvider api={makeFakeApi(opts.as ?? 'tenant')}>
      <AnnouncementsProvider api={api} today={today}>
        <MemoryRouter initialEntries={[opts.route ?? '/tenant/announcements']}>
          {ui}
          <ReadyProbe />
          <AnnouncementsReadyProbe />
        </MemoryRouter>
      </AnnouncementsProvider>
    </AuthProvider>,
  )

  await screen.findByTestId('auth-ready')
  await screen.findByTestId('announcements-ready')
  await act(async () => {})
  return { ...result, api }
}

import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { AppRoutes } from '../app/router'
import { makeFakeApi, renderApp } from '../test/renderApp'
import { AuthProvider } from './AuthProvider'
import type { AuthApi } from './types'

const loginHeading = () => screen.getByRole('heading', { level: 1, name: 'เข้าสู่ระบบ' })
const heading = (name: string) => screen.getByRole('heading', { level: 1, name })

afterEach(async () => {
  await i18n.changeLanguage('th')
})

describe('when signed out', () => {
  it.each(['/tenant/billing', '/juristic/billing', '/technician/jobs', '/', '/xyz', '/tenant/xyz'])(
    'sends %s to the login page',
    async (path) => {
      await renderApp(path)
      expect(loginHeading()).toBeInTheDocument()
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    },
  )

  it('lets /login and /register be opened', async () => {
    await renderApp('/register')
    expect(heading('สมัครสมาชิกผู้เช่า')).toBeInTheDocument()
  })
})

describe('when signed in', () => {
  it('sends / to the home page of the role', async () => {
    await renderApp('/', { as: 'technician' })
    expect(heading('งานของฉัน')).toBeInTheDocument()
  })

  it.each([
    ['tenant', '/login', 'ภาพรวมห้องชุด'],
    ['juristic', '/register', 'แดชบอร์ด'],
    ['technician', '/login', 'งานของฉัน'],
  ] as const)('sends a %s away from %s to their home page', async (role, path, title) => {
    await renderApp(path, { as: role })
    expect(heading(title)).toBeInTheDocument()
  })

  it('sends a tenant who opens a juristic URL back to the tenant home, without the juristic menu', async () => {
    await renderApp('/juristic/dashboard', { as: 'tenant' })
    expect(heading('ภาพรวมห้องชุด')).toBeInTheDocument()
    const nav = within(screen.getByRole('navigation'))
    expect(nav.queryByRole('link', { name: 'แดชบอร์ด' })).not.toBeInTheDocument()
    expect(nav.queryByRole('link', { name: 'รายงาน' })).not.toBeInTheDocument()
  })

  it('sends a juristic user who opens a tenant URL back to the juristic home', async () => {
    await renderApp('/tenant/billing', { as: 'juristic' })
    expect(heading('แดชบอร์ด')).toBeInTheDocument()
  })

  it('sends a technician who opens a juristic role root to the technician home', async () => {
    await renderApp('/juristic', { as: 'technician' })
    expect(heading('งานของฉัน')).toBeInTheDocument()
  })
})

describe('while the session is loading', () => {
  it('shows a loading status instead of flashing the login page', async () => {
    let resolve!: (user: null) => void
    const api: AuthApi = {
      ...makeFakeApi(),
      currentUser: () => new Promise<null>((r) => (resolve = r)),
    }
    render(
      <AuthProvider api={api}>
        <MemoryRouter initialEntries={['/tenant/billing']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'เข้าสู่ระบบ' })).not.toBeInTheDocument()

    await act(async () => resolve(null))
    expect(loginHeading()).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

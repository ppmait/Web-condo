import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useNavigate } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { DEMO_PASSWORD } from '../auth/demoAccounts'
import { SESSION_KEY, createLocalAuthApi } from '../auth/localAuthApi'
import { renderApp } from '../test/renderApp'

function BackButton() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate(-1)}>
      browser-back
    </button>
  )
}

const menu = () => within(screen.getByTestId('header-actions'))
const fastHash = async (s: string) => `h:${s}`

afterEach(async () => {
  await i18n.changeLanguage('th')
})

describe('UserMenu', () => {
  it('shows the full name and the role of the signed-in user', async () => {
    await renderApp('/tenant/overview', { as: 'tenant' })
    expect(menu().getByText('สมชาย ผู้เช่า')).toBeInTheDocument()
    expect(menu().getByText('ผู้เช่า')).toBeInTheDocument()
  })

  it('shows the role of a juristic user', async () => {
    await renderApp('/juristic/dashboard', { as: 'juristic' })
    expect(menu().getByText('นิติบุคคล')).toBeInTheDocument()
  })

  it('shows the role in English after switching language', async () => {
    await renderApp('/tenant/overview', { as: 'tenant' })
    await userEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(menu().getByText('Tenant')).toBeInTheDocument()
    expect(menu().getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('signs out: back to the login page, no protected shell, session cleared', async () => {
    const api = createLocalAuthApi({ storage: localStorage, hash: fastHash })
    await api.login('tenant01', DEMO_PASSWORD)
    await renderApp('/tenant/billing', { api })
    expect(localStorage.getItem(SESSION_KEY)).not.toBeNull()

    await userEvent.click(menu().getByRole('button', { name: 'ออกจากระบบ' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'เข้าสู่ระบบ' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('does not show a protected page when Back is pressed after signing out', async () => {
    await renderApp('/tenant/overview', { as: 'tenant', extra: <BackButton /> })
    await userEvent.click(screen.getByRole('link', { name: 'พัสดุของฉัน' }))
    await userEvent.click(menu().getByRole('button', { name: 'ออกจากระบบ' }))
    await screen.findByRole('heading', { level: 1, name: 'เข้าสู่ระบบ' })

    await userEvent.click(screen.getByRole('button', { name: 'browser-back' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'เข้าสู่ระบบ' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('keeps a very long name from breaking the header (truncated, full name in title)', async () => {
    const longName = 'ก'.repeat(60)
    const api = createLocalAuthApi({ storage: null, hash: fastHash })
    await api.register({
      username: 'longname1',
      password: 'password123',
      confirmPassword: 'password123',
      fullName: longName,
      email: 'long@example.com',
      phone: '0812345678',
    })
    await renderApp('/tenant/overview', { api })
    const name = menu().getByTitle(longName)
    expect(name).toHaveClass('truncate', 'max-w-40')
    expect(screen.getByTestId('header-actions')).toHaveClass('shrink-0')
  })
})

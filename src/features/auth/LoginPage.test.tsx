import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n'
import { AuthProvider } from '../../auth/AuthProvider'
import { DEMO_PASSWORD } from '../../auth/demoAccounts'
import type { AuthApi, User } from '../../auth/types'
import { makeFakeApi } from '../../test/renderApp'
import LoginPage from './LoginPage'
import RegisterPage from './RegisterPage'

function renderLogin(api: AuthApi = makeFakeApi()) {
  render(
    <AuthProvider api={api}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/tenant/overview" element={<p>HOME tenant</p>} />
          <Route path="/juristic/dashboard" element={<p>HOME juristic</p>} />
          <Route path="/technician/jobs" element={<p>HOME technician</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
  return api
}

const fields = () => ({
  username: screen.getByLabelText('ชื่อผู้ใช้'),
  password: screen.getByLabelText('รหัสผ่าน'),
})

afterEach(async () => {
  vi.restoreAllMocks()
  await i18n.changeLanguage('th')
})

describe('LoginPage', () => {
  it.each([
    ['tenant01', 'HOME tenant'],
    ['staff01', 'HOME juristic'],
    ['tech01', 'HOME technician'],
  ])('signs %s in and goes to the home page of their role', async (username, home) => {
    renderLogin()
    await userEvent.type(fields().username, username)
    await userEvent.type(fields().password, DEMO_PASSWORD)
    await userEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }))
    expect(await screen.findByText(home)).toBeInTheDocument()
  })

  it('shows one generic error, clears the password and keeps the username after a failed login', async () => {
    renderLogin()
    await userEvent.type(fields().username, 'tenant01')
    await userEvent.type(fields().password, 'wrong-password')
    await userEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
    expect(fields().password).toHaveValue('')
    expect(fields().username).toHaveValue('tenant01')
  })

  it('shows a generic error when login fails for another reason, e.g. hashing is unavailable', async () => {
    const api = makeFakeApi()
    vi.spyOn(api, 'login').mockRejectedValue(new TypeError('crypto.subtle is unavailable'))
    renderLogin(api)
    await userEvent.type(fields().username, 'tenant01')
    await userEvent.type(fields().password, DEMO_PASSWORD)
    await userEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
    expect(screen.getByRole('button', { name: 'เข้าสู่ระบบ' })).toBeEnabled()
  })

  it('moves focus to the first empty field after an empty submit', async () => {
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }))
    expect(fields().username).toHaveFocus()
    await userEvent.type(fields().username, 'tenant01')
    await userEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }))
    expect(fields().password).toHaveFocus()
  })

  it('does not call login for empty fields and shows errors under them', async () => {
    const api = makeFakeApi()
    const login = vi.spyOn(api, 'login')
    renderLogin(api)
    await userEvent.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }))
    expect(login).not.toHaveBeenCalled()
    expect(fields().username).toHaveAttribute('aria-invalid', 'true')
    expect(fields().password).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getAllByText('กรุณากรอกข้อมูลในช่องนี้')).toHaveLength(2)
  })

  it('disables the button while waiting and does not submit twice', async () => {
    const api = makeFakeApi()
    let resolve!: (u: User) => void
    const login = vi.spyOn(api, 'login').mockImplementation(
      () => new Promise<User>((r) => (resolve = r)),
    )
    renderLogin(api)
    await userEvent.type(fields().username, 'tenant01')
    await userEvent.type(fields().password, DEMO_PASSWORD)
    const submit = screen.getByRole('button', { name: 'เข้าสู่ระบบ' })
    await userEvent.click(submit)
    await userEvent.click(submit)
    await userEvent.keyboard('{Enter}')
    expect(login).toHaveBeenCalledTimes(1)
    expect(submit).toBeDisabled()
    resolve({ id: '1', username: 'tenant01', fullName: 'x', email: 'x@y.z', phone: '0800000000', role: 'tenant' })
    expect(await screen.findByText('HOME tenant')).toBeInTheDocument()
  })

  it('fills the fields from a demo account without submitting', async () => {
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: /staff01/ }))
    expect(fields().username).toHaveValue('staff01')
    expect(fields().password).toHaveValue(DEMO_PASSWORD)
    expect(screen.queryByText('HOME juristic')).not.toBeInTheDocument()
  })

  it('has a password field that hides its text', () => {
    renderLogin()
    expect(fields().password).toHaveAttribute('type', 'password')
  })

  it('links to the register page', async () => {
    renderLogin()
    await userEvent.click(screen.getByRole('link', { name: /สมัครสมาชิก/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'สมัครสมาชิกผู้เช่า' })).toBeInTheDocument()
  })

  it('switches to English', async () => {
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
  })
})

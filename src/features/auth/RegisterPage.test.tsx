import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n'
import { AuthProvider } from '../../auth/AuthProvider'
import type { AuthApi, User } from '../../auth/types'
import { makeFakeApi } from '../../test/renderApp'
import LoginPage from './LoginPage'
import RegisterPage from './RegisterPage'

function renderRegister(api: AuthApi = makeFakeApi()) {
  render(
    <AuthProvider api={api}>
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/tenant/overview" element={<p>HOME tenant</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
  return api
}

const LABELS = {
  username: 'ชื่อผู้ใช้',
  password: 'รหัสผ่าน',
  confirmPassword: 'ยืนยันรหัสผ่าน',
  fullName: 'ชื่อ-นามสกุล',
  email: 'อีเมล',
  phone: 'เบอร์โทร',
} as const

const VALID = {
  username: 'somchai_01',
  password: 'password123',
  confirmPassword: 'password123',
  fullName: 'สมชาย ใจดี',
  email: 'somchai@example.com',
  phone: '0812345678',
}

async function fill(values: Partial<typeof VALID> = {}) {
  const all = { ...VALID, ...values }
  for (const key of Object.keys(LABELS) as (keyof typeof LABELS)[]) {
    const input = screen.getByLabelText(LABELS[key])
    await userEvent.clear(input)
    if (all[key]) await userEvent.type(input, all[key])
  }
}

const submit = () => screen.getByRole('button', { name: 'สมัครสมาชิก' })

afterEach(async () => {
  vi.restoreAllMocks()
  await i18n.changeLanguage('th')
})

describe('RegisterPage', () => {
  it('has no role selector (tenants only)', () => {
    renderRegister()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'สมัครสมาชิกผู้เช่า' })).toBeInTheDocument()
  })

  it('shows an error under every invalid field and does not call register', async () => {
    const api = makeFakeApi()
    const register = vi.spyOn(api, 'register')
    renderRegister(api)
    await userEvent.type(screen.getByLabelText(LABELS.password), 'x')
    await userEvent.click(submit())
    expect(register).not.toHaveBeenCalled()
    for (const label of Object.values(LABELS)) {
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true')
    }
    expect(screen.getByText('รหัสผ่านต้องมีอย่างน้อย 8 ตัว')).toBeInTheDocument()
    expect(screen.getByText('รหัสผ่านไม่ตรงกัน')).toBeInTheDocument()
  })

  it('moves focus to the first invalid field after a failed submit', async () => {
    renderRegister()
    await userEvent.click(submit())
    expect(screen.getByLabelText(LABELS.username)).toHaveFocus()
    await fill({ username: 'somchai_01', password: 'short', confirmPassword: 'short' })
    await userEvent.click(submit())
    expect(screen.getByLabelText(LABELS.password)).toHaveFocus()
  })

  it('clears a field error as soon as that field is edited', async () => {
    renderRegister()
    await userEvent.click(submit())
    expect(screen.getByLabelText(LABELS.email)).toHaveAttribute('aria-invalid', 'true')
    await userEvent.type(screen.getByLabelText(LABELS.email), 'a')
    expect(screen.getByLabelText(LABELS.email)).toHaveAttribute('aria-invalid', 'false')
    expect(screen.getByLabelText(LABELS.phone)).toHaveAttribute('aria-invalid', 'true')
  })

  it('registers a tenant and goes to the tenant home page', async () => {
    const api = makeFakeApi()
    const register = vi.spyOn(api, 'register')
    renderRegister(api)
    await fill()
    await userEvent.click(submit())
    expect(await screen.findByText('HOME tenant')).toBeInTheDocument()
    expect(register).toHaveBeenCalledTimes(1)
    expect(register.mock.calls[0][0]).toEqual(VALID)
  })

  it('shows a username-taken error under the username field', async () => {
    renderRegister()
    await fill({ username: 'tenant01' })
    await userEvent.click(submit())
    expect(await screen.findByText('ชื่อผู้ใช้นี้ถูกใช้แล้ว')).toBeInTheDocument()
    expect(screen.getByLabelText(LABELS.username)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText('HOME tenant')).not.toBeInTheDocument()
  })

  it('does not register twice when submitted again while waiting', async () => {
    const api = makeFakeApi()
    let resolve!: (u: User) => void
    const register = vi.spyOn(api, 'register').mockImplementation(
      () => new Promise<User>((r) => (resolve = r)),
    )
    renderRegister(api)
    await fill()
    await userEvent.click(submit())
    await userEvent.click(submit())
    expect(register).toHaveBeenCalledTimes(1)
    expect(submit()).toBeDisabled()
    resolve({ id: '1', username: 'somchai_01', fullName: 'x', email: 'x@y.z', phone: '0812345678', role: 'tenant' })
    expect(await screen.findByText('HOME tenant')).toBeInTheDocument()
  })

  it('uses password-type inputs for both password fields', () => {
    renderRegister()
    expect(screen.getByLabelText(LABELS.password)).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText(LABELS.confirmPassword)).toHaveAttribute('type', 'password')
  })

  it('links back to the login page', async () => {
    renderRegister()
    await userEvent.click(screen.getByRole('link', { name: /เข้าสู่ระบบ/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'เข้าสู่ระบบ' })).toBeInTheDocument()
  })
})

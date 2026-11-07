import { act, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../i18n'
import { makeFakeApi } from '../test/renderApp'
import AuthLoading from './AuthLoading'
import { AuthProvider } from './AuthProvider'
import { DEMO_PASSWORD } from './demoAccounts'
import { AuthError, type AuthApi, type RegisterForm } from './types'
import { useAuth } from './useAuth'

const holder: { value?: ReturnType<typeof useAuth> } = {}
const auth = () => holder.value as ReturnType<typeof useAuth>

function Probe() {
  const current = useAuth()
  useEffect(() => {
    holder.value = current
  })
  return (
    <div>
      <span data-testid="status">{current.status}</span>
      <span data-testid="user">{current.user?.username ?? 'none'}</span>
    </div>
  )
}

const mount = (api: AuthApi) =>
  render(
    <AuthProvider api={api}>
      <Probe />
    </AuthProvider>,
  )

const form: RegisterForm = {
  username: 'somchai_01',
  password: 'password123',
  confirmPassword: 'password123',
  fullName: 'สมชาย ใจดี',
  email: 'somchai@example.com',
  phone: '0812345678',
}

afterEach(() => vi.restoreAllMocks())

describe('AuthProvider', () => {
  it('starts as loading and then becomes ready without a user', async () => {
    mount(makeFakeApi())
    expect(screen.getByTestId('status')).toHaveTextContent('loading')
    expect(await screen.findByText('ready')).toBeInTheDocument()
    expect(screen.getByTestId('user')).toHaveTextContent('none')
  })

  it('becomes ready with the user that currentUser returns', async () => {
    mount(makeFakeApi('juristic'))
    await screen.findByText('ready')
    expect(screen.getByTestId('user')).toHaveTextContent('staff01')
  })

  it('updates the user after a successful login', async () => {
    mount(makeFakeApi())
    await screen.findByText('ready')
    await act(async () => {
      await auth().login('tenant01', DEMO_PASSWORD)
    })
    expect(screen.getByTestId('user')).toHaveTextContent('tenant01')
  })

  it('rejects with the AuthError on a failed login and keeps the user unchanged', async () => {
    mount(makeFakeApi('tenant'))
    await screen.findByText('ready')
    let error: unknown
    await act(async () => {
      error = await auth().login('tenant01', 'wrong-password').catch((e: unknown) => e)
    })
    expect(error).toBeInstanceOf(AuthError)
    expect((error as AuthError).code).toBe('invalid_credentials')
    expect(screen.getByTestId('user')).toHaveTextContent('tenant01')
  })

  it('registers a tenant and signs them in', async () => {
    mount(makeFakeApi())
    await screen.findByText('ready')
    let role = ''
    await act(async () => {
      role = (await auth().register(form)).role
    })
    expect(role).toBe('tenant')
    expect(screen.getByTestId('user')).toHaveTextContent('somchai_01')
  })

  it('clears the user on logout', async () => {
    mount(makeFakeApi('technician'))
    await screen.findByText('ready')
    await act(async () => {
      await auth().logout()
    })
    expect(screen.getByTestId('user')).toHaveTextContent('none')
  })

  it('ends up ready without a user when currentUser rejects (never stuck loading)', async () => {
    const api: AuthApi = { ...makeFakeApi(), currentUser: () => Promise.reject(new Error('boom')) }
    mount(api)
    expect(await screen.findByText('ready')).toBeInTheDocument()
    expect(screen.getByTestId('user')).toHaveTextContent('none')
  })

  it('throws a clear error when useAuth is used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/AuthProvider/)
  })
})

describe('AuthLoading', () => {
  it('is a status region with the loading text', () => {
    render(<AuthLoading />)
    expect(screen.getByRole('status')).toHaveTextContent('กำลังโหลด')
  })
})

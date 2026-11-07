import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AuthContext } from './AuthContext'
import { localAuthApi } from './localAuthApi'
import type { AuthApi, RegisterForm, User } from './types'

interface Props {
  api?: AuthApi
  children: ReactNode
}

export function AuthProvider({ api = localAuthApi, children }: Props) {
  const [state, setState] = useState<{ status: 'loading' | 'ready'; user: User | null }>({
    status: 'loading',
    user: null,
  })

  useEffect(() => {
    let alive = true
    api
      .currentUser()
      .then((user) => alive && setState({ status: 'ready', user }))
      .catch(() => alive && setState({ status: 'ready', user: null }))
    return () => {
      alive = false
    }
  }, [api])

  const login = useCallback(
    async (username: string, password: string) => {
      const user = await api.login(username, password)
      setState({ status: 'ready', user })
      return user
    },
    [api],
  )

  const register = useCallback(
    async (form: RegisterForm) => {
      const user = await api.register(form)
      setState({ status: 'ready', user })
      return user
    },
    [api],
  )

  const logout = useCallback(async () => {
    await api.logout()
    setState({ status: 'ready', user: null })
  }, [api])

  const value = useMemo(() => ({ ...state, login, register, logout }), [state, login, register, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

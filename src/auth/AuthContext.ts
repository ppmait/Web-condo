import { createContext } from 'react'
import type { RegisterForm, User } from './types'

export interface AuthContextValue {
  status: 'loading' | 'ready'
  user: User | null
  login(username: string, password: string): Promise<User>
  register(form: RegisterForm): Promise<User>
  logout(): Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

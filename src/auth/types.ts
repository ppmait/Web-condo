import type { Role } from '../app/roles'

export interface User {
  id: string
  username: string
  fullName: string
  email: string
  phone: string
  role: Role
}

export interface RegisterForm {
  username: string
  password: string
  confirmPassword: string
  fullName: string
  email: string
  phone: string
}

export type AuthErrorCode = 'invalid_credentials' | 'username_taken' | 'invalid_input'

export class AuthError extends Error {
  readonly code: AuthErrorCode

  constructor(code: AuthErrorCode) {
    super(code)
    this.name = 'AuthError'
    this.code = code
  }
}

/** Boundary to the (future) backend. The mock lives in localAuthApi.ts. */
export interface AuthApi {
  register(form: RegisterForm): Promise<User>
  login(username: string, password: string): Promise<User>
  logout(): Promise<void>
  currentUser(): Promise<User | null>
}

import type { RegisterForm } from './types'

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

const USERNAME = /^[a-z0-9_]{4,20}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE = /^0\d{9}$/

export type RegisterErrors = Partial<Record<keyof RegisterForm, string>>

/** Returns field → i18n key of the error. An empty object means the form is valid. */
export function validateRegister(form: RegisterForm): RegisterErrors {
  const errors: RegisterErrors = {}
  if (!USERNAME.test(normalizeUsername(form.username))) errors.username = 'auth.errors.username'
  if (form.password.length < 8) errors.password = 'auth.errors.password'
  if (form.confirmPassword !== form.password) errors.confirmPassword = 'auth.errors.confirmPassword'
  if (form.fullName.trim() === '') errors.fullName = 'auth.errors.fullName'
  if (!EMAIL.test(form.email.trim())) errors.email = 'auth.errors.email'
  if (!PHONE.test(form.phone.trim())) errors.phone = 'auth.errors.phone'
  return errors
}

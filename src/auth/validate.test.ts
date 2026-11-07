import { describe, expect, it } from 'vitest'
import type { RegisterForm } from './types'
import { normalizeUsername, validateRegister } from './validate'

const valid: RegisterForm = {
  username: 'somchai_01',
  password: 'password1',
  confirmPassword: 'password1',
  fullName: 'สมชาย ใจดี',
  email: 'somchai@example.com',
  phone: '0812345678',
}

describe('normalizeUsername', () => {
  it('trims and lowercases', () => {
    expect(normalizeUsername(' Tenant01 ')).toBe('tenant01')
  })
})

describe('validateRegister', () => {
  it('accepts a fully valid form', () => {
    expect(validateRegister(valid)).toEqual({})
  })

  it.each(['abc', 'a'.repeat(21), 'some-one', 'สมชาย01', 'has space'])('rejects username %j', (username) => {
    expect(validateRegister({ ...valid, username }).username).toBe('auth.errors.username')
  })

  it('accepts a username with surrounding spaces and capitals (trim + lowercase)', () => {
    expect(validateRegister({ ...valid, username: ' Tenant01 ' })).toEqual({})
  })

  it('requires a password of at least 8 characters', () => {
    expect(validateRegister({ ...valid, password: '1234567', confirmPassword: '1234567' }).password).toBe(
      'auth.errors.password',
    )
  })

  it('requires the confirmation to match', () => {
    expect(validateRegister({ ...valid, confirmPassword: 'password2' }).confirmPassword).toBe(
      'auth.errors.confirmPassword',
    )
  })

  it.each(['', '   '])('rejects an empty full name %j', (fullName) => {
    expect(validateRegister({ ...valid, fullName }).fullName).toBe('auth.errors.fullName')
  })

  it.each(['a@b', 'abc', '@x.com', 'a b@x.com'])('rejects email %j', (email) => {
    expect(validateRegister({ ...valid, email }).email).toBe('auth.errors.email')
  })

  it('accepts a 10-digit phone starting with 0', () => {
    expect(validateRegister({ ...valid, phone: '0812345678' })).toEqual({})
  })

  it.each(['812345678', '08123456789', '08123abc78', '1812345678', ''])('rejects phone %j', (phone) => {
    expect(validateRegister({ ...valid, phone }).phone).toBe('auth.errors.phone')
  })

  it('reports every invalid field at once', () => {
    const errors = validateRegister({
      username: 'a',
      password: 'x',
      confirmPassword: 'y',
      fullName: '',
      email: 'bad',
      phone: '1',
    })
    expect(Object.keys(errors).sort()).toEqual(
      ['confirmPassword', 'email', 'fullName', 'password', 'phone', 'username'].sort(),
    )
  })
})

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import './i18n'
import App from './App'

describe('App', () => {
  it('shows the login page when nobody is signed in', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: 'เข้าสู่ระบบ' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders a main landmark', () => {
    render(<App />)
    expect(screen.getByRole('main')).toBeInTheDocument()
  })
})

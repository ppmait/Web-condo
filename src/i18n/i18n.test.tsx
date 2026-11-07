import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LanguageToggle from '../components/LanguageToggle'
import i18n, { LANG_KEY, readStoredLang } from './index'

afterEach(async () => {
  vi.restoreAllMocks()
  await i18n.changeLanguage('th')
})

describe('readStoredLang', () => {
  it('defaults to th when nothing is stored', () => {
    expect(readStoredLang()).toBe('th')
  })

  it.each(['fr', ''])('falls back to th for stored value %j', (value) => {
    localStorage.setItem(LANG_KEY, value)
    expect(readStoredLang()).toBe('th')
  })

  it('falls back to th when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readStoredLang()).toBe('th')
  })

  it('returns en when en is stored', () => {
    localStorage.setItem(LANG_KEY, 'en')
    expect(readStoredLang()).toBe('en')
  })
})

describe('LanguageToggle', () => {
  it('switches to English, stores it and marks the button pressed', async () => {
    const user = userEvent.setup()
    render(<LanguageToggle />)
    expect(screen.getByRole('button', { name: 'TH' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'EN' }))
    expect(i18n.language).toBe('en')
    expect(localStorage.getItem(LANG_KEY)).toBe('en')
    expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('still switches language when localStorage throws on write', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    const user = userEvent.setup()
    render(<LanguageToggle />)
    await user.click(screen.getByRole('button', { name: 'EN' }))
    expect(i18n.language).toBe('en')
  })
})

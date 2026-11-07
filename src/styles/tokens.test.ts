import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(__dirname, 'index.css'), 'utf8')

describe('design tokens', () => {
  it.each([
    ['--color-primary: #001428'],
    ['--color-primary-container: #0f2942'],
    ['--color-secondary: #006a61'],
    ['--color-error: #ba1a1a'],
    ['--color-surface: #f7f9fb'],
    ['--color-surface-container-low: #f2f4f6'],
  ])('defines %s', (decl) => {
    expect(css).toContain(decl)
  })

  it('uses a Thai-capable font stack', () => {
    const line = css.split('\n').find((l) => l.includes('--font-sans'))
    expect(line).toContain("'Plus Jakarta Sans'")
    expect(line).toContain("'Noto Sans Thai'")
  })

  it('does not load fonts or tailwind from a CDN', () => {
    expect(css).not.toMatch(/fonts\.googleapis\.com|cdn\.tailwindcss\.com/)
  })
})

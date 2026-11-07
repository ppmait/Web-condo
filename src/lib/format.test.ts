import { describe, expect, it } from 'vitest'
import { formatBaht, formatDate } from './format'

describe('formatBaht', () => {
  it('formats whole baht with the ฿ sign and thousands separators', () => {
    expect(formatBaht(18000)).toBe('฿18,000')
    expect(formatBaht(1234567)).toBe('฿1,234,567')
  })

  it('formats zero', () => {
    expect(formatBaht(0)).toBe('฿0')
  })

  it('formats a negative amount with the minus sign', () => {
    const text = formatBaht(-1200)
    expect(text).toContain('1,200')
    expect(text.startsWith('-')).toBe(true)
  })
})

describe('formatDate', () => {
  it('shows the Buddhist year in Thai', () => {
    expect(formatDate('2026-11-08', 'th')).toBe('8 พ.ย. 2569')
  })

  it('shows the Gregorian year in English', () => {
    expect(formatDate('2026-11-08', 'en')).toBe('Nov 8, 2026')
  })

  it('does not shift the day with the time zone (UTC)', () => {
    expect(formatDate('2026-01-01', 'en')).toBe('Jan 1, 2026')
    expect(formatDate('2026-12-31', 'th')).toBe('31 ธ.ค. 2569')
  })

  it.each(['', 'abc', '2026-02-30', '2026-1-1'])('returns invalid input %j unchanged without throwing', (bad) => {
    expect(formatDate(bad, 'th')).toBe(bad)
  })
})

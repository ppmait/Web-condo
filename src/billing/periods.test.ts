import { describe, expect, it } from 'vitest'
import { addMonths, dueDateOf, isValidPeriod, periodEnd, periodOf, periodStart } from './periods'

describe('periodOf', () => {
  it('is the year and month of a date', () => {
    expect(periodOf('2026-11-08')).toBe('2026-11')
    expect(periodOf('2028-02-29')).toBe('2028-02')
    expect(periodOf('2026-01-01')).toBe('2026-01')
  })
})

describe('isValidPeriod', () => {
  it.each(['2026-11', '2026-01', '2026-12', '1999-06'])('accepts %s', (p) => {
    expect(isValidPeriod(p)).toBe(true)
  })

  it.each(['2026-13', '2026-00', '2026-1', '26-11', '', 'abc', '2026-11-01', '2026/11'])('rejects %j', (p) => {
    expect(isValidPeriod(p)).toBe(false)
  })
})

describe('addMonths', () => {
  it('moves forward and back across month and year ends', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01')
    expect(addMonths('2026-11', 0)).toBe('2026-11')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-03', -15)).toBe('2024-12')
    expect(addMonths('2026-06', 24)).toBe('2028-06')
  })
})

describe('periodStart and periodEnd', () => {
  it('gives the first and last day of the month', () => {
    expect(periodStart('2026-11')).toBe('2026-11-01')
    expect(periodEnd('2026-11')).toBe('2026-11-30')
    expect(periodEnd('2026-12')).toBe('2026-12-31')
    expect(periodEnd('2026-01')).toBe('2026-01-31')
  })

  it('knows leap years', () => {
    expect(periodEnd('2028-02')).toBe('2028-02-29')
    expect(periodEnd('2027-02')).toBe('2027-02-28')
    expect(periodEnd('2100-02')).toBe('2100-02-28')
    expect(periodEnd('2000-02')).toBe('2000-02-29')
  })
})

describe('dueDateOf', () => {
  it('is the 5th of the following month', () => {
    expect(dueDateOf('2026-11')).toBe('2026-12-05')
    expect(dueDateOf('2026-12')).toBe('2027-01-05')
  })
})

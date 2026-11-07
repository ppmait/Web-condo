import { afterEach, describe, expect, it, vi } from 'vitest'
import { addDays, daysBetween, isValidDate, todayISO } from './dates'

afterEach(() => vi.useRealTimers())

describe('isValidDate', () => {
  it.each(['2026-02-28', '2028-02-29', '2026-12-31', '1999-01-01'])('accepts %s', (d) => {
    expect(isValidDate(d)).toBe(true)
  })

  it.each(['2026-02-30', '2027-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '2026-1-1', '26-01-01', '', 'abc', '2026-01-01T00:00'])(
    'rejects %j',
    (d) => {
      expect(isValidDate(d)).toBe(false)
    },
  )
})

describe('addDays', () => {
  it('rolls over month, year and leap day', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-11-08', 0)).toBe('2026-11-08')
    expect(addDays('2026-11-08', 60)).toBe('2027-01-07')
  })
})

describe('daysBetween', () => {
  it('counts whole days, signed', () => {
    expect(daysBetween('2026-11-08', '2027-01-07')).toBe(60)
    expect(daysBetween('2027-01-07', '2026-11-08')).toBe(-60)
    expect(daysBetween('2026-11-08', '2026-11-08')).toBe(0)
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2)
  })
})

describe('todayISO', () => {
  it('is the local calendar date, even just before midnight', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 8, 23, 59, 30))
    expect(todayISO()).toBe('2026-11-08')
    vi.setSystemTime(new Date(2027, 0, 1, 0, 0, 5))
    expect(todayISO()).toBe('2027-01-01')
  })
})

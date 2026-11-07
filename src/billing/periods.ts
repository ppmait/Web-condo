import { addDays } from '../property/dates'
import type { Period } from './types'

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/

export const isValidPeriod = (value: string): boolean => PERIOD.test(value)

/** The billing month a YYYY-MM-DD date falls in. */
export const periodOf = (iso: string): Period => iso.slice(0, 7)

const pad = (n: number, width: number) => String(n).padStart(width, '0')

export function addMonths(period: Period, n: number): Period {
  const year = Number(period.slice(0, 4))
  const month = Number(period.slice(5, 7))
  const index = year * 12 + (month - 1) + n
  return `${pad(Math.floor(index / 12), 4)}-${pad((index % 12) + 1, 2)}`
}

export const periodStart = (period: Period): string => `${period}-01`

export const periodEnd = (period: Period): string => addDays(periodStart(addMonths(period, 1)), -1)

/** Invoices of a period are due on the 5th of the following month. */
export const dueDateOf = (period: Period): string => `${addMonths(period, 1)}-05`

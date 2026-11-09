import { isValidPeriod } from '../billing/periods'
import { isValidDate } from '../property/dates'

const BAHT = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 })

/** Whole baht, e.g. ฿18,000 */
export const formatBaht = (amount: number): string => BAHT.format(amount)

const DATE_FORMATS = {
  th: new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
  en: new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
}

/** YYYY-MM-DD → "8 พ.ย. 2569" (th, Buddhist year) or "Nov 8, 2026" (en). Anything that is not a real date is returned unchanged. */
export function formatDate(iso: string, lang: 'th' | 'en'): string {
  if (!isValidDate(iso)) return iso
  return DATE_FORMATS[lang].format(new Date(`${iso}T00:00:00Z`))
}

const PERIOD_FORMATS = {
  th: new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  en: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
}

/** YYYY-MM → "พฤศจิกายน 2569" (th) or "November 2026" (en). Anything that is not a real month is returned unchanged. */
export function formatPeriod(period: string, lang: 'th' | 'en'): string {
  if (!isValidPeriod(period)) return period
  return PERIOD_FORMATS[lang].format(new Date(`${period}-01T00:00:00Z`))
}

/** Bytes → "146 KB" below 1 MB, otherwise "1.5 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

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

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86_400_000

const pad = (n: number, width = 2) => String(n).padStart(width, '0')

/** The device's local calendar date as YYYY-MM-DD. */
export function todayISO(): string {
  const d = new Date()
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function toUTC(iso: string): number | null {
  const m = ISO.exec(iso)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(0)
  date.setUTCFullYear(y, mo - 1, d) // setUTCFullYear keeps years < 100 as-is
  const ok = date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d
  return ok ? date.getTime() : null
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isValidDate(iso: string): boolean {
  return toUTC(iso) !== null
}

export function addDays(iso: string, n: number): string {
  const t = toUTC(iso)
  if (t === null) throw new RangeError(`invalid date: ${iso}`)
  const d = new Date(t + n * DAY_MS)
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const a = toUTC(from)
  const b = toUTC(to)
  if (a === null || b === null) throw new RangeError(`invalid date: ${a === null ? from : to}`)
  return Math.round((b - a) / DAY_MS)
}

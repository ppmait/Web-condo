import { isValidDate, todayISO } from './dates'
import { makeSeed } from './seed'
import {
  isLeaseEditable,
  normalizeCode,
  unitHasLeases,
  validateInspection,
  validateLease,
  validateUnit,
  type FieldErrors,
} from './rules'
import {
  CHECK_ITEMS,
  CONDITIONS,
  OWNERSHIPS,
  PropertyError,
  UNIT_TYPES,
  type Inspection,
  type InspectionInput,
  type Lease,
  type LeaseInput,
  type PropertyApi,
  type PropertyData,
  type Unit,
  type UnitInput,
} from './types'

export const PROPERTY_KEY = 'condo:property'

interface Options {
  /** Defaults to the browser localStorage. `null` keeps everything in memory. */
  storage?: Storage | null
  today?: () => string
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isString = (v: unknown): v is string => typeof v === 'string'
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isDate = (v: unknown): v is string => isString(v) && isValidDate(v)

function isUnit(v: unknown): v is Unit {
  return (
    isRecord(v) &&
    isString(v.id) &&
    isString(v.code) &&
    isString(v.tower) &&
    isNumber(v.floor) &&
    isNumber(v.areaSqm) &&
    UNIT_TYPES.includes(v.type as never) &&
    isString(v.ownerName) &&
    OWNERSHIPS.includes(v.ownership as never) &&
    isNumber(v.listRent) &&
    typeof v.closed === 'boolean'
  )
}

function isLease(v: unknown): v is Lease {
  return (
    isRecord(v) &&
    isString(v.id) &&
    isString(v.unitId) &&
    isString(v.tenantName) &&
    isString(v.tenantPhone) &&
    isDate(v.startDate) &&
    isDate(v.endDate) &&
    isNumber(v.monthlyRent) &&
    isNumber(v.deposit) &&
    (v.cancelledAt === undefined || isDate(v.cancelledAt)) &&
    (v.cancelReason === undefined || isString(v.cancelReason))
  )
}

function isInspection(v: unknown): v is Inspection {
  if (!isRecord(v)) return false
  const rawItems: unknown = v.items
  if (!Array.isArray(rawItems)) return false
  const itemsOk =
    rawItems.length === CHECK_ITEMS.length &&
    CHECK_ITEMS.every((key) => rawItems.filter((i: unknown) => isRecord(i) && i.key === key).length === 1) &&
    rawItems.every((i: unknown) => isRecord(i) && CONDITIONS.includes(i.condition as never) && isString(i.note))
  return (
    itemsOk &&
    isString(v.id) &&
    isString(v.leaseId) &&
    (v.type === 'moveIn' || v.type === 'moveOut') &&
    isDate(v.date) &&
    isString(v.inspector) &&
    isString(v.note) &&
    (v.waterMeter === undefined || isNumber(v.waterMeter)) &&
    (v.electricMeter === undefined || isNumber(v.electricMeter))
  )
}

const UNIT_CODE = /^[A-Z]-\d{3,4}$/

/**
 * The rules the app relies on, checked on stored data. Data that breaks one is not trusted, because a record
 * that already breaks a rule can never be saved again through the UI (its own validation would refuse it).
 * Not the same as `validateLease` & co.: e.g. a lease on a unit that was closed later is legitimate.
 */
function isConsistent(units: Unit[], leases: Lease[], inspections: Inspection[]): boolean {
  const unitsOk = units.every(
    (u) =>
      UNIT_CODE.test(u.code) &&
      u.tower === u.code[0] &&
      Number.isInteger(u.floor) && u.floor >= 1 && u.floor <= 99 &&
      u.areaSqm > 0 && u.areaSqm <= 999 &&
      Number.isInteger(u.listRent) && u.listRent >= 0,
  )
  const leasesOk = leases.every(
    (l) =>
      l.startDate < l.endDate &&
      Number.isInteger(l.monthlyRent) && l.monthlyRent > 0 &&
      Number.isInteger(l.deposit) && l.deposit >= 0,
  )
  if (!unitsOk || !leasesOk) return false

  const live = leases.filter((l) => !l.cancelledAt)
  for (let a = 0; a < live.length; a++) {
    for (let b = a + 1; b < live.length; b++) {
      if (live[a].unitId === live[b].unitId && live[a].startDate <= live[b].endDate && live[b].startDate <= live[a].endDate) return false
    }
  }

  const seen = new Set<string>()
  for (const i of inspections) {
    const key = `${i.leaseId}|${i.type}`
    if (seen.has(key)) return false
    seen.add(key)
    const lease = leases.find((l) => l.id === i.leaseId)
    if (!lease) return false
    if (i.type === 'moveIn' && i.date < lease.startDate) return false
    if (i.type === 'moveOut') {
      const moveIn = inspections.find((x) => x.leaseId === i.leaseId && x.type === 'moveIn')
      if (moveIn && i.date < moveIn.date) return false
    }
  }
  return true
}

/** Shape, ids, references, unit codes and the rules in `isConsistent` must all hold, otherwise the data is not trusted. */
function isPropertyData(v: unknown): v is PropertyData {
  if (!isRecord(v) || v.version !== 1) return false
  const { units, leases, inspections } = v
  if (!Array.isArray(units) || !Array.isArray(leases) || !Array.isArray(inspections)) return false
  if (!units.every(isUnit) || !leases.every(isLease) || !inspections.every(isInspection)) return false
  const ids = [...units, ...leases, ...inspections].map((x) => (x as { id: string }).id)
  if (new Set(ids).size !== ids.length) return false
  if (new Set((units as Unit[]).map((u) => normalizeCode(u.code))).size !== units.length) return false
  const unitIds = new Set((units as Unit[]).map((u) => u.id))
  const leaseIds = new Set((leases as Lease[]).map((l) => l.id))
  if (!(leases as Lease[]).every((l) => unitIds.has(l.unitId))) return false
  if (!(inspections as Inspection[]).every((i) => leaseIds.has(i.leaseId))) return false
  return isConsistent(units as Unit[], leases as Lease[], inspections as Inspection[])
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

function invalid(errors: FieldErrors): never {
  throw new PropertyError('invalid_input', errors)
}

export function createLocalPropertyApi(opts: Options = {}): PropertyApi {
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage
  const today = opts.today ?? todayISO

  // Storage is the source of truth and is re-read on every call, because another browser tab may have changed it.
  // Memory is only a fallback for when storage cannot be read or written.
  let memory: PropertyData | null = null
  let persistFailed = false

  const read = (): { readable: boolean; text: string | null } => {
    if (!storage) return { readable: false, text: null }
    try {
      return { readable: true, text: storage.getItem(PROPERTY_KEY) }
    } catch {
      return { readable: false, text: null }
    }
  }
  const persist = (data: PropertyData) => {
    memory = data
    try {
      storage?.setItem(PROPERTY_KEY, JSON.stringify(data))
      persistFailed = false
    } catch {
      persistFailed = true
    }
  }
  const seed = (): PropertyData => {
    const seeded = makeSeed(today()) // may throw: nothing is cached, the next call simply tries again
    persist(seeded)
    return seeded
  }

  /** The freshest data. Call it synchronously right before changing anything, so a change is never based on stale data. */
  const fresh = (): PropertyData => {
    const { readable, text } = read()
    if (readable && !(persistFailed && memory)) {
      try {
        const parsed: unknown = JSON.parse(text ?? 'null')
        if (isPropertyData(parsed)) {
          memory = parsed
          return parsed
        }
      } catch {
        // not JSON: untrusted
      }
      return seed()
    }
    return memory ?? seed()
  }

  const toUnit = (id: string, input: UnitInput): Unit => {
    const code = normalizeCode(input.code)
    return { ...input, id, code, tower: code[0], ownerName: input.ownerName.trim() }
  }
  const toLease = (id: string, input: LeaseInput): Lease => ({
    ...input,
    id,
    tenantName: input.tenantName.trim(),
    tenantPhone: input.tenantPhone.trim(),
  })
  const toInspection = (id: string, input: InspectionInput): Inspection => ({
    ...input,
    id,
    inspector: input.inspector.trim(),
    items: CHECK_ITEMS.map((key) => {
      const item = input.items.find((i) => i.key === key)!
      return { key, condition: item.condition, note: item.note.trim() }
    }),
    note: input.note.trim(),
  })

  return {
    async load() {
      return clone(fresh())
    },

    async createUnit(input) {
      const data = fresh()
      const errors = validateUnit(input, data.units, data.leases)
      if (Object.keys(errors).length > 0) invalid(errors)
      const unit = toUnit(newId(), input)
      data.units.push(unit)
      persist(data)
      return clone(unit)
    },

    async updateUnit(id, input) {
      const data = fresh()
      const index = data.units.findIndex((u) => u.id === id)
      if (index < 0) throw new PropertyError('not_found')
      const errors = validateUnit(input, data.units, data.leases, id)
      if (Object.keys(errors).length > 0) invalid(errors)
      data.units[index] = toUnit(id, input)
      persist(data)
      return clone(data.units[index])
    },

    async deleteUnit(id) {
      const data = fresh()
      if (!data.units.some((u) => u.id === id)) throw new PropertyError('not_found')
      if (unitHasLeases(id, data.leases)) throw new PropertyError('unit_has_leases')
      data.units = data.units.filter((u) => u.id !== id)
      persist(data)
    },

    async createLease(input) {
      const data = fresh()
      const errors = validateLease(input, { units: data.units, leases: data.leases })
      if (Object.keys(errors).length > 0) invalid(errors)
      const lease = toLease(newId(), input)
      data.leases.push(lease)
      persist(data)
      return clone(lease)
    },

    async updateLease(id, input) {
      const data = fresh()
      const index = data.leases.findIndex((l) => l.id === id)
      if (index < 0) throw new PropertyError('not_found')
      const now = today()
      if (!isLeaseEditable(data.leases[index], now)) throw new PropertyError('lease_locked')
      const errors = validateLease(input, { units: data.units, leases: data.leases, selfId: id, inspections: data.inspections, today: now })
      if (Object.keys(errors).length > 0) invalid(errors)
      data.leases[index] = toLease(id, input)
      persist(data)
      return clone(data.leases[index])
    },

    async cancelLease(id, reason) {
      const data = fresh()
      const index = data.leases.findIndex((l) => l.id === id)
      if (index < 0) throw new PropertyError('not_found')
      const current = data.leases[index]
      const now = today()
      if (!isLeaseEditable(current, now)) throw new PropertyError('lease_locked')
      data.leases[index] = { ...current, cancelledAt: now, cancelReason: reason.trim() }
      persist(data)
      return clone(data.leases[index])
    },

    async saveInspection(input, id) {
      const data = fresh()
      const index = id ? data.inspections.findIndex((i) => i.id === id) : -1
      if (id && index < 0) throw new PropertyError('not_found')
      const errors = validateInspection(input, { leases: data.leases, inspections: data.inspections, selfId: id })
      if (Object.keys(errors).length > 0) invalid(errors)
      const saved = toInspection(id ?? newId(), input)
      if (index >= 0) data.inspections[index] = saved
      else data.inspections.push(saved)
      persist(data)
      return clone(saved)
    },
  }
}

export const localPropertyApi: PropertyApi = createLocalPropertyApi()

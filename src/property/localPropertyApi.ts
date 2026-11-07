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

/** Shape, ids, references and unit codes must all be consistent, otherwise the data is not trusted. */
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
  return (leases as Lease[]).every((l) => unitIds.has(l.unitId)) && (inspections as Inspection[]).every((i) => leaseIds.has(i.leaseId))
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

  const read = (): string | null => {
    try {
      return storage ? storage.getItem(PROPERTY_KEY) : null
    } catch {
      return null
    }
  }
  const persist = (data: PropertyData) => {
    try {
      storage?.setItem(PROPERTY_KEY, JSON.stringify(data))
    } catch {
      // ignore: memory stays authoritative
    }
  }

  let loading: Promise<PropertyData> | null = null
  const ensure = (): Promise<PropertyData> => {
    loading ??= Promise.resolve()
      .then(() => {
        try {
          const parsed: unknown = JSON.parse(read() ?? 'null')
          if (isPropertyData(parsed)) return parsed
        } catch {
          // fall through to seeding
        }
        const seeded = makeSeed(today())
        persist(seeded)
        return seeded
      })
      .catch((error: unknown) => {
        loading = null // do not cache a failure: the next call retries
        throw error
      })
    return loading
  }

  const toUnit = (id: string, input: UnitInput): Unit => {
    const code = normalizeCode(input.code)
    return { ...input, id, code, tower: code[0], ownerName: input.ownerName.trim() }
  }
  const toLease = (id: string, input: LeaseInput, keep: Partial<Lease> = {}): Lease => ({
    ...input,
    ...keep,
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
      return clone(await ensure())
    },

    async createUnit(input) {
      const data = await ensure()
      const errors = validateUnit(input, data.units, data.leases)
      if (Object.keys(errors).length > 0) invalid(errors)
      const unit = toUnit(newId(), input)
      data.units.push(unit)
      persist(data)
      return clone(unit)
    },

    async updateUnit(id, input) {
      const data = await ensure()
      const index = data.units.findIndex((u) => u.id === id)
      if (index < 0) throw new PropertyError('not_found')
      const errors = validateUnit(input, data.units, data.leases, id)
      if (Object.keys(errors).length > 0) invalid(errors)
      data.units[index] = toUnit(id, input)
      persist(data)
      return clone(data.units[index])
    },

    async deleteUnit(id) {
      const data = await ensure()
      if (!data.units.some((u) => u.id === id)) throw new PropertyError('not_found')
      if (unitHasLeases(id, data.leases)) throw new PropertyError('unit_has_leases')
      data.units = data.units.filter((u) => u.id !== id)
      persist(data)
    },

    async createLease(input) {
      const data = await ensure()
      const errors = validateLease(input, { units: data.units, leases: data.leases })
      if (Object.keys(errors).length > 0) invalid(errors)
      const lease = toLease(newId(), input)
      data.leases.push(lease)
      persist(data)
      return clone(lease)
    },

    async updateLease(id, input) {
      const data = await ensure()
      const index = data.leases.findIndex((l) => l.id === id)
      if (index < 0) throw new PropertyError('not_found')
      if (!isLeaseEditable(data.leases[index], today())) throw new PropertyError('lease_locked')
      const errors = validateLease(input, { units: data.units, leases: data.leases, selfId: id })
      if (Object.keys(errors).length > 0) invalid(errors)
      data.leases[index] = toLease(id, input)
      persist(data)
      return clone(data.leases[index])
    },

    async cancelLease(id, reason) {
      const data = await ensure()
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
      const data = await ensure()
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

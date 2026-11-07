import { addDays, isValidDate } from './dates'
import {
  CHECK_ITEMS,
  CONDITIONS,
  OWNERSHIPS,
  UNIT_TYPES,
  type Inspection,
  type InspectionInput,
  type Lease,
  type LeaseInput,
  type PropertyData,
  type Unit,
  type UnitInput,
} from './types'

/** field name → i18n key of the error; `{}` means valid */
export type FieldErrors = Record<string, string>

export type UnitStatus = 'closed' | 'rented' | 'ownerOccupied' | 'vacant'
export type LeaseStatus = 'cancelled' | 'ended' | 'upcoming' | 'active'

export const EXPIRING_DAYS = 60

const CODE = /^[A-Z]-\d{3,4}$/
const PHONE = /^0\d{9}$/

export const normalizeCode = (code: string) => code.trim().toUpperCase()

export function leaseStatus(lease: Lease, today: string): LeaseStatus {
  if (lease.cancelledAt) return 'cancelled'
  if (lease.endDate < today) return 'ended'
  if (lease.startDate > today) return 'upcoming'
  return 'active'
}

export function isExpiringSoon(lease: Lease, today: string): boolean {
  return leaseStatus(lease, today) === 'active' && lease.endDate <= addDays(today, EXPIRING_DAYS)
}

export function isLeaseEditable(lease: Lease, today: string): boolean {
  const status = leaseStatus(lease, today)
  return status === 'active' || status === 'upcoming'
}

export function unitStatus(unit: Unit, leases: Lease[], today: string): UnitStatus {
  if (unit.closed) return 'closed'
  if (leases.some((l) => l.unitId === unit.id && leaseStatus(l, today) === 'active')) return 'rented'
  return unit.ownership === 'ownerOccupied' ? 'ownerOccupied' : 'vacant'
}

export const unitHasLeases = (unitId: string, leases: Lease[]) => leases.some((l) => l.unitId === unitId)

export const damagedCount = (inspection: Inspection) =>
  inspection.items.filter((item) => item.condition !== 'ok').length

const isWholeNumber = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n)

export function validateUnit(input: UnitInput, units: Unit[], leases: Lease[], selfId?: string): FieldErrors {
  const errors: FieldErrors = {}
  const code = normalizeCode(input.code)
  if (!CODE.test(code)) errors.code = 'property.errors.code'
  else if (units.some((u) => u.id !== selfId && normalizeCode(u.code) === code)) errors.code = 'property.errors.codeTaken'

  if (!UNIT_TYPES.includes(input.type)) errors.type = 'property.errors.type'
  if (!OWNERSHIPS.includes(input.ownership)) errors.ownership = 'property.errors.ownership'
  if (!isWholeNumber(input.floor) || input.floor < 1 || input.floor > 99) errors.floor = 'property.errors.floor'
  if (typeof input.areaSqm !== 'number' || !Number.isFinite(input.areaSqm) || input.areaSqm <= 0 || input.areaSqm > 999) {
    errors.areaSqm = 'property.errors.area'
  }
  if (input.ownerName.trim() === '') errors.ownerName = 'property.errors.owner'
  if (!isWholeNumber(input.listRent) || input.listRent < 0) errors.listRent = 'property.errors.rent'

  const current = selfId ? units.find((u) => u.id === selfId) : undefined
  if (current && unitHasLeases(current.id, leases)) {
    if (!errors.code && code !== normalizeCode(current.code)) errors.code = 'property.errors.codeLocked'
    if (!errors.ownership && input.ownership !== current.ownership) errors.ownership = 'property.errors.codeLocked'
  }
  return errors
}

/**
 * `inspections` and `today` matter when editing (`selfId`): a lease that already has inspections must keep
 * covering the move-in and stay on its unit, and an edit must not push the end date into the past
 * (that would make the lease "ended", and an ended lease can no longer be edited or cancelled).
 */
export function validateLease(
  input: LeaseInput,
  ctx: { units: Unit[]; leases: Lease[]; selfId?: string; inspections?: Inspection[]; today?: string },
): FieldErrors {
  const errors: FieldErrors = {}
  const unit = ctx.units.find((u) => u.id === input.unitId)
  if (!unit) errors.unitId = 'property.errors.unitRequired'
  else if (unit.closed || unit.ownership !== 'forRent') errors.unitId = 'property.errors.unitNotRentable'

  if (input.tenantName.trim() === '') errors.tenantName = 'property.errors.tenantName'
  if (!PHONE.test(input.tenantPhone.trim())) errors.tenantPhone = 'property.errors.tenantPhone'
  if (!isWholeNumber(input.monthlyRent) || input.monthlyRent <= 0) errors.monthlyRent = 'property.errors.rent'
  if (!isWholeNumber(input.deposit) || input.deposit < 0) errors.deposit = 'property.errors.deposit'

  const startOk = isValidDate(input.startDate)
  const endOk = isValidDate(input.endDate)
  if (!startOk) errors.startDate = 'property.errors.dates'
  if (!endOk || (startOk && input.endDate <= input.startDate)) errors.endDate = 'property.errors.dates'

  if (startOk && endOk && input.startDate < input.endDate && unit) {
    // inclusive on both ends: a lease ending on the day another starts is an overlap
    const clash = ctx.leases.some(
      (l) =>
        l.unitId === input.unitId &&
        l.id !== ctx.selfId &&
        !l.cancelledAt &&
        input.startDate <= l.endDate &&
        l.startDate <= input.endDate,
    )
    if (clash) errors.startDate = 'property.errors.leaseOverlap'
  }

  if (ctx.selfId) {
    const current = ctx.leases.find((l) => l.id === ctx.selfId)
    const own = (ctx.inspections ?? []).filter((i) => i.leaseId === ctx.selfId)
    if (current && own.length > 0 && input.unitId !== current.unitId) errors.unitId ??= 'property.errors.unitLocked'
    const moveIn = own.find((i) => i.type === 'moveIn')
    if (moveIn && startOk && input.startDate > moveIn.date) errors.startDate ??= 'property.errors.leaseInspectionDates'
    if (moveIn && endOk && input.endDate < moveIn.date) errors.endDate ??= 'property.errors.leaseInspectionDates'
    if (ctx.today && endOk && input.endDate < ctx.today) errors.endDate ??= 'property.errors.leaseEndInPast'
  }
  return errors
}

export function validateInspection(
  input: InspectionInput,
  ctx: { leases: Lease[]; inspections: Inspection[]; selfId?: string },
): FieldErrors {
  const errors: FieldErrors = {}
  const lease = ctx.leases.find((l) => l.id === input.leaseId)
  if (!lease) errors.leaseId = 'property.errors.leaseRequired'

  const others = ctx.inspections.filter((i) => i.leaseId === input.leaseId && i.id !== ctx.selfId)
  if (input.type !== 'moveIn' && input.type !== 'moveOut') errors.type = 'property.errors.inspectionType'
  else if (others.some((i) => i.type === input.type)) errors.type = 'property.errors.inspectionExists'

  if (!isValidDate(input.date)) errors.date = 'property.errors.inspectionDate'
  else {
    const moveIn = others.find((i) => i.type === 'moveIn')
    const moveOut = others.find((i) => i.type === 'moveOut')
    if (input.type === 'moveIn') {
      if (lease && input.date < lease.startDate) errors.date = 'property.errors.inspectionDate'
      if (moveOut && input.date > moveOut.date) errors.date = 'property.errors.inspectionDate'
    } else if (moveIn && input.date < moveIn.date) {
      errors.date = 'property.errors.inspectionDate'
    }
  }

  if (input.inspector.trim() === '') errors.inspector = 'property.errors.inspector'

  for (const key of CHECK_ITEMS) {
    const item = input.items.find((i) => i.key === key)
    if (!item || !CONDITIONS.includes(item.condition)) errors[`item:${key}`] = 'property.errors.itemNote'
    else if (item.condition !== 'ok' && item.note.trim() === '') errors[`item:${key}`] = 'property.errors.itemNote'
  }

  const badMeter = (v: number | undefined) => v !== undefined && (typeof v !== 'number' || !Number.isFinite(v) || v < 0)
  if (badMeter(input.waterMeter)) errors.waterMeter = 'property.errors.meter'
  if (badMeter(input.electricMeter)) errors.electricMeter = 'property.errors.meter'
  return errors
}

export function summarize(data: PropertyData, today: string) {
  const awaiting = data.leases.filter((l) => {
    const status = leaseStatus(l, today)
    if (status !== 'active' && status !== 'upcoming') return false
    return !data.inspections.some((i) => i.leaseId === l.id && i.type === 'moveIn')
  })
  return {
    totalUnits: data.units.length,
    vacantUnits: data.units.filter((u) => unitStatus(u, data.leases, today) === 'vacant').length,
    expiringLeases: data.leases.filter((l) => isExpiringSoon(l, today)).length,
    awaitingMoveIn: awaiting.length,
  }
}

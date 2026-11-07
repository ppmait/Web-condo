export type UnitType = 'studio' | 'oneBed' | 'twoBed' | 'threeBed'
export const UNIT_TYPES: UnitType[] = ['studio', 'oneBed', 'twoBed', 'threeBed']

export type Ownership = 'ownerOccupied' | 'forRent'
export const OWNERSHIPS: Ownership[] = ['ownerOccupied', 'forRent']

export interface Unit {
  id: string
  code: string
  tower: string
  floor: number
  areaSqm: number
  type: UnitType
  ownerName: string
  ownership: Ownership
  listRent: number
  closed: boolean
}
export type UnitInput = Omit<Unit, 'id' | 'tower'>

export interface Lease {
  id: string
  unitId: string
  tenantName: string
  tenantPhone: string
  startDate: string
  endDate: string
  monthlyRent: number
  deposit: number
  cancelledAt?: string
  cancelReason?: string
}
export type LeaseInput = Omit<Lease, 'id' | 'cancelledAt' | 'cancelReason'>

export type Condition = 'ok' | 'damaged' | 'missing'
export const CONDITIONS: Condition[] = ['ok', 'damaged', 'missing']

export const CHECK_ITEMS = [
  'livingRoom',
  'bedroom',
  'bathroom',
  'kitchen',
  'balcony',
  'airConditioner',
  'appliances',
  'keyCards',
] as const
export type CheckItemKey = (typeof CHECK_ITEMS)[number]

export interface InspectionItem {
  key: CheckItemKey
  condition: Condition
  note: string
}

export type InspectionType = 'moveIn' | 'moveOut'

export interface Inspection {
  id: string
  leaseId: string
  type: InspectionType
  date: string
  inspector: string
  items: InspectionItem[]
  waterMeter?: number
  electricMeter?: number
  note: string
}
export type InspectionInput = Omit<Inspection, 'id'>

export interface PropertyData {
  version: 1
  units: Unit[]
  leases: Lease[]
  inspections: Inspection[]
}

export type PropertyErrorCode = 'invalid_input' | 'unit_has_leases' | 'lease_locked' | 'not_found'

export class PropertyError extends Error {
  readonly code: PropertyErrorCode
  /** field name → i18n key; only set for `invalid_input` */
  readonly fieldErrors?: Record<string, string>

  constructor(code: PropertyErrorCode, fieldErrors?: Record<string, string>) {
    super(code)
    this.name = 'PropertyError'
    this.code = code
    this.fieldErrors = fieldErrors
  }
}

/** Boundary to the (future) backend. The mock lives in localPropertyApi.ts. */
export interface PropertyApi {
  load(): Promise<PropertyData>
  createUnit(input: UnitInput): Promise<Unit>
  updateUnit(id: string, input: UnitInput): Promise<Unit>
  deleteUnit(id: string): Promise<void>
  createLease(input: LeaseInput): Promise<Lease>
  updateLease(id: string, input: LeaseInput): Promise<Lease>
  cancelLease(id: string, reason: string): Promise<Lease>
  saveInspection(input: InspectionInput, id?: string): Promise<Inspection>
}

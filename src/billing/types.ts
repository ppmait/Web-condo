/** A billing month, YYYY-MM */
export type Period = string

export interface Rates {
  /** baht per water unit */
  water: number
  /** baht per electricity unit */
  electric: number
  /** baht per square metre per month */
  common: number
}

export interface MeterReading {
  id: string
  unitId: string
  period: Period
  waterPrev: number
  waterCurr: number
  electricPrev: number
  electricCurr: number
}
export type MeterReadingInput = Omit<MeterReading, 'id'>

export interface UsageLine {
  units: number
  rate: number
  amount: number
}

export interface CommonLine {
  areaSqm: number
  rate: number
  amount: number
}

export type SlipStatus = 'pending' | 'approved' | 'rejected'

/** A payment slip a tenant sent. Only the file's name, size and type are kept, never its content. */
export interface Slip {
  id: string
  submittedAt: string
  fileName: string
  fileSize: number
  status: SlipStatus
  reviewedAt?: string
  rejectReason?: string
}

export interface Receipt {
  number: string
  issuedAt: string
  amount: number
}

export interface Invoice {
  id: string
  number: string
  period: Period
  unitId: string
  /** snapshot, so the tenant side does not need the property data */
  unitCode: string
  leaseId: string
  tenantName: string
  tenantPhone: string
  water: UsageLine
  electric: UsageLine
  common: CommonLine
  total: number
  issuedAt: string
  dueDate: string
  slips: Slip[]
  receipt?: Receipt
}

export interface SlipFile {
  name: string
  size: number
  type: string
}

export type NotificationType = 'invoiceIssued' | 'slipRejected' | 'receiptIssued'

export interface AppNotification {
  id: string
  type: NotificationType
  invoiceId: string
  recipientPhone: string
  createdAt: string
  read: boolean
  /** for slipRejected: the reason given at the time */
  reason?: string
}

export interface BillingData {
  version: 1
  rates: Rates
  readings: MeterReading[]
  invoices: Invoice[]
  notifications: AppNotification[]
}

export interface IssueResult {
  issued: Invoice[]
  skipped: { unitId: string; reason: 'noReading' | 'exists' }[]
}

export type BillingErrorCode =
  | 'invalid_input'
  | 'invoice_exists'
  | 'not_found'
  | 'slip_pending'
  | 'already_paid'
  | 'already_reviewed'
  | 'receipt_exists'
  | 'not_payable'

export class BillingError extends Error {
  readonly code: BillingErrorCode
  /** field name → i18n key; only set for `invalid_input` */
  readonly fieldErrors?: Record<string, string>

  constructor(code: BillingErrorCode, fieldErrors?: Record<string, string>) {
    super(code)
    this.name = 'BillingError'
    this.code = code
    this.fieldErrors = fieldErrors
  }
}

/** Boundary to the (future) backend. The mock lives in localBillingApi.ts. */
export interface BillingApi {
  load(): Promise<BillingData>
  saveRates(rates: Rates): Promise<Rates>
  /** upsert by (unitId, period) */
  saveReading(input: MeterReadingInput): Promise<MeterReading>
  issueInvoices(period: Period): Promise<IssueResult>
  submitSlip(invoiceId: string, file: SlipFile): Promise<Invoice>
  approveSlip(invoiceId: string, slipId: string): Promise<Invoice>
  rejectSlip(invoiceId: string, slipId: string, reason: string): Promise<Invoice>
  issueReceipt(invoiceId: string): Promise<Invoice>
  markRead(notificationId: string): Promise<void>
  markAllRead(phone: string): Promise<void>
}

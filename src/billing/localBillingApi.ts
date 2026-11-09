import { isValidDate, todayISO } from '../property/dates'
import { localPropertyApi } from '../property/localPropertyApi'
import type { PropertyApi, PropertyData } from '../property/types'
import { dueDateOf, isValidPeriod } from './periods'
import {
  billable,
  buildInvoice,
  invoiceNumber,
  invoiceStatus,
  receiptNumber,
  roundBaht,
  validateRates,
  validateReading,
  validateSlipFile,
  type FieldErrors,
} from './rules'
import { makeBillingSeed } from './seed'
import {
  BillingError,
  type AppNotification,
  type BillingApi,
  type BillingData,
  type Invoice,
  type MeterReading,
  type NotificationType,
  type Rates,
} from './types'

export const BILLING_KEY = 'condo:billing'

interface Options {
  /** Defaults to the browser localStorage. `null` keeps everything in memory. */
  storage?: Storage | null
  today?: () => string
  /** the property data the invoices refer to (rooms, leases) */
  property?: PropertyApi
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isString = (v: unknown): v is string => typeof v === 'string'
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isWhole = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const isDate = (v: unknown): v is string => isString(v) && isValidDate(v)

const isRates = (v: unknown): v is Rates => isRecord(v) && isWhole(v.water) && isWhole(v.electric) && isWhole(v.common)

function isReading(v: unknown): v is MeterReading {
  return (
    isRecord(v) &&
    isString(v.id) &&
    isString(v.unitId) &&
    isString(v.period) &&
    isValidPeriod(v.period) &&
    isWhole(v.waterPrev) && v.waterPrev >= 0 &&
    isWhole(v.waterCurr) && v.waterCurr >= v.waterPrev &&
    isWhole(v.electricPrev) && v.electricPrev >= 0 &&
    isWhole(v.electricCurr) && v.electricCurr >= v.electricPrev
  )
}

const isUsage = (v: unknown) => isRecord(v) && isWhole(v.units) && v.units >= 0 && isWhole(v.rate) && v.rate > 0 && isWhole(v.amount) && v.amount >= 0

function isSlip(v: unknown): boolean {
  return (
    isRecord(v) &&
    isString(v.id) &&
    isDate(v.submittedAt) &&
    isString(v.fileName) && v.fileName !== '' &&
    isNumber(v.fileSize) && v.fileSize > 0 &&
    (v.status === 'pending' || v.status === 'approved' || v.status === 'rejected') &&
    (v.reviewedAt === undefined || isDate(v.reviewedAt)) &&
    (v.rejectReason === undefined || isString(v.rejectReason))
  )
}

function isInvoice(v: unknown): v is Invoice {
  if (!isRecord(v) || !Array.isArray(v.slips)) return false
  const common = v.common
  return (
    isString(v.id) &&
    isString(v.number) &&
    isString(v.period) && isValidPeriod(v.period) &&
    isString(v.unitId) &&
    isString(v.unitCode) &&
    isString(v.leaseId) &&
    isString(v.tenantName) &&
    isString(v.tenantPhone) &&
    isUsage(v.water) &&
    isUsage(v.electric) &&
    isRecord(common) && isNumber(common.areaSqm) && isWhole(common.rate) && common.rate > 0 && isWhole(common.amount) &&
    isWhole(v.total) &&
    isDate(v.issuedAt) &&
    isDate(v.dueDate) &&
    v.slips.every(isSlip) &&
    (v.receipt === undefined ||
      (isRecord(v.receipt) && isString(v.receipt.number) && isDate(v.receipt.issuedAt) && isWhole(v.receipt.amount)))
  )
}

const NOTIFICATION_TYPES: NotificationType[] = ['invoiceIssued', 'slipRejected', 'receiptIssued']

function isNotification(v: unknown): v is AppNotification {
  return (
    isRecord(v) &&
    isString(v.id) &&
    NOTIFICATION_TYPES.includes(v.type as NotificationType) &&
    isString(v.invoiceId) &&
    isString(v.recipientPhone) &&
    isDate(v.createdAt) &&
    typeof v.read === 'boolean'
  )
}

/**
 * Shape, ids, references to the property data and the arithmetic of every invoice must all hold, otherwise the data
 * is not trusted (and is replaced by the sample data). Things that may legitimately change in the property data
 * later (a unit's area, a lease's tenant) are deliberately not compared: invoices keep their own snapshot.
 */
function isBillingData(v: unknown, property: PropertyData): v is BillingData {
  if (!isRecord(v) || v.version !== 1) return false
  const { rates, readings, invoices, notifications } = v
  if (!isRates(rates) || Object.keys(validateRates(rates)).length > 0) return false
  if (!Array.isArray(readings) || !Array.isArray(invoices) || !Array.isArray(notifications)) return false
  if (!readings.every(isReading) || !invoices.every(isInvoice) || !notifications.every(isNotification)) return false
  const rs = readings as MeterReading[]
  const invs = invoices as Invoice[]
  const notes = notifications as AppNotification[]

  const ids = [...rs, ...invs, ...notes, ...invs.flatMap((i) => i.slips)].map((x) => x.id)
  if (new Set(ids).size !== ids.length) return false

  const units = new Map(property.units.map((u) => [u.id, u]))
  const leases = new Map(property.leases.map((l) => [l.id, l]))

  if (new Set(rs.map((r) => `${r.unitId}|${r.period}`)).size !== rs.length) return false
  if (!rs.every((r) => units.has(r.unitId))) return false
  const byUnit = new Map<string, MeterReading[]>()
  for (const r of rs) byUnit.set(r.unitId, [...(byUnit.get(r.unitId) ?? []), r])
  for (const list of byUnit.values()) {
    list.sort((a, b) => a.period.localeCompare(b.period))
    for (let i = 1; i < list.length; i++) {
      if (list[i].waterPrev !== list[i - 1].waterCurr || list[i].electricPrev !== list[i - 1].electricCurr) return false
    }
  }

  if (new Set(invs.map((i) => i.number)).size !== invs.length) return false
  if (new Set(invs.map((i) => `${i.unitId}|${i.period}`)).size !== invs.length) return false
  for (const i of invs) {
    const unit = units.get(i.unitId)
    const lease = leases.get(i.leaseId)
    const reading = rs.find((r) => r.unitId === i.unitId && r.period === i.period)
    if (!unit || !lease || lease.unitId !== i.unitId || !reading) return false
    if (i.unitCode !== unit.code || i.number !== invoiceNumber(i.period, unit.code) || i.dueDate !== dueDateOf(i.period)) return false
    if (i.water.units !== reading.waterCurr - reading.waterPrev || i.water.amount !== roundBaht(i.water.units * i.water.rate)) return false
    if (i.electric.units !== reading.electricCurr - reading.electricPrev || i.electric.amount !== roundBaht(i.electric.units * i.electric.rate)) return false
    if (i.common.amount !== roundBaht(i.common.areaSqm * i.common.rate)) return false
    if (i.total !== i.water.amount + i.electric.amount + i.common.amount) return false
    const pending = i.slips.filter((s) => s.status === 'pending').length
    const approved = i.slips.filter((s) => s.status === 'approved').length
    if (pending > 1 || approved > 1 || (approved === 1 && pending > 0)) return false
    if (i.receipt && (approved !== 1 || i.receipt.number !== receiptNumber(i.period, unit.code) || i.receipt.amount !== i.total)) return false
  }

  const byId = new Map(invs.map((i) => [i.id, i]))
  return notes.every((n) => byId.get(n.invoiceId)?.tenantPhone === n.recipientPhone)
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
    : `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

function invalid(errors: FieldErrors): never {
  throw new BillingError('invalid_input', errors)
}

export function createLocalBillingApi(opts: Options = {}): BillingApi {
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage
  const today = opts.today ?? todayISO
  const property = opts.property ?? localPropertyApi

  // Storage is the source of truth and is re-read on every call, because another browser tab may have changed it.
  // Memory is only a fallback for when storage cannot be read or written.
  let memory: BillingData | null = null
  let persistFailed = false

  const read = (): { readable: boolean; text: string | null } => {
    if (!storage) return { readable: false, text: null }
    try {
      return { readable: true, text: storage.getItem(BILLING_KEY) }
    } catch {
      return { readable: false, text: null }
    }
  }
  const persist = (data: BillingData) => {
    memory = data
    try {
      storage?.setItem(BILLING_KEY, JSON.stringify(data))
      persistFailed = false
    } catch {
      persistFailed = true
    }
  }
  const seed = (prop: PropertyData): BillingData => {
    const seeded = makeBillingSeed(prop, today()) // may throw: nothing is cached, the next call simply tries again
    persist(seeded)
    return seeded
  }

  /** The freshest data. Call it synchronously right before changing anything, after the property data was loaded. */
  const fresh = (prop: PropertyData): BillingData => {
    const { readable, text } = read()
    if (readable && !(persistFailed && memory)) {
      try {
        const parsed: unknown = JSON.parse(text ?? 'null')
        if (isBillingData(parsed, prop)) {
          memory = parsed
          return parsed
        }
      } catch {
        // not JSON: untrusted
      }
      return seed(prop)
    }
    return memory && isBillingData(memory, prop) ? memory : seed(prop)
  }

  const findInvoice = (data: BillingData, id: string): Invoice => {
    const invoice = data.invoices.find((i) => i.id === id)
    if (!invoice) throw new BillingError('not_found')
    return invoice
  }

  const notify = (data: BillingData, type: NotificationType, invoice: Invoice) =>
    data.notifications.push({ id: newId(), type, invoiceId: invoice.id, recipientPhone: invoice.tenantPhone, createdAt: today(), read: false })

  return {
    async load() {
      return clone(fresh(await property.load()))
    },

    async saveRates(rates) {
      const prop = await property.load()
      const data = fresh(prop)
      const errors = validateRates(rates)
      if (Object.keys(errors).length > 0) invalid(errors)
      data.rates = { water: rates.water, electric: rates.electric, common: rates.common }
      persist(data)
      return clone(data.rates)
    },

    async saveReading(input) {
      const prop = await property.load()
      const data = fresh(prop)
      const existing = data.readings.find((r) => r.unitId === input.unitId && r.period === input.period)
      const errors = validateReading(input, { readings: data.readings, invoices: data.invoices, selfId: existing?.id })
      if (isValidPeriod(input.period) && !billable(prop, input.period).some((b) => b.unit.id === input.unitId)) {
        errors.unitId ??= 'billing.errors.notBillable'
      }
      if (Object.keys(errors).length > 0) invalid(errors)
      const saved: MeterReading = { ...input, id: existing?.id ?? newId() }
      if (existing) data.readings[data.readings.indexOf(existing)] = saved
      else data.readings.push(saved)
      persist(data)
      return clone(saved)
    },

    async issueInvoices(period) {
      const prop = await property.load()
      const data = fresh(prop)
      if (!isValidPeriod(period)) invalid({ period: 'billing.errors.reading' })
      const issued: Invoice[] = []
      const skipped: { unitId: string; reason: 'noReading' | 'exists' }[] = []
      for (const { unit, lease } of billable(prop, period)) {
        if (data.invoices.some((i) => i.unitId === unit.id && i.period === period)) {
          skipped.push({ unitId: unit.id, reason: 'exists' })
          continue
        }
        const reading = data.readings.find((r) => r.unitId === unit.id && r.period === period)
        if (!reading) {
          skipped.push({ unitId: unit.id, reason: 'noReading' })
          continue
        }
        const invoice = buildInvoice({ id: newId(), unit, lease, reading, rates: data.rates, period, today: today() })
        data.invoices.push(invoice)
        notify(data, 'invoiceIssued', invoice)
        issued.push(invoice)
      }
      if (issued.length > 0) persist(data)
      return clone({ issued, skipped })
    },

    async submitSlip(invoiceId, file) {
      const prop = await property.load()
      const data = fresh(prop)
      const invoice = findInvoice(data, invoiceId)
      if (invoice.slips.some((s) => s.status === 'approved')) throw new BillingError('already_paid')
      if (invoice.slips.some((s) => s.status === 'pending')) throw new BillingError('slip_pending')
      const problem = validateSlipFile(file)
      if (problem) invalid({ file: problem })
      invoice.slips.push({ id: newId(), submittedAt: today(), fileName: file.name, fileSize: file.size, status: 'pending' })
      persist(data)
      return clone(invoice)
    },

    async approveSlip(invoiceId, slipId) {
      const prop = await property.load()
      const data = fresh(prop)
      const invoice = findInvoice(data, invoiceId)
      const slip = invoice.slips.find((s) => s.id === slipId)
      if (!slip) throw new BillingError('not_found')
      if (slip.status !== 'pending') throw new BillingError('already_reviewed')
      slip.status = 'approved'
      slip.reviewedAt = today()
      persist(data)
      return clone(invoice)
    },

    async rejectSlip(invoiceId, slipId, reason) {
      const prop = await property.load()
      const data = fresh(prop)
      const invoice = findInvoice(data, invoiceId)
      const slip = invoice.slips.find((s) => s.id === slipId)
      if (!slip) throw new BillingError('not_found')
      if (slip.status !== 'pending') throw new BillingError('already_reviewed')
      if (reason.trim() === '') invalid({ reason: 'billing.errors.rejectReason' })
      slip.status = 'rejected'
      slip.reviewedAt = today()
      slip.rejectReason = reason.trim()
      notify(data, 'slipRejected', invoice)
      persist(data)
      return clone(invoice)
    },

    async issueReceipt(invoiceId) {
      const prop = await property.load()
      const data = fresh(prop)
      const invoice = findInvoice(data, invoiceId)
      if (invoice.receipt) throw new BillingError('receipt_exists')
      if (invoiceStatus(invoice, today()) !== 'paid') throw new BillingError('not_payable')
      invoice.receipt = { number: receiptNumber(invoice.period, invoice.unitCode), issuedAt: today(), amount: invoice.total }
      notify(data, 'receiptIssued', invoice)
      persist(data)
      return clone(invoice)
    },

    async markRead(notificationId) {
      const prop = await property.load()
      const data = fresh(prop)
      const notification = data.notifications.find((n) => n.id === notificationId)
      if (!notification) throw new BillingError('not_found')
      if (!notification.read) {
        notification.read = true
        persist(data)
      }
    },

    async markAllRead(phone) {
      const prop = await property.load()
      const data = fresh(prop)
      let changed = false
      for (const n of data.notifications) {
        if (n.recipientPhone === phone && !n.read) {
          n.read = true
          changed = true
        }
      }
      if (changed) persist(data)
    },
  }
}

export const localBillingApi: BillingApi = createLocalBillingApi()

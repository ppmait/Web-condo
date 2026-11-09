import { isValidDate, todayISO } from '../property/dates'
import { localPropertyApi } from '../property/localPropertyApi'
import type { PropertyApi, PropertyData } from '../property/types'
import { CATEGORIES, MAX_PHOTOS, canAssign, nextCode, nextStatus, validateNote, validateRequest, type FieldErrors } from './rules'
import { makeMaintenanceSeed } from './seed'
import {
  MaintenanceError,
  type Actor,
  type MaintenanceApi,
  type MaintenanceData,
  type MaintenanceNotification,
  type MaintenanceRequest,
  type NotificationType,
  type Recipient,
  type RequestStatus,
  type Technician,
} from './types'

export const MAINTENANCE_KEY = 'condo:maintenance'

interface Options {
  /** Defaults to the browser localStorage. `null` keeps everything in memory. */
  storage?: Storage | null
  today?: () => string
  /** the property data the requests refer to (units, leases) */
  property?: PropertyApi
}

const STATUSES: RequestStatus[] = ['waiting', 'assigned', 'inProgress', 'done']
const NOTIFICATION_TYPES: NotificationType[] = ['requestCreated', 'assigned', 'statusChanged']

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isString = (v: unknown): v is string => typeof v === 'string'
const isDate = (v: unknown): v is string => isString(v) && isValidDate(v)
const isStatus = (v: unknown): v is RequestStatus => STATUSES.includes(v as RequestStatus)

const isTechnician = (v: unknown): v is Technician => isRecord(v) && isString(v.id) && isString(v.name) && isString(v.phone)

function isRequest(v: unknown): v is MaintenanceRequest {
  if (!isRecord(v)) return false
  if (!isString(v.id) || !isString(v.code) || !/^MR-\d+$/.test(v.code)) return false
  if (!isString(v.unitId) || !isString(v.unitCode) || !isString(v.leaseId) || !isString(v.tenantName) || !isString(v.tenantPhone)) return false
  if (!CATEGORIES.includes(v.category as never)) return false
  if (!isString(v.title) || v.title.trim() === '' || !isString(v.description) || v.description.trim() === '') return false
  if (!Array.isArray(v.photos) || v.photos.length < 1 || v.photos.length > MAX_PHOTOS) return false
  if (!v.photos.every((p) => isRecord(p) && isString(p.name) && isString(p.dataUrl) && p.dataUrl.startsWith('data:image/'))) return false
  if (!isDate(v.createdAt) || !isStatus(v.status)) return false
  if (v.assigneeId !== undefined && !isString(v.assigneeId)) return false
  if (!Array.isArray(v.history) || v.history.length === 0) return false
  return v.history.every((h) => isRecord(h) && isStatus(h.status) && isDate(h.at) && isString(h.note) && isString(h.byName))
}

function isNotification(v: unknown): v is MaintenanceNotification {
  return (
    isRecord(v) &&
    isString(v.id) &&
    NOTIFICATION_TYPES.includes(v.type as NotificationType) &&
    isString(v.requestId) &&
    isString(v.recipient) &&
    isDate(v.createdAt) &&
    typeof v.read === 'boolean' &&
    (v.status === undefined || isStatus(v.status))
  )
}

/**
 * Stored data is trusted only if it has the right shape and agrees with itself. It is also replaced when it belongs
 * to another property (none of the units it refers to exist). Partly dangling references are kept: an ordinary edit
 * (a lease moved to another unit, a unit deleted) must never wipe the requests, which carry their own snapshot.
 */
export function isMaintenanceData(v: unknown, property: PropertyData): v is MaintenanceData {
  if (!isRecord(v) || v.version !== 1) return false
  const { technicians, requests, notifications } = v
  if (!Array.isArray(technicians) || !Array.isArray(requests) || !Array.isArray(notifications)) return false
  if (!technicians.every(isTechnician) || !requests.every(isRequest) || !notifications.every(isNotification)) return false
  const techs = technicians as Technician[]
  const reqs = requests as MaintenanceRequest[]
  const notes = notifications as MaintenanceNotification[]

  const ids = [...techs, ...reqs, ...notes].map((x) => x.id)
  if (new Set(ids).size !== ids.length) return false
  if (new Set(reqs.map((r) => r.code)).size !== reqs.length) return false

  for (const r of reqs) {
    const history = r.history
    if (history[0].status !== 'waiting' || history.at(-1)?.status !== r.status) return false
    for (let i = 1; i < history.length; i++) {
      const [before, now] = [history[i - 1], history[i]]
      const follows = now.status === nextStatus(before.status) || (now.status === 'assigned' && before.status === 'assigned') // reassigning
      if (!follows || now.at < before.at) return false
    }
    if (r.status === 'waiting' ? r.assigneeId !== undefined : !techs.some((t) => t.id === r.assigneeId)) return false
  }

  const reqIds = new Set(reqs.map((r) => r.id))
  if (!notes.every((n) => reqIds.has(n.requestId))) return false

  const units = new Set(property.units.map((u) => u.id))
  const referenced = reqs.map((r) => r.unitId)
  return !(referenced.length > 0 && !referenced.some((id) => units.has(id)))
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
    : `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

function invalid(errors: FieldErrors): never {
  throw new MaintenanceError('invalid_input', errors)
}

export function createLocalMaintenanceApi(opts: Options = {}): MaintenanceApi {
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage
  const today = opts.today ?? todayISO
  const property = opts.property ?? localPropertyApi

  // Storage is the source of truth and is re-read on every call, because another browser tab may have changed it.
  // Memory is only a fallback for when storage cannot be read or written.
  let memory: MaintenanceData | null = null
  let persistFailed = false

  const read = (): { readable: boolean; text: string | null } => {
    if (!storage) return { readable: false, text: null }
    try {
      return { readable: true, text: storage.getItem(MAINTENANCE_KEY) }
    } catch {
      return { readable: false, text: null }
    }
  }
  /** Keeps working in memory when storage cannot be written. */
  const persist = (data: MaintenanceData) => {
    memory = data
    try {
      storage?.setItem(MAINTENANCE_KEY, JSON.stringify(data))
      persistFailed = false
    } catch {
      persistFailed = true
    }
  }
  /**
 * Writes for real or not at all: false when the storage refuses (e.g. it is full). Memory only changes on success.
 * Used for everything a person must be able to rely on (requests, assignments, status changes); reading notices is
 * low-stakes and keeps the memory fallback. With no storage object at all there is nothing to refuse: memory is all there is.
 */
  const persistStrict = (data: MaintenanceData): boolean => {
    try {
      storage?.setItem(MAINTENANCE_KEY, JSON.stringify(data))
    } catch {
      return false
    }
    memory = data
    persistFailed = false
    return true
  }
  const seed = (prop: PropertyData): MaintenanceData => {
    const seeded = makeMaintenanceSeed(prop, today()) // may throw: nothing is cached, the next call simply tries again
    persist(seeded)
    return seeded
  }

  /** The freshest data. Call it synchronously right before changing anything, after the property data was loaded. */
  const fresh = (prop: PropertyData): MaintenanceData => {
    const { readable, text } = read()
    if (readable && !(persistFailed && memory)) {
      try {
        const parsed: unknown = JSON.parse(text ?? 'null')
        if (isMaintenanceData(parsed, prop)) {
          memory = parsed
          return parsed
        }
      } catch {
        // not JSON: untrusted
      }
      return seed(prop)
    }
    return memory && isMaintenanceData(memory, prop) ? memory : seed(prop)
  }

  const findRequest = (data: MaintenanceData, id: string): MaintenanceRequest => {
    const request = data.requests.find((r) => r.id === id)
    if (!request) throw new MaintenanceError('not_found')
    return request
  }

  const notify = (data: MaintenanceData, type: NotificationType, requestId: string, recipient: Recipient, status?: RequestStatus) =>
    data.notifications.push({ id: newId(), type, requestId, recipient, createdAt: today(), read: false, ...(status ? { status } : {}) })

  return {
    async load() {
      return clone(fresh(await property.load()))
    },

    async createRequest(input) {
      const prop = await property.load()
      const errors = validateRequest(input)
      if (Object.keys(errors).length > 0) invalid(errors)
      const day = today()
      const phone = input.tenantPhone.trim()
      const lease = prop.leases
        .filter((l) => l.tenantPhone === phone && !l.cancelledAt && l.startDate <= day && day <= l.endDate)
        .reduce<(typeof prop.leases)[number] | undefined>((latest, l) => (!latest || l.startDate > latest.startDate ? l : latest), undefined)
      const unit = lease && prop.units.find((u) => u.id === lease.unitId)
      if (!lease || !unit) throw new MaintenanceError('no_lease')

      const next = clone(fresh(prop)) // a copy: if the write fails, nothing may stay changed
      const request: MaintenanceRequest = {
        id: newId(),
        code: nextCode(next.requests),
        unitId: unit.id,
        unitCode: unit.code,
        leaseId: lease.id,
        tenantName: lease.tenantName,
        tenantPhone: lease.tenantPhone,
        category: input.category,
        title: input.title.trim(),
        description: input.description.trim(),
        photos: input.photos.map((p) => ({ name: p.name, dataUrl: p.dataUrl })),
        createdAt: day,
        status: 'waiting',
        history: [{ status: 'waiting', at: day, note: '', byName: input.tenantName.trim() || lease.tenantName }],
      }
      next.requests.push(request)
      notify(next, 'requestCreated', request.id, 'role:juristic')
      if (!persistStrict(next)) throw new MaintenanceError('storage_failed')
      return clone(request)
    },

    async assign(requestId, technicianId, actorName) {
      const prop = await property.load()
      const data = clone(fresh(prop)) // a copy: if the write fails, nothing may stay changed
      const request = findRequest(data, requestId)
      const technician = data.technicians.find((t) => t.id === technicianId)
      if (!technician) throw new MaintenanceError('not_found')
      if (!canAssign(request)) throw new MaintenanceError('invalid_transition')
      if (request.status === 'assigned' && request.assigneeId === technician.id) return clone(request)
      const first = request.status === 'waiting'
      request.assigneeId = technician.id
      request.status = 'assigned'
      request.history.push({ status: 'assigned', at: today(), note: '', byName: actorName })
      notify(data, 'assigned', request.id, technician.phone)
      if (first) notify(data, 'statusChanged', request.id, request.tenantPhone, 'assigned') // changing the technician later does not tell the tenant again
      if (!persistStrict(data)) throw new MaintenanceError('storage_failed')
      return clone(request)
    },

    async updateStatus(requestId, status, note, actor: Actor) {
      const prop = await property.load()
      const data = clone(fresh(prop)) // a copy: if the write fails, nothing may stay changed
      const noteError = validateNote(note)
      if (noteError) invalid({ note: noteError })
      const request = findRequest(data, requestId)
      const technician = data.technicians.find((t) => t.phone === actor.phone)
      if (!technician || request.assigneeId !== technician.id) throw new MaintenanceError('not_assigned')
      if ((request.status !== 'assigned' && request.status !== 'inProgress') || status !== nextStatus(request.status)) {
        throw new MaintenanceError('invalid_transition')
      }
      request.status = status
      request.history.push({ status, at: today(), note: note.trim(), byName: actor.name })
      notify(data, 'statusChanged', request.id, request.tenantPhone, status)
      if (!persistStrict(data)) throw new MaintenanceError('storage_failed')
      return clone(request)
    },

    async markRead(notificationId) {
      const prop = await property.load()
      const data = fresh(prop)
      const n = data.notifications.find((x) => x.id === notificationId)
      if (!n || n.read) return
      n.read = true
      persist(data)
    },

    async markAllRead(recipient) {
      const prop = await property.load()
      const data = fresh(prop)
      let changed = false
      for (const n of data.notifications) {
        if (n.recipient === recipient && !n.read) {
          n.read = true
          changed = true
        }
      }
      if (changed) persist(data)
    },
  }
}

export const localMaintenanceApi = createLocalMaintenanceApi()

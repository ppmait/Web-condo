export type Category = 'electrical' | 'plumbing' | 'airConditioning' | 'furniture' | 'other'

export type RequestStatus = 'waiting' | 'assigned' | 'inProgress' | 'done'

/** A downsized photo kept inside the data (a JPEG data URL), never the original file. */
export interface Photo {
  name: string
  dataUrl: string
}

export interface HistoryEntry {
  status: RequestStatus
  /** YYYY-MM-DD */
  at: string
  note: string
  byName: string
}

export interface Technician {
  id: string
  name: string
  phone: string
}

export interface MaintenanceRequest {
  id: string
  /** MR-0001 … */
  code: string
  /** snapshots of the unit and the tenant when the request was made */
  unitId: string
  unitCode: string
  leaseId: string
  tenantName: string
  tenantPhone: string
  category: Category
  title: string
  description: string
  photos: Photo[]
  createdAt: string
  assigneeId?: string
  status: RequestStatus
  /** history[0] is always the creation (`waiting`) */
  history: HistoryEntry[]
}

/** What the tenant fills in. */
export interface RequestInput {
  category: Category
  title: string
  description: string
  photos: Photo[]
}

/** What the api needs to create a request: the form plus who is asking. */
export type CreateRequestInput = RequestInput & { tenantPhone: string; tenantName: string }

/** Who changes a status: the signed-in technician. */
export interface Actor {
  phone: string
  name: string
}

export type NotificationType = 'requestCreated' | 'assigned' | 'statusChanged'

/** A phone number, or `role:juristic` for the juristic office. */
export type Recipient = string

export interface MaintenanceNotification {
  id: string
  type: NotificationType
  requestId: string
  recipient: Recipient
  /** YYYY-MM-DD */
  createdAt: string
  read: boolean
  /** for statusChanged: the status it changed to */
  status?: RequestStatus
}

export interface MaintenanceData {
  version: 1
  technicians: Technician[]
  requests: MaintenanceRequest[]
  notifications: MaintenanceNotification[]
}

export type MaintenanceErrorCode = 'invalid_input' | 'not_found' | 'invalid_transition' | 'not_assigned' | 'no_lease' | 'storage_failed'

export class MaintenanceError extends Error {
  readonly code: MaintenanceErrorCode
  /** field name → i18n key; only set for `invalid_input` */
  readonly fieldErrors?: Record<string, string>

  constructor(code: MaintenanceErrorCode, fieldErrors?: Record<string, string>) {
    super(code)
    this.name = 'MaintenanceError'
    this.code = code
    this.fieldErrors = fieldErrors
  }
}

/** Boundary to the (future) backend. The mock lives in localMaintenanceApi.ts. */
export interface MaintenanceApi {
  load(): Promise<MaintenanceData>
  createRequest(input: CreateRequestInput): Promise<MaintenanceRequest>
  assign(requestId: string, technicianId: string, actorName: string): Promise<MaintenanceRequest>
  updateStatus(requestId: string, status: RequestStatus, note: string, actor: Actor): Promise<MaintenanceRequest>
  markRead(notificationId: string): Promise<void>
  markAllRead(recipient: Recipient): Promise<void>
}

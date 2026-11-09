import type { Category, MaintenanceRequest, RequestInput, RequestStatus, Technician } from './types'

/** field name → i18n key of the error; `{}` means valid */
export type FieldErrors = Record<string, string>

export const CATEGORIES: Category[] = ['electrical', 'plumbing', 'airConditioning', 'furniture', 'other']

export const MAX_PHOTOS = 3
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024
export const TITLE_MAX = 80
export const DESCRIPTION_MAX = 1000
export const NOTE_MAX = 300

const PHOTO_TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

export function validateRequest(input: RequestInput): FieldErrors {
  const errors: FieldErrors = {}
  if (!CATEGORIES.includes(input.category)) errors.category = 'maintenance.errors.category'
  const title = input.title.trim()
  if (title === '' || title.length > TITLE_MAX) errors.title = 'maintenance.errors.title'
  const description = input.description.trim()
  if (description === '' || description.length > DESCRIPTION_MAX) errors.description = 'maintenance.errors.description'
  if (input.photos.length < 1 || input.photos.length > MAX_PHOTOS) errors.photos = 'maintenance.errors.photos'
  return errors
}

/** Returns the i18n key of the problem, or null when the note is fine (it may be empty). */
export const validateNote = (note: string): string | null => (note.trim().length > NOTE_MAX ? 'maintenance.errors.note' : null)

/** Returns the i18n key of the problem, or null when the original file is acceptable. */
export function validatePhotoFile(file: { name: string; type: string; size: number }): string | null {
  const dot = file.name.lastIndexOf('.')
  const extension = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : ''
  const expectedType = PHOTO_TYPES[extension]
  if (!expectedType || file.type !== expectedType) return 'maintenance.errors.photoFile'
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > PHOTO_MAX_BYTES) return 'maintenance.errors.photoFile'
  return null
}

/** MR-0001 … one more than the highest number in use; codes of another shape are ignored. */
export function nextCode(requests: { code: string }[]): string {
  let highest = 0
  for (const r of requests) {
    const match = /^MR-(\d+)$/.exec(r.code)
    if (match) highest = Math.max(highest, Number(match[1]))
  }
  return `MR-${String(highest + 1).padStart(4, '0')}`
}

const NEXT: Record<RequestStatus, RequestStatus | null> = { waiting: 'assigned', assigned: 'inProgress', inProgress: 'done', done: null }

export const nextStatus = (status: RequestStatus): RequestStatus | null => NEXT[status]

/** The juristic office may assign while waiting and change the technician until the work starts. */
export const canAssign = (request: MaintenanceRequest): boolean => request.status === 'waiting' || request.status === 'assigned'

/** A technician moves their own job one step forward, from assigned or inProgress. */
export const canTechnicianUpdate = (request: MaintenanceRequest, technician: Technician): boolean =>
  request.assigneeId === technician.id && (request.status === 'assigned' || request.status === 'inProgress')

export type BadgeStyle = 'pending' | 'settled' | 'critical' | 'inactive'

const BADGES: Record<RequestStatus, BadgeStyle> = { waiting: 'critical', assigned: 'inactive', inProgress: 'pending', done: 'settled' }

export const statusBadge = (status: RequestStatus): BadgeStyle => BADGES[status]

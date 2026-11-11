export type Category = 'general' | 'maintenance' | 'event' | 'urgent'

export interface Announcement {
  id: string
  code: string
  title: string
  body: string
  category: Category
  pinned: boolean
  expiresOn?: string
  createdAt: string
  updatedAt: string
  authorName: string
  readBy: string[]
}

export interface AnnouncementInput {
  title: string
  body: string
  category: Category
  pinned: boolean
  expiresOn: string
}

export interface AnnouncementsData {
  version: 1
  announcements: Announcement[]
}

export type AnnouncementsErrorCode = 'invalid_input' | 'not_found' | 'storage_failed'

export class AnnouncementsError extends Error {
  readonly code: AnnouncementsErrorCode
  readonly fieldErrors?: Record<string, string>

  constructor(
    code: AnnouncementsErrorCode,
    fieldErrors?: Record<string, string>,
  ) {
    super(`announcements: ${code}`)
    this.name = 'AnnouncementsError'
    this.code = code
    this.fieldErrors = fieldErrors
  }
}

export interface AnnouncementsApi {
  load(): Promise<AnnouncementsData>
  create(input: AnnouncementInput, authorName: string): Promise<Announcement>
  update(id: string, input: AnnouncementInput): Promise<Announcement>
  remove(id: string): Promise<void>
  markRead(id: string, phone: string): Promise<void>
  markAllRead(phone: string): Promise<void>
}

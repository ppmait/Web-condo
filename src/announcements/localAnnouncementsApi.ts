import { todayISO } from '../property/dates'
import {
  contentChanged,
  isLive,
  nextCode,
  validateAnnouncement,
} from './rules'
import { ANNOUNCEMENTS_KEY, isAnnouncementsData, makeAnnouncementsSeed } from './seed'
import {
  AnnouncementsError,
  type Announcement,
  type AnnouncementInput,
  type AnnouncementsApi,
  type AnnouncementsData,
} from './types'

interface Options {
  /** Defaults to the browser localStorage. `null` keeps everything in memory. */
  storage?: Storage | null
  today?: () => string
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
    : `ann-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const stamp = (existing: Announcement, day: string): string => {
  const max = existing.updatedAt > existing.createdAt ? existing.updatedAt : existing.createdAt
  return max > day ? max : day
}

export function createLocalAnnouncementsApi(opts: Options = {}): AnnouncementsApi {
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage
  const today = opts.today ?? todayISO

  let memory: AnnouncementsData | null = null
  let persistFailed = false

  const read = (): { readable: boolean; text: string | null } => {
    if (!storage) return { readable: false, text: null }
    try {
      return { readable: true, text: storage.getItem(ANNOUNCEMENTS_KEY) }
    } catch {
      return { readable: false, text: null }
    }
  }

  const persist = (data: AnnouncementsData) => {
    memory = data
    try {
      storage?.setItem(ANNOUNCEMENTS_KEY, JSON.stringify(data))
      persistFailed = false
    } catch {
      persistFailed = true
    }
  }

  const persistStrict = (data: AnnouncementsData): boolean => {
    try {
      storage?.setItem(ANNOUNCEMENTS_KEY, JSON.stringify(data))
    } catch {
      return false
    }
    memory = data
    persistFailed = false
    return true
  }

  const seed = (): AnnouncementsData => {
    const seeded = makeAnnouncementsSeed(today())
    persist(seeded)
    return seeded
  }

  const fresh = (): AnnouncementsData => {
    const { readable, text } = read()
    if (readable) {
      try {
        const parsed: unknown = JSON.parse(text ?? 'null')
        if (isAnnouncementsData(parsed)) {
          memory = parsed
          return parsed
        }
      } catch {
        // invalid JSON
      }
      if (persistFailed && memory && isAnnouncementsData(memory)) return memory
      return seed()
    }
    return memory && isAnnouncementsData(memory) ? memory : seed()
  }

  return {
    async load(): Promise<AnnouncementsData> {
      return clone(fresh())
    },

    async create(input: AnnouncementInput, authorName: string): Promise<Announcement> {
      const day = today()
      const errors = validateAnnouncement(input, day)
      if (Object.keys(errors).length > 0) {
        throw new AnnouncementsError('invalid_input', errors)
      }

      const current = fresh()
      const announcement: Announcement = {
        id: newId(),
        code: nextCode(current.announcements),
        title: input.title.trim(),
        body: input.body.trim(),
        category: input.category,
        pinned: Boolean(input.pinned),
        ...(input.expiresOn?.trim() ? { expiresOn: input.expiresOn.trim() } : {}),
        createdAt: day,
        updatedAt: day,
        authorName: authorName.trim(),
        readBy: [],
      }

      const nextData: AnnouncementsData = {
        version: 1,
        announcements: [...current.announcements, announcement],
      }

      if (!persistStrict(nextData)) {
        throw new AnnouncementsError('storage_failed')
      }

      return clone(announcement)
    },

    async update(id: string, input: AnnouncementInput): Promise<Announcement> {
      const day = today()
      const errors = validateAnnouncement(input, day)
      if (Object.keys(errors).length > 0) {
        throw new AnnouncementsError('invalid_input', errors)
      }

      const current = fresh()
      const existing = current.announcements.find((a) => a.id === id)
      if (!existing) {
        throw new AnnouncementsError('not_found')
      }

      const newExpiresOn = input.expiresOn?.trim() || undefined
      const titleTrimmed = input.title.trim()
      const bodyTrimmed = input.body.trim()

      const isSame =
        existing.title === titleTrimmed &&
        existing.body === bodyTrimmed &&
        existing.category === input.category &&
        existing.pinned === Boolean(input.pinned) &&
        (existing.expiresOn ?? undefined) === newExpiresOn

      if (isSame) {
        return clone(existing)
      }

      const changedContent = contentChanged(existing, input)

      const updated: Announcement = {
        ...existing,
        title: titleTrimmed,
        body: bodyTrimmed,
        category: input.category,
        pinned: Boolean(input.pinned),
        expiresOn: newExpiresOn,
        updatedAt: stamp(existing, day),
        readBy: changedContent ? [] : [...existing.readBy],
      }

      const nextData: AnnouncementsData = {
        version: 1,
        announcements: current.announcements.map((a) => (a.id === id ? updated : a)),
      }

      if (!persistStrict(nextData)) {
        throw new AnnouncementsError('storage_failed')
      }

      return clone(updated)
    },

    async remove(id: string): Promise<void> {
      const current = fresh()
      const exists = current.announcements.some((a) => a.id === id)
      if (!exists) {
        throw new AnnouncementsError('not_found')
      }

      const nextData: AnnouncementsData = {
        version: 1,
        announcements: current.announcements.filter((a) => a.id !== id),
      }

      if (!persistStrict(nextData)) {
        throw new AnnouncementsError('storage_failed')
      }
    },

    async markRead(id: string, phone: string): Promise<void> {
      const p = phone?.trim() ?? ''
      if (!p) return

      const current = fresh()
      const target = current.announcements.find((a) => a.id === id)
      if (!target) return
      if (target.readBy.includes(p)) return

      const updated: Announcement = {
        ...target,
        readBy: [...target.readBy, p],
      }

      persist({
        version: 1,
        announcements: current.announcements.map((a) => (a.id === id ? updated : a)),
      })
    },

    async markAllRead(phone: string): Promise<void> {
      const p = phone?.trim() ?? ''
      if (!p) return

      const current = fresh()
      const day = today()
      let changed = false

      const nextAnnouncements = current.announcements.map((a) => {
        if (isLive(a, day) && !a.readBy.includes(p)) {
          changed = true
          return { ...a, readBy: [...a.readBy, p] }
        }
        return a
      })

      if (!changed) return

      persist({
        version: 1,
        announcements: nextAnnouncements,
      })
    },
  }
}

export const localAnnouncementsApi = createLocalAnnouncementsApi()

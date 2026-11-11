import { isValidDate } from '../property/dates'
import type { Announcement, AnnouncementInput, Category } from './types'

export type FieldErrors = Record<string, string>

export const CATEGORIES: readonly Category[] = ['general', 'maintenance', 'event', 'urgent'] as const

export const TITLE_MAX = 100
export const BODY_MAX = 2000
export const PREVIEW_MAX = 120

export function validateAnnouncement(input: AnnouncementInput, today: string): FieldErrors {
  const errors: FieldErrors = {}
  const title = input.title?.trim() ?? ''
  if (!title || title.length > TITLE_MAX) {
    errors.title = 'announcements.errors.title'
  }

  const body = input.body?.trim() ?? ''
  if (!body || body.length > BODY_MAX) {
    errors.body = 'announcements.errors.body'
  }

  if (!CATEGORIES.includes(input.category)) {
    errors.category = 'announcements.errors.category'
  }

  const expiresOn = input.expiresOn?.trim() ?? ''
  if (expiresOn) {
    if (!isValidDate(expiresOn) || expiresOn < today) {
      errors.expiresOn = 'announcements.errors.expiresOn'
    }
  }

  return errors
}

export function isExpired(a: Announcement, today: string): boolean {
  return Boolean(a.expiresOn && a.expiresOn < today)
}

export function isLive(a: Announcement, today: string): boolean {
  return !isExpired(a, today)
}

export function sortAnnouncements(list: Announcement[]): Announcement[] {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    if (a.createdAt !== b.createdAt) return b.createdAt.localeCompare(a.createdAt)
    return b.code.localeCompare(a.code)
  })
}

export function isUnreadBy(a: Announcement, phone: string, today: string): boolean {
  const p = phone?.trim() ?? ''
  if (!p) return false
  if (!isLive(a, today)) return false
  return !a.readBy?.includes(p)
}

export function contentChanged(before: Announcement, input: AnnouncementInput): boolean {
  return before.title.trim() !== input.title.trim() || before.body.trim() !== input.body.trim()
}

const CODE_RE = /^AN-(\d+)$/

export function nextCode(items: { code: string }[]): string {
  let max = 0
  for (const item of items) {
    const m = CODE_RE.exec(item.code)
    if (m) {
      const num = Number(m[1])
      if (num > max) max = num
    }
  }
  const next = max + 1
  return `AN-${String(next).padStart(4, '0')}`
}

export function categoryBadge(category: Category): 'critical' | 'pending' | 'settled' | 'inactive' {
  switch (category) {
    case 'urgent':
      return 'critical'
    case 'maintenance':
      return 'pending'
    case 'event':
      return 'settled'
    case 'general':
    default:
      return 'inactive'
  }
}

export function preview(body: string, max = PREVIEW_MAX): string {
  const collapsed = body.replace(/\s+/g, ' ').trim()
  if (!collapsed) return ''

  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const SegmenterCtor = (Intl as unknown as { Segmenter: new (locale: string, opts: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter
    const segmenter = new SegmenterCtor('th', { granularity: 'grapheme' })
    const graphemes = Array.from(segmenter.segment(collapsed), (s) => s.segment)
    if (graphemes.length <= max) return collapsed
    return graphemes.slice(0, max).join('') + '…'
  }

  const chars = Array.from(collapsed)
  if (chars.length <= max) return collapsed
  return chars.slice(0, max).join('') + '…'
}

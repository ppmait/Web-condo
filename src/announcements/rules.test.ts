import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import th from '../i18n/th.json'
import {
  categoryBadge,
  contentChanged,
  isExpired,
  isLive,
  isUnreadBy,
  nextCode,
  preview,
  sortAnnouncements,
  validateAnnouncement,
} from './rules'
import type { Announcement, AnnouncementInput } from './types'

const sampleAnnouncement = (over: Partial<Announcement> = {}): Announcement => ({
  id: 'ann-1',
  code: 'AN-0001',
  title: 'แจ้งหยุดจ่ายน้ำประปาชั่วคราว',
  body: 'จะมีการตัดน้ำเพื่อบำรุงรักษาในวันที่ 12 พ.ย. เวลา 09:00 - 12:00 น.',
  category: 'urgent',
  pinned: false,
  expiresOn: '2026-11-15',
  createdAt: '2026-11-08',
  updatedAt: '2026-11-08',
  authorName: 'เจ้าหน้าที่นิติ',
  readBy: [],
  ...over,
})

const sampleInput = (over: Partial<AnnouncementInput> = {}): AnnouncementInput => ({
  title: 'แจ้งหยุดจ่ายน้ำประปาชั่วคราว',
  body: 'จะมีการตัดน้ำเพื่อบำรุงรักษาในวันที่ 12 พ.ย. เวลา 09:00 - 12:00 น.',
  category: 'urgent',
  pinned: false,
  expiresOn: '2026-11-15',
  ...over,
})

describe('validateAnnouncement', () => {
  const today = '2026-11-10'

  it('passes valid input', () => {
    expect(validateAnnouncement(sampleInput(), today)).toEqual({})
  })

  it('validates title (empty, whitespace, length 100, length 101)', () => {
    expect(validateAnnouncement(sampleInput({ title: '' }), today).title).toBe('announcements.errors.title')
    expect(validateAnnouncement(sampleInput({ title: '   ' }), today).title).toBe('announcements.errors.title')
    expect(validateAnnouncement(sampleInput({ title: 'a'.repeat(100) }), today).title).toBeUndefined()
    expect(validateAnnouncement(sampleInput({ title: 'a'.repeat(101) }), today).title).toBe('announcements.errors.title')
    expect(validateAnnouncement(sampleInput({ title: `  ${'a'.repeat(100)}  ` }), today).title).toBeUndefined()
  })

  it('validates body (empty, whitespace, length 2000, length 2001)', () => {
    expect(validateAnnouncement(sampleInput({ body: '' }), today).body).toBe('announcements.errors.body')
    expect(validateAnnouncement(sampleInput({ body: '   \n  ' }), today).body).toBe('announcements.errors.body')
    expect(validateAnnouncement(sampleInput({ body: 'b'.repeat(2000) }), today).body).toBeUndefined()
    expect(validateAnnouncement(sampleInput({ body: 'b'.repeat(2001) }), today).body).toBe('announcements.errors.body')
    expect(validateAnnouncement(sampleInput({ body: `  ${'b'.repeat(2000)}  ` }), today).body).toBeUndefined()
  })

  it('validates category', () => {
    // @ts-expect-error invalid category test
    expect(validateAnnouncement(sampleInput({ category: 'unknown' }), today).category).toBe('announcements.errors.category')
  })

  it('validates expiresOn (empty, today, tomorrow, yesterday, invalid date, leap year, cross year)', () => {
    expect(validateAnnouncement(sampleInput({ expiresOn: '' }), today).expiresOn).toBeUndefined()
    expect(validateAnnouncement(sampleInput({ expiresOn: '   ' }), today).expiresOn).toBeUndefined()
    expect(validateAnnouncement(sampleInput({ expiresOn: '2026-11-10' }), today).expiresOn).toBeUndefined()
    expect(validateAnnouncement(sampleInput({ expiresOn: '2026-11-11' }), today).expiresOn).toBeUndefined()
    expect(validateAnnouncement(sampleInput({ expiresOn: '2026-11-09' }), today).expiresOn).toBe('announcements.errors.expiresOn')
    expect(validateAnnouncement(sampleInput({ expiresOn: '2026-02-30' }), today).expiresOn).toBe('announcements.errors.expiresOn')
    expect(validateAnnouncement(sampleInput({ expiresOn: 'not-a-date' }), today).expiresOn).toBe('announcements.errors.expiresOn')
    expect(validateAnnouncement(sampleInput({ expiresOn: '2027-02-29' }), today).expiresOn).toBe('announcements.errors.expiresOn')
    expect(validateAnnouncement(sampleInput({ expiresOn: '2028-02-29' }), today).expiresOn).toBeUndefined()

    // cross month and year
    expect(validateAnnouncement(sampleInput({ expiresOn: '2027-01-01' }), '2026-12-31').expiresOn).toBeUndefined()
  })

  it('reports all field errors simultaneously', () => {
    const errors = validateAnnouncement(
      {
        title: '',
        body: '',
        // @ts-expect-error invalid category
        category: 'invalid',
        pinned: false,
        expiresOn: 'yesterday',
      },
      today,
    )
    expect(errors.title).toBe('announcements.errors.title')
    expect(errors.body).toBe('announcements.errors.body')
    expect(errors.category).toBe('announcements.errors.category')
    expect(errors.expiresOn).toBe('announcements.errors.expiresOn')
  })
})

describe('isExpired and isLive', () => {
  it('returns true when expired and false when live', () => {
    const today = '2026-11-10'
    expect(isExpired(sampleAnnouncement({ expiresOn: undefined }), today)).toBe(false)
    expect(isLive(sampleAnnouncement({ expiresOn: undefined }), today)).toBe(true)

    expect(isExpired(sampleAnnouncement({ expiresOn: '' }), today)).toBe(false)
    expect(isLive(sampleAnnouncement({ expiresOn: '' }), today)).toBe(true)

    // expiresOn == today is still live
    expect(isExpired(sampleAnnouncement({ expiresOn: '2026-11-10' }), today)).toBe(false)
    expect(isLive(sampleAnnouncement({ expiresOn: '2026-11-10' }), today)).toBe(true)

    // expiresOn yesterday is expired
    expect(isExpired(sampleAnnouncement({ expiresOn: '2026-11-09' }), today)).toBe(true)
    expect(isLive(sampleAnnouncement({ expiresOn: '2026-11-09' }), today)).toBe(false)
  })
})

describe('sortAnnouncements', () => {
  it('sorts pinned first, then createdAt descending, then code descending without mutating original', () => {
    const list: Announcement[] = [
      sampleAnnouncement({ id: '1', code: 'AN-0001', pinned: false, createdAt: '2026-11-01' }),
      sampleAnnouncement({ id: '2', code: 'AN-0002', pinned: true, createdAt: '2026-11-01' }),
      sampleAnnouncement({ id: '3', code: 'AN-0003', pinned: false, createdAt: '2026-11-05' }),
      sampleAnnouncement({ id: '4', code: 'AN-0004', pinned: true, createdAt: '2026-11-06' }),
      sampleAnnouncement({ id: '5', code: 'AN-0005', pinned: false, createdAt: '2026-11-05' }),
    ]

    const sorted = sortAnnouncements(list)
    expect(sorted.map((a) => a.id)).toEqual(['4', '2', '5', '3', '1'])
    // original array not mutated
    expect(list[0].id).toBe('1')
  })
})

describe('isUnreadBy', () => {
  const today = '2026-11-10'

  it('checks if announcement is unread by a given phone', () => {
    const a = sampleAnnouncement({ readBy: ['0810000001'], expiresOn: '2026-11-15' })
    expect(isUnreadBy(a, '0810000001', today)).toBe(false)
    expect(isUnreadBy(a, ' 0810000001 ', today)).toBe(false)
    expect(isUnreadBy(a, '0820000002', today)).toBe(true)
    expect(isUnreadBy(a, '', today)).toBe(false)
    expect(isUnreadBy(a, '   ', today)).toBe(false)

    // expired is not counted as unread
    const expired = sampleAnnouncement({ readBy: [], expiresOn: '2026-11-01' })
    expect(isUnreadBy(expired, '0820000002', today)).toBe(false)
  })
})

describe('contentChanged', () => {
  it('detects changes in title or body, ignoring leading/trailing whitespace and metadata-only changes', () => {
    const orig = sampleAnnouncement({
      title: 'Hello',
      body: 'World',
      pinned: false,
      category: 'general',
      expiresOn: '2026-11-15',
    })

    expect(contentChanged(orig, sampleInput({ title: 'Hello', body: 'World' }))).toBe(false)
    expect(contentChanged(orig, sampleInput({ title: '  Hello  ', body: '  World  ' }))).toBe(false)
    // metadata only
    expect(contentChanged(orig, sampleInput({ title: 'Hello', body: 'World', pinned: true, category: 'urgent' }))).toBe(false)

    // title change
    expect(contentChanged(orig, sampleInput({ title: 'Hello 2', body: 'World' }))).toBe(true)
    // body change
    expect(contentChanged(orig, sampleInput({ title: 'Hello', body: 'New World' }))).toBe(true)
  })
})

describe('nextCode', () => {
  it('generates the next sequential code', () => {
    expect(nextCode([])).toBe('AN-0001')
    expect(nextCode([{ code: 'AN-0001' }])).toBe('AN-0002')
    expect(nextCode([{ code: 'AN-0001' }, { code: 'AN-0009' }, { code: 'AN-0004' }])).toBe('AN-0010')
    expect(nextCode([{ code: 'OTHER-99' }, { code: 'AN-0050' }])).toBe('AN-0051')
    expect(nextCode([{ code: 'AN-9999' }])).toBe('AN-10000')
  })
})

describe('categoryBadge', () => {
  it('maps category to correct status variant', () => {
    expect(categoryBadge('urgent')).toBe('critical')
    expect(categoryBadge('maintenance')).toBe('pending')
    expect(categoryBadge('event')).toBe('settled')
    expect(categoryBadge('general')).toBe('inactive')
  })
})

describe('preview', () => {
  it('handles empty or short body without ellipsis', () => {
    expect(preview('')).toBe('')
    expect(preview('   ')).toBe('')
    expect(preview('Short text')).toBe('Short text')
  })

  it('collapses multi-line and extra whitespace', () => {
    expect(preview('Line 1\n\nLine 2   with   spaces')).toBe('Line 1 Line 2 with spaces')
  })

  it('truncates at max and appends ellipsis when longer', () => {
    const text120 = 'a'.repeat(120)
    expect(preview(text120, 120)).toBe(text120)
    expect(preview(text120 + 'b', 120)).toBe(text120 + '…')
  })

  it('does not split Thai vowel/tone grapheme clusters', () => {
    const thai = 'ประกาศข่าวสารทดสอบน้ำประปา'
    const truncated = preview(thai, 5)
    expect(truncated.endsWith('…')).toBe(true)
    expect(truncated.length).toBeGreaterThan(1)
  })
})

describe('i18n translation keys', () => {
  it('has different text in Thai and English for categories and errors', () => {
    expect(th.announcements.category.urgent).not.toBe(en.announcements.category.urgent)
    expect(th.announcements.errors.title).not.toBe(en.announcements.errors.title)
    expect(th.announcements.status.pinned).not.toBe(en.announcements.status.pinned)
  })
})

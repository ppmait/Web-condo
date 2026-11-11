import { describe, expect, it } from 'vitest'
import { DEMO_TENANT_PHONE } from '../auth/demoAccounts'
import { isExpired, isLive, isUnreadBy } from './rules'
import { isAnnouncementsData, makeAnnouncementsSeed } from './seed'

describe('makeAnnouncementsSeed and isAnnouncementsData', () => {
  it.each(['2026-11-08', '2028-02-29', '2031-01-03'])('generates valid seed data for today = %s', (today) => {
    const seed = makeAnnouncementsSeed(today)
    expect(isAnnouncementsData(seed)).toBe(true)
    expect(seed.version).toBe(1)
    expect(seed.announcements).toHaveLength(5)

    // unique ids and codes
    const ids = new Set(seed.announcements.map((a) => a.id))
    const codes = new Set(seed.announcements.map((a) => a.code))
    expect(ids.size).toBe(5)
    expect(codes.size).toBe(5)
    expect(seed.announcements.map((a) => a.code)).toEqual([
      'AN-0001',
      'AN-0002',
      'AN-0003',
      'AN-0004',
      'AN-0005',
    ])

    // all createdAt and updatedAt <= today
    for (const a of seed.announcements) {
      expect(a.createdAt <= today).toBe(true)
      expect(a.updatedAt <= today).toBe(true)
      expect(a.updatedAt >= a.createdAt).toBe(true)
    }

    // composition
    const [pinnedGeneral, urgent, event, general, expired] = seed.announcements
    expect(pinnedGeneral.pinned).toBe(true)
    expect(pinnedGeneral.category).toBe('general')

    expect(urgent.category).toBe('urgent')
    expect(urgent.expiresOn).toBeDefined()
    expect(isLive(urgent, today)).toBe(true)

    expect(event.category).toBe('event')
    expect(isLive(event, today)).toBe(true)

    expect(general.category).toBe('general')
    expect(isLive(general, today)).toBe(true)

    expect(expired.category).toBe('maintenance')
    expect(isExpired(expired, today)).toBe(true)

    // demo tenant has at least 2 live unread
    const demoUnread = seed.announcements.filter((a) => isUnreadBy(a, DEMO_TENANT_PHONE, today))
    expect(demoUnread.length).toBeGreaterThanOrEqual(2)

    // demo tenant has read some
    const demoRead = seed.announcements.filter((a) => a.readBy.includes(DEMO_TENANT_PHONE))
    expect(demoRead.length).toBeGreaterThanOrEqual(1)

    // other phones present in readBy
    const otherRead = seed.announcements.flatMap((a) => a.readBy).filter((p) => p !== DEMO_TENANT_PHONE)
    expect(otherRead.length).toBeGreaterThan(0)
  })
})

describe('isAnnouncementsData edge cases', () => {
  const valid = makeAnnouncementsSeed('2026-11-10')

  it('rejects non-object or wrong version', () => {
    expect(isAnnouncementsData(null)).toBe(false)
    expect(isAnnouncementsData('string')).toBe(false)
    expect(isAnnouncementsData({ ...valid, version: 2 })).toBe(false)
    expect(isAnnouncementsData({ version: 1, announcements: 'not-array' })).toBe(false)
  })

  it('rejects duplicated id or code', () => {
    const dupId = {
      ...valid,
      announcements: [valid.announcements[0], { ...valid.announcements[1], id: valid.announcements[0].id }],
    }
    expect(isAnnouncementsData(dupId)).toBe(false)

    const dupCode = {
      ...valid,
      announcements: [valid.announcements[0], { ...valid.announcements[1], code: valid.announcements[0].code }],
    }
    expect(isAnnouncementsData(dupCode)).toBe(false)
  })

  it('rejects updatedAt < createdAt', () => {
    const bad = {
      ...valid,
      announcements: [{ ...valid.announcements[0], createdAt: '2026-11-10', updatedAt: '2026-11-09' }],
    }
    expect(isAnnouncementsData(bad)).toBe(false)
  })

  it('accepts announcement with expired date (past expiresOn is valid calendar date)', () => {
    const expiredItem = { ...valid.announcements[0], expiresOn: '2026-11-01' }
    expect(isAnnouncementsData({ ...valid, announcements: [expiredItem] })).toBe(true)
  })
})

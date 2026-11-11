import { describe, expect, it } from 'vitest'
import { MemoryStorage, UnreadableStorage, UnwritableStorage } from '../test/memoryStorage'
import { createLocalAnnouncementsApi } from './localAnnouncementsApi'
import { ANNOUNCEMENTS_KEY } from './seed'
import { AnnouncementsError, type AnnouncementInput } from './types'

describe('createLocalAnnouncementsApi', () => {
  const TEST_TODAY = '2026-11-10'

  it('loads fresh seed data when storage is empty or invalid', async () => {
    const storage = new MemoryStorage()
    const api = createLocalAnnouncementsApi({ storage, today: () => TEST_TODAY })

    const data = await api.load()
    expect(data.announcements).toHaveLength(5)
    expect(storage.getItem(ANNOUNCEMENTS_KEY)).toBeDefined()

    // corrupted storage is re-seeded
    storage.setItem(ANNOUNCEMENTS_KEY, 'invalid json')
    const reloaded = await api.load()
    expect(reloaded.announcements).toHaveLength(5)
  })

  it('works with null storage (in-memory mode) and UnreadableStorage', async () => {
    const nullApi = createLocalAnnouncementsApi({ storage: null, today: () => TEST_TODAY })
    expect((await nullApi.load()).announcements).toHaveLength(5)

    const unreadableApi = createLocalAnnouncementsApi({ storage: new UnreadableStorage(), today: () => TEST_TODAY })
    expect((await unreadableApi.load()).announcements).toHaveLength(5)
  })

  it('creates an announcement with trimmed content, next code, and today timestamp', async () => {
    const storage = new MemoryStorage()
    const api = createLocalAnnouncementsApi({ storage, today: () => TEST_TODAY })

    const input: AnnouncementInput = {
      title: '  หัวข้อใหม่  ',
      body: '  เนื้อหาใหม่  ',
      category: 'maintenance',
      pinned: true,
      expiresOn: '2026-11-20',
    }

    const created = await api.create(input, '  เจ้าหน้าที่ 1  ')
    expect(created.code).toBe('AN-0006')
    expect(created.title).toBe('หัวข้อใหม่')
    expect(created.body).toBe('เนื้อหาใหม่')
    expect(created.category).toBe('maintenance')
    expect(created.pinned).toBe(true)
    expect(created.expiresOn).toBe('2026-11-20')
    expect(created.createdAt).toBe(TEST_TODAY)
    expect(created.updatedAt).toBe(TEST_TODAY)
    expect(created.authorName).toBe('เจ้าหน้าที่ 1')
    expect(created.readBy).toEqual([])

    const current = await api.load()
    expect(current.announcements).toHaveLength(6)
  })

  it('rejects invalid create input and does not modify storage', async () => {
    const storage = new MemoryStorage()
    const api = createLocalAnnouncementsApi({ storage, today: () => TEST_TODAY })

    const before = await api.load()
    await expect(
      api.create(
        {
          title: '',
          body: 'เนื้อหา',
          category: 'general',
          pinned: false,
          expiresOn: '2026-11-01', // in the past
        },
        'นิติ',
      ),
    ).rejects.toThrow(AnnouncementsError)

    const after = await api.load()
    expect(after.announcements).toHaveLength(before.announcements.length)
  })

  it('updates an announcement, clearing readBy on title/body change, updating updatedAt', async () => {
    const storage = new MemoryStorage()
    const api = createLocalAnnouncementsApi({ storage, today: () => TEST_TODAY })

    const list = await api.load()
    const target = list.announcements.find((a) => a.id === 'ann-1')!
    expect(target.readBy.length).toBeGreaterThan(0)

    // Edit title -> readBy should be cleared
    const updated = await api.update('ann-1', {
      title: 'หัวข้อปรับปรุงใหม่',
      body: target.body,
      category: target.category,
      pinned: target.pinned,
      expiresOn: target.expiresOn ?? '',
    })

    expect(updated.title).toBe('หัวข้อปรับปรุงใหม่')
    expect(updated.readBy).toEqual([])
    expect(updated.updatedAt).toBe(TEST_TODAY)

    // Edit only pinned status -> readBy preserved
    await api.markRead('ann-1', '0810000001')
    const updatedOnlyPinned = await api.update('ann-1', {
      title: 'หัวข้อปรับปรุงใหม่',
      body: target.body,
      category: target.category,
      pinned: !target.pinned,
      expiresOn: target.expiresOn ?? '',
    })
    expect(updatedOnlyPinned.readBy).toContain('0810000001')
  })

  it('does nothing and avoids writing when update has no changes', async () => {
    const storage = new MemoryStorage()
    const api = createLocalAnnouncementsApi({ storage, today: () => TEST_TODAY })

    const list = await api.load()
    const target = list.announcements[0]
    const rawBefore = storage.getItem(ANNOUNCEMENTS_KEY)

    const result = await api.update(target.id, {
      title: target.title,
      body: target.body,
      category: target.category,
      pinned: target.pinned,
      expiresOn: target.expiresOn ?? '',
    })

    expect(result.id).toBe(target.id)
    expect(storage.getItem(ANNOUNCEMENTS_KEY)).toBe(rawBefore)
  })

  it('extends expiration of an expired announcement and un-expires it', async () => {
    const storage = new MemoryStorage()
    const api = createLocalAnnouncementsApi({ storage, today: () => TEST_TODAY })

    // ann-5 is expired in seed
    const updated = await api.update('ann-5', {
      title: 'แจ้งตรวจสอบระบบสัญญาณเตือนอัคคีภัย',
      body: 'ขยายเวลาทดสอบ',
      category: 'maintenance',
      pinned: false,
      expiresOn: '2026-11-25',
    })

    expect(updated.expiresOn).toBe('2026-11-25')
  })

  it('removes an announcement permanently and throws not_found if missing', async () => {
    const storage = new MemoryStorage()
    const api = createLocalAnnouncementsApi({ storage, today: () => TEST_TODAY })

    await api.remove('ann-1')
    const list = await api.load()
    expect(list.announcements.some((a) => a.id === 'ann-1')).toBe(false)

    await expect(api.remove('ann-1')).rejects.toThrow(AnnouncementsError)
  })

  it('marks single announcement as read without duplicate phones', async () => {
    const storage = new MemoryStorage()
    const api = createLocalAnnouncementsApi({ storage, today: () => TEST_TODAY })

    await api.markRead('ann-3', '0899999999')
    let list = await api.load()
    let a3 = list.announcements.find((a) => a.id === 'ann-3')!
    expect(a3.readBy).toContain('0899999999')

    // repeat read with whitespace does not duplicate
    await api.markRead('ann-3', '  0899999999  ')
    list = await api.load()
    a3 = list.announcements.find((a) => a.id === 'ann-3')!
    expect(a3.readBy.filter((p) => p === '0899999999')).toHaveLength(1)

    // non-existent announcement does not throw
    await expect(api.markRead('non-existent', '0899999999')).resolves.toBeUndefined()
  })

  it('marks all live announcements as read for a phone', async () => {
    const storage = new MemoryStorage()
    const api = createLocalAnnouncementsApi({ storage, today: () => TEST_TODAY })

    const phone = '0877777777'
    await api.markAllRead(phone)

    const list = await api.load()
    for (const a of list.announcements) {
      if (a.expiresOn && a.expiresOn < TEST_TODAY) {
        // expired should NOT be marked read
        expect(a.readBy).not.toContain(phone)
      } else {
        expect(a.readBy).toContain(phone)
      }
    }
  })

  it('throws storage_failed on create/update/remove when storage is full (UnwritableStorage)', async () => {
    const storage = new UnwritableStorage()
    const api = createLocalAnnouncementsApi({ storage, today: () => TEST_TODAY })

    const before = await api.load()
    expect(before.announcements).toHaveLength(5)

    await expect(
      api.create(
        {
          title: 'ประกาศใหม่',
          body: 'รายละเอียด',
          category: 'general',
          pinned: false,
          expiresOn: '',
        },
        'นิติ',
      ),
    ).rejects.toThrow(AnnouncementsError)

    await expect(
      api.update('ann-1', {
        title: 'แก้หัวข้อ',
        body: 'แก้เนื้อหา',
        category: 'urgent',
        pinned: false,
        expiresOn: '',
      }),
    ).rejects.toThrow(AnnouncementsError)

    await expect(api.remove('ann-1')).rejects.toThrow(AnnouncementsError)

    // Data in memory is untouched
    const after = await api.load()
    expect(after.announcements).toHaveLength(5)
  })

  it('preserves history and stamps never go back when clock moves backwards', async () => {
    const storage = new MemoryStorage()
    // First created on 2026-11-10
    const apiDay1 = createLocalAnnouncementsApi({ storage, today: () => '2026-11-10' })
    const created = await apiDay1.create(
      {
        title: 'สร้างวันที่ 10',
        body: 'เนื้อหา',
        category: 'general',
        pinned: false,
        expiresOn: '',
      },
      'สมหญิง',
    )
    expect(created.updatedAt).toBe('2026-11-10')

    // System clock moves backward to 2026-11-09
    const apiDay0 = createLocalAnnouncementsApi({ storage, today: () => '2026-11-09' })
    const updated = await apiDay0.update(created.id, {
      title: 'แก้ไขหัวข้อใหม่ตอนนาฬิกาถอย',
      body: 'เนื้อหา',
      category: 'general',
      pinned: false,
      expiresOn: '',
    })

    // updatedAt does not go backward
    expect(updated.updatedAt).toBe('2026-11-10')
    // and subsequent load is not corrupted or re-seeded
    const list = await apiDay0.load()
    expect(list.announcements.some((a) => a.id === created.id)).toBe(true)
  })
})

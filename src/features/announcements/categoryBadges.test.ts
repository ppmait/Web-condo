import { describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import { announcementBadge } from './categoryBadges'

describe('announcementBadge', () => {
  it('maps all 4 categories to correct status badge info with translated labels', async () => {
    await i18n.changeLanguage('th')
    const t = i18n.t.bind(i18n)

    expect(announcementBadge('urgent', t)).toEqual({ status: 'critical', label: 'เร่งด่วน' })
    expect(announcementBadge('maintenance', t)).toEqual({ status: 'pending', label: 'ซ่อมบำรุง' })
    expect(announcementBadge('event', t)).toEqual({ status: 'settled', label: 'กิจกรรม' })
    expect(announcementBadge('general', t)).toEqual({ status: 'inactive', label: 'ทั่วไป' })

    await i18n.changeLanguage('en')
    const tEn = i18n.t.bind(i18n)

    expect(announcementBadge('urgent', tEn)).toEqual({ status: 'critical', label: 'Urgent' })
    expect(announcementBadge('maintenance', tEn)).toEqual({ status: 'pending', label: 'Maintenance' })
    expect(announcementBadge('event', tEn)).toEqual({ status: 'settled', label: 'Event' })
    expect(announcementBadge('general', tEn)).toEqual({ status: 'inactive', label: 'General' })
  })
})

import { createLocalAnnouncementsApi } from '../announcements/localAnnouncementsApi'
import type { AnnouncementsApi } from '../announcements/types'
import { TEST_TODAY } from './renderProperty'

export function makeTestAnnouncements(opts: { today?: string } = {}): { announcements: AnnouncementsApi } {
  const day = opts.today ?? TEST_TODAY
  const announcements = createLocalAnnouncementsApi({ storage: null, today: () => day })
  return { announcements }
}

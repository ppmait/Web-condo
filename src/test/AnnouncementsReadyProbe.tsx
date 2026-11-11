import { useAnnouncements } from '../announcements/useAnnouncements'

/** Test-only marker that appears once the AnnouncementsProvider has loaded the data. */
export default function AnnouncementsReadyProbe() {
  const { status } = useAnnouncements()
  return status === 'ready' ? <span data-testid="announcements-ready" hidden /> : null
}

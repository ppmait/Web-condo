import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAnnouncements } from '../../announcements/useAnnouncements'
import { AnnouncementsError, type Announcement } from '../../announcements/types'
import ConfirmDialog from '../../components/ConfirmDialog'

interface Props {
  announcement: Announcement
  onClose: () => void
}

export default function DeleteAnnouncementDialog({ announcement, onClose }: Props) {
  const { t } = useTranslation()
  const { remove } = useAnnouncements()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  const handleConfirm = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    setError(null)

    try {
      await remove(announcement.id)
      onClose()
    } catch (err) {
      inFlight.current = false
      setPending(false)
      if (err instanceof AnnouncementsError) {
        if (err.code === 'not_found') {
          // Already deleted in another tab
          onClose()
          return
        }
        if (err.code === 'storage_failed') {
          setError(t('announcements.errors.storageFailed'))
          return
        }
      }
      setError(t('announcements.errors.failed'))
    }
  }

  return (
    <ConfirmDialog
      open
      danger
      pending={pending}
      title={t('announcements.dialog.deleteTitle')}
      message={t('announcements.dialog.deleteConfirm', { title: announcement.title })}
      confirmLabel={t('announcements.actions.delete')}
      onConfirm={handleConfirm}
      onCancel={onClose}
    >
      {error && (
        <div role="alert" className="mt-3 rounded bg-error-container p-2 text-xs text-on-error-container">
          {error}
        </div>
      )}
    </ConfirmDialog>
  )
}

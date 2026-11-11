import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { isLive } from '../../announcements/rules'
import { useAnnouncements } from '../../announcements/useAnnouncements'
import { useAuth } from '../../auth/useAuth'
import Button from '../../components/Button'
import Modal from '../../components/Modal'
import StatusBadge from '../../components/StatusBadge'
import { formatDate } from '../../lib/format'
import { announcementBadge } from './categoryBadges'

interface Props {
  announcementId: string
  onClose: () => void
  children?: ReactNode
}

export default function AnnouncementDetailModal({ announcementId, onClose }: Props) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'th'
  const { data, markRead, today } = useAnnouncements()
  const { user } = useAuth()
  const phone = user?.phone ?? ''

  const announcement = data.announcements.find((a) => a.id === announcementId)
  const live = announcement ? isLive(announcement, today) : false

  const markedRef = useRef(false)
  useEffect(() => {
    if (announcement && live && phone && !markedRef.current) {
      markedRef.current = true
      void markRead(announcement.id, phone)
    }
  }, [announcement, live, phone, markRead])

  if (!announcement || !live) {
    return (
      <Modal open title={t('announcements.dialog.notFound')} onClose={onClose}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-on-surface-variant">{t('announcements.dialog.notFound')}</p>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              {t('announcements.dialog.cancel')}
            </Button>
          </div>
        </div>
      </Modal>
    )
  }

  const badge = announcementBadge(announcement.category, t)

  const meta: [string, ReactNode][] = [
    [t('announcements.fields.category'), <StatusBadge key="cat" status={badge.status} label={badge.label} />],
    ...(announcement.pinned
      ? [
          [
            t('announcements.fields.pinned'),
            <StatusBadge key="pinned" status="settled" label={t('announcements.status.pinned')} />,
          ] as [string, ReactNode],
        ]
      : []),
    [t('announcements.fields.published'), formatDate(announcement.createdAt, lang)],
    ...(announcement.expiresOn
      ? [[t('announcements.fields.expiresOn'), formatDate(announcement.expiresOn, lang)] as [string, ReactNode]]
      : []),
    [t('announcements.fields.author'), announcement.authorName],
  ]

  return (
    <Modal open title={announcement.title} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1 text-sm">
          {meta.map(([label, value], i) => (
            <div key={i} className="contents">
              <dt className="text-on-surface-variant">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-2 border-t border-[#e2e8f0] pt-4">
          <p className="whitespace-pre-line text-sm leading-relaxed text-on-surface">
            {announcement.body}
          </p>
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            {t('announcements.dialog.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

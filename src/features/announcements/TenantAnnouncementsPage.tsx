import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { isLive, isUnreadBy, preview, sortAnnouncements } from '../../announcements/rules'
import { useAnnouncements } from '../../announcements/useAnnouncements'
import { useAuth } from '../../auth/useAuth'
import StatusBadge from '../../components/StatusBadge'
import { formatDate } from '../../lib/format'
import AnnouncementDetailModal from './AnnouncementDetailModal'
import { announcementBadge } from './categoryBadges'

export default function TenantAnnouncementsPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'th'
  const { data, today, status } = useAnnouncements()
  const { user } = useAuth()
  const phone = user?.phone ?? ''

  const [searchParams, setSearchParams] = useSearchParams()
  const paramId = searchParams.get('announcement')

  const liveAnnouncements = useMemo(() => {
    const live = data.announcements.filter((a) => isLive(a, today))
    return sortAnnouncements(live)
  }, [data.announcements, today])

  const [activeModalId, setActiveModalId] = useState<string | null>(null)

  // If query param points to an invalid/expired announcement, clear it in an effect once loaded
  useEffect(() => {
    if (status !== 'ready') return
    if (paramId && !liveAnnouncements.some((a) => a.id === paramId)) {
      const next = new URLSearchParams(searchParams)
      next.delete('announcement')
      setSearchParams(next, { replace: true })
    }
  }, [status, paramId, liveAnnouncements, searchParams, setSearchParams])

  const currentModalId =
    (paramId && liveAnnouncements.some((a) => a.id === paramId) ? paramId : null) ??
    (activeModalId && liveAnnouncements.some((a) => a.id === activeModalId) ? activeModalId : null)

  const handleOpen = (id: string) => {
    setActiveModalId(id)
    const next = new URLSearchParams(searchParams)
    next.set('announcement', id)
    setSearchParams(next, { replace: true })
  }

  const handleClose = () => {
    setActiveModalId(null)
    if (searchParams.has('announcement')) {
      const next = new URLSearchParams(searchParams)
      next.delete('announcement')
      setSearchParams(next, { replace: true })
    }
  }

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold leading-9 text-primary-container">
            {t('announcements.title')}
          </h1>
        </div>
      </div>

      {liveAnnouncements.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#cbd5e1] p-12 text-center text-on-surface-variant">
          {t('announcements.tenant.empty')}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {liveAnnouncements.map((a) => {
            const badge = announcementBadge(a.category, t)
            const isUnread = isUnreadBy(a, phone, today)

            return (
              <button
                key={a.id}
                type="button"
                aria-label={t('announcements.tenant.open', { code: a.code })}
                onClick={() => handleOpen(a.id)}
                className="group flex flex-col items-start rounded-xl border border-[#e2e8f0] bg-surface-container-lowest p-5 text-left transition hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              >
                <div className="mb-3 flex w-full flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={badge.status} label={badge.label} />
                    {a.pinned && (
                      <StatusBadge status="settled" label={t('announcements.tenant.pinnedBadge')} />
                    )}
                    {isUnread && (
                      <StatusBadge status="pending" label={t('announcements.tenant.newBadge')} />
                    )}
                  </div>
                  <span className="text-xs text-on-surface-variant">{formatDate(a.createdAt, lang)}</span>
                </div>

                <h2 className="mb-2 text-base font-semibold text-primary-container group-hover:text-primary">
                  {a.title}
                </h2>

                <p className="line-clamp-3 text-sm leading-relaxed text-on-surface-variant">
                  {preview(a.body)}
                </p>

                {a.expiresOn && (
                  <div className="mt-4 pt-3 border-t border-[#f1f5f9] w-full text-xs text-on-surface-variant">
                    {t('announcements.tenant.expires', { date: formatDate(a.expiresOn, lang) })}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {currentModalId && (
        <AnnouncementDetailModal
          announcementId={currentModalId}
          onClose={handleClose}
        />
      )}
    </section>
  )
}

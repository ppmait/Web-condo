import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isExpired, isLive, sortAnnouncements } from '../../announcements/rules'
import { useAnnouncements } from '../../announcements/useAnnouncements'
import type { Announcement } from '../../announcements/types'
import Button from '../../components/Button'
import DataTable, { type Column } from '../../components/DataTable'
import StatusBadge from '../../components/StatusBadge'
import { formatDate } from '../../lib/format'
import AnnouncementFormModal from './AnnouncementFormModal'
import { announcementBadge } from './categoryBadges'
import DeleteAnnouncementDialog from './DeleteAnnouncementDialog'

type FilterStatus = 'all' | 'live' | 'expired'

export default function JuristicAnnouncementsPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'th'
  const { data, today } = useAnnouncements()

  const [filter, setFilter] = useState<FilterStatus>('all')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Announcement | null>(null)
  const [deleting, setDeleting] = useState<Announcement | null>(null)

  const filteredAnnouncements = useMemo(() => {
    let list = data.announcements
    if (filter === 'live') {
      list = list.filter((a) => isLive(a, today))
    } else if (filter === 'expired') {
      list = list.filter((a) => isExpired(a, today))
    }
    return sortAnnouncements(list)
  }, [data.announcements, filter, today])

  const columns: Column<Announcement>[] = [
    {
      key: 'code',
      header: t('announcements.columns.code'),
      render: (a) => <span className="tabular-nums whitespace-nowrap font-medium text-primary-container">{a.code}</span>,
    },
    {
      key: 'category',
      header: t('announcements.columns.category'),
      render: (a) => {
        const badge = announcementBadge(a.category, t)
        return <StatusBadge status={badge.status} label={badge.label} />
      },
    },
    {
      key: 'title',
      header: t('announcements.columns.title'),
      render: (a) => <span className="font-medium text-on-surface line-clamp-1">{a.title}</span>,
    },
    {
      key: 'published',
      header: t('announcements.columns.published'),
      render: (a) => <span className="text-on-surface-variant whitespace-nowrap">{formatDate(a.createdAt, lang)}</span>,
    },
    {
      key: 'expiresOn',
      header: t('announcements.columns.expiresOn'),
      render: (a) => (
        <span className="text-on-surface-variant whitespace-nowrap">
          {a.expiresOn ? formatDate(a.expiresOn, lang) : '-'}
        </span>
      ),
    },
    {
      key: 'pinned',
      header: t('announcements.columns.pinned'),
      render: (a) => (
        a.pinned ? (
          <StatusBadge status="settled" label={t('announcements.status.pinned')} />
        ) : (
          <span className="text-on-surface-variant">-</span>
        )
      ),
    },
    {
      key: 'readCount',
      header: t('announcements.columns.readCount'),
      render: (a) => (
        <span className="tabular-nums text-on-surface-variant whitespace-nowrap">
          {t('announcements.juristic.readCount', { count: a.readBy.length })}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('announcements.columns.status'),
      render: (a) => {
        const live = isLive(a, today)
        return (
          <StatusBadge
            status={live ? 'settled' : 'inactive'}
            label={live ? t('announcements.status.live') : t('announcements.status.expired')}
          />
        )
      },
    },
    {
      key: 'actions',
      header: t('announcements.columns.actions'),
      render: (a) => (
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            className="h-8 px-3 text-xs"
            aria-label={`${t('announcements.actions.edit')} ${a.code}`}
            onClick={() => setEditing(a)}
          >
            {t('announcements.actions.edit')}
          </Button>
          <Button
            variant="secondary"
            className="h-8 px-3 text-xs text-error hover:bg-error-container"
            aria-label={`${t('announcements.actions.delete')} ${a.code}`}
            onClick={() => setDeleting(a)}
          >
            {t('announcements.actions.delete')}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold leading-9 text-primary-container">
            {t('announcements.title')}
          </h1>
        </div>
        <Button onClick={() => setCreating(true)}>
          <span className="material-symbols-outlined text-lg" aria-hidden="true">
            add
          </span>
          {t('announcements.actions.create')}
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(['all', 'live', 'expired'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              filter === s
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
            }`}
          >
            {t(`announcements.filter.${s}`)}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={filteredAnnouncements}
        rowKey={(a) => a.id}
        emptyText={t('announcements.juristic.empty')}
      />

      {creating && <AnnouncementFormModal onClose={() => setCreating(false)} />}

      {editing && (
        <AnnouncementFormModal announcement={editing} onClose={() => setEditing(null)} />
      )}

      {deleting && (
        <DeleteAnnouncementDialog announcement={deleting} onClose={() => setDeleting(null)} />
      )}
    </section>
  )
}

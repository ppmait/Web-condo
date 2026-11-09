import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../../components/Modal'
import StatusBadge from '../../components/StatusBadge'
import { useFacilities } from '../../facilities/useFacilities'
import { formatDate } from '../../lib/format'
import HistoryTimeline from './HistoryTimeline'
import { bookingStatusBadge } from './statusBadges'

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`

interface Props {
  bookingId: string
  onClose(): void
  /** buttons for the person looking at it (cancel, confirm …); the dialog itself knows no roles */
  actions?: ReactNode
}

/** Mount it only while it is open. */
export default function BookingDetailModal({ bookingId, onClose, actions }: Props) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'th'
  const { data } = useFacilities()
  const booking = data.bookings.find((b) => b.id === bookingId)
  if (!booking) return null
  const facility = data.facilities.find((f) => f.id === booking.facilityId)
  const rejection = booking.status === 'rejected' ? booking.history.at(-1)?.note : ''
  const meta: [string, ReactNode][] = [
    [t('facilities.detail.facility'), facility ? t(`facilities.names.${facility.key}`) : '—'],
    [t('facilities.detail.when'), `${formatDate(booking.date, lang)} ${t('facilities.detail.time', { start: hh(booking.startHour), end: hh(booking.endHour) })}`],
    [t('facilities.detail.people'), t('facilities.tenant.people', { count: booking.people })],
    [t('facilities.detail.unit'), booking.unitCode],
    [t('facilities.detail.tenant'), booking.tenantName],
    [t('facilities.detail.status'), <StatusBadge key="s" status={bookingStatusBadge(booking.status)} label={t(`facilities.status.booking.${booking.status}`)} />],
    [t('facilities.detail.createdAt'), formatDate(booking.createdAt, lang)],
  ]
  return (
    <Modal open title={t('facilities.detail.title', { code: booking.code })} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1 text-sm">
          {meta.map(([label, value], i) => (
            <div key={i} className="contents">
              <dt className="text-on-surface-variant">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {rejection && <p className="text-sm text-error">{t('facilities.detail.reason', { reason: rejection })}</p>}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-primary-container">{t('facilities.detail.timeline')}</h3>
          <HistoryTimeline history={booking.history} label={(s) => t(`facilities.status.booking.${s}`)} badge={bookingStatusBadge} />
        </div>
        {actions && <div className="flex flex-wrap justify-end gap-2">{actions}</div>}
      </div>
    </Modal>
  )
}

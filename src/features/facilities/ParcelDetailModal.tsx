import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../../components/Modal'
import StatusBadge from '../../components/StatusBadge'
import { useFacilities } from '../../facilities/useFacilities'
import { formatDate } from '../../lib/format'
import HistoryTimeline from './HistoryTimeline'
import { parcelStatusBadge } from './statusBadges'

interface Props {
  parcelId: string
  onClose(): void
  /** buttons for the person looking at it (mark picked up …); the dialog itself knows no roles */
  actions?: ReactNode
}

/** Mount it only while it is open. */
export default function ParcelDetailModal({ parcelId, onClose, actions }: Props) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'th'
  const { data } = useFacilities()
  const parcel = data.parcels.find((p) => p.id === parcelId)
  if (!parcel) return null
  const meta: [string, ReactNode][] = [
    [t('facilities.parcelDetail.unit'), parcel.unitCode],
    [t('facilities.parcelDetail.tenant'), parcel.tenantName],
    [t('facilities.parcelDetail.carrier'), parcel.carrier],
    [t('facilities.parcelDetail.tracking'), parcel.trackingNo ?? t('facilities.parcelDetail.none')],
    [t('facilities.parcelDetail.location'), t(`facilities.location.${parcel.location}`)],
    [t('facilities.parcelDetail.status'), <StatusBadge key="s" status={parcelStatusBadge(parcel.status)} label={t(`facilities.status.parcel.${parcel.status}`)} />],
    [t('facilities.parcelDetail.arrivedOn'), formatDate(parcel.registeredAt, lang)],
  ]
  return (
    <Modal open title={t('facilities.parcelDetail.title', { code: parcel.code })} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1 text-sm">
          {meta.map(([label, value], i) => (
            <div key={i} className="contents">
              <dt className="text-on-surface-variant">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-primary-container">{t('facilities.detail.timeline')}</h3>
          <HistoryTimeline history={parcel.history} label={(s) => t(`facilities.status.parcel.${s}`)} badge={parcelStatusBadge} />
        </div>
        {actions && <div className="flex flex-wrap justify-end gap-2">{actions}</div>}
      </div>
    </Modal>
  )
}

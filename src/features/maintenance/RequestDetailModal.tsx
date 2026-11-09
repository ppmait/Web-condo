import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../../components/Modal'
import StatusBadge from '../../components/StatusBadge'
import { formatDate } from '../../lib/format'
import { useMaintenance } from '../../maintenance/useMaintenance'
import { requestBadge } from './statusBadges'
import Timeline from './Timeline'

interface Props {
  requestId: string
  onClose(): void
  /** buttons for the person looking at it (assign, start work …); the dialog itself knows no roles */
  actions?: ReactNode
}

/** Mount it only while it is open. */
export default function RequestDetailModal({ requestId, onClose, actions }: Props) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'th'
  const { data } = useMaintenance()
  const [large, setLarge] = useState<number | null>(null)
  const request = data.requests.find((r) => r.id === requestId)
  if (!request) return null

  const technician = data.technicians.find((x) => x.id === request.assigneeId)
  const big = large === null ? undefined : request.photos[large]
  const meta: [string, ReactNode][] = [
    [t('maintenance.detail.unit'), request.unitCode],
    [t('maintenance.detail.tenant'), request.tenantName],
    [t('maintenance.detail.category'), t(`maintenance.category.${request.category}`)],
    [t('maintenance.detail.status'), <StatusBadge key="s" status={requestBadge(request.status)} label={t(`maintenance.status.${request.status}`)} />],
    [t('maintenance.detail.createdAt'), formatDate(request.createdAt, lang)],
    [t('maintenance.detail.technician'), technician ? technician.name : t('maintenance.detail.none')],
  ]

  return (
    <Modal open title={t('maintenance.detail.title', { code: request.code })} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <p className="font-semibold text-primary-container">{request.title}</p>
          <p className="mt-1 whitespace-pre-line text-sm">{request.description}</p>
        </div>

        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1 text-sm">
          {meta.map(([label, value], i) => (
            <div key={i} className="contents">
              <dt className="text-on-surface-variant">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-primary-container">{t('maintenance.detail.photos')}</h3>
          <div className="flex flex-wrap gap-2">
            {request.photos.map((p, i) => (
              <button
                key={i}
                type="button"
                aria-label={t('maintenance.detail.viewPhoto', { name: p.name })}
                onClick={() => setLarge(i)}
                className="overflow-hidden rounded border border-[#cbd5e1]"
              >
                <img src={p.dataUrl} alt={p.name} className="h-20 w-24 object-cover" />
              </button>
            ))}
          </div>
          {big && <img src={big.dataUrl} alt={t('maintenance.detail.large', { name: big.name })} className="mt-3 max-h-72 w-full rounded border border-[#cbd5e1] object-contain" />}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-primary-container">{t('maintenance.detail.timeline')}</h3>
          <Timeline history={request.history} />
        </div>

        {actions && <div className="flex flex-wrap justify-end gap-2">{actions}</div>}
      </div>
    </Modal>
  )
}

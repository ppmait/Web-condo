import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { useAuth } from '../../auth/useAuth'
import Button from '../../components/Button'
import StatusBadge from '../../components/StatusBadge'
import { formatDate } from '../../lib/format'
import { canTechnicianUpdate, nextStatus } from '../../maintenance/rules'
import { useMaintenance } from '../../maintenance/useMaintenance'
import RequestDetailModal from './RequestDetailModal'
import { requestBadge } from './statusBadges'
import StatusUpdateDialog from './StatusUpdateDialog'

export default function TechnicianJobsPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'th'
  const { user } = useAuth()
  const { status, data } = useMaintenance()
  const [params, setParams] = useSearchParams()
  const [selected, setSelected] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)

  // the signed-in user is matched to a technician by phone number; no match means no jobs
  const me = data.technicians.find((x) => x.phone === (user?.phone ?? ''))
  const jobs = me
    ? data.requests
        .filter((r) => r.assigneeId === me.id)
        .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || b.createdAt.localeCompare(a.createdAt) || b.code.localeCompare(a.code))
    : []

  const wanted = params.get('request')
  const fromUrl = wanted && jobs.some((r) => r.id === wanted) ? wanted : null
  const activeId = selected ?? fromUrl

  // an ?request= that is not one of my jobs (or does not exist) is ignored and cleared from the address
  useEffect(() => {
    if (status === 'ready' && wanted && !fromUrl) setParams({}, { replace: true })
  }, [status, wanted, fromUrl, setParams])

  const closeDetail = () => {
    setSelected(null)
    if (wanted) setParams({}, { replace: true })
  }

  const detail = activeId ? jobs.find((r) => r.id === activeId) : undefined
  const toUpdate = updating ? jobs.find((r) => r.id === updating) : undefined
  const stepLabel = (next: ReturnType<typeof nextStatus>) => t(next === 'done' ? 'maintenance.technician.finish' : 'maintenance.technician.start')

  return (
    <section>
      <h1 className="text-[28px] font-semibold leading-9 text-primary-container">{t('nav.jobs')}</h1>

      {status === 'loading' && (
        <p role="status" className="mt-4 text-on-surface-variant">
          {t('maintenance.loading')}
        </p>
      )}
      {status === 'error' && (
        <p role="alert" className="mt-4 text-error">
          {t('maintenance.loadFailed')}
        </p>
      )}

      {status === 'ready' && jobs.length === 0 && <p className="mt-6 text-on-surface-variant">{t('maintenance.technician.empty')}</p>}

      {status === 'ready' && jobs.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {jobs.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-label={t('maintenance.technician.openJob', { code: r.code })}
              onClick={() => setSelected(r.id)}
              className="flex flex-col gap-2 rounded-xl border border-[#e2e8f0] bg-surface-container-lowest p-4 text-left shadow-sm hover:border-primary-container"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold text-primary-container">{r.code}</span>
                <StatusBadge status={requestBadge(r.status)} label={t(`maintenance.status.${r.status}`)} />
              </span>
              <span className="font-medium">{r.title}</span>
              <span className="text-sm text-on-surface-variant">
                <span>{r.unitCode}</span> · <span>{t(`maintenance.category.${r.category}`)}</span>
              </span>
              <span className="text-sm tabular-nums text-on-surface-variant">{formatDate(r.createdAt, lang)}</span>
            </button>
          ))}
        </div>
      )}

      {detail && (
        <RequestDetailModal
          key={detail.id}
          requestId={detail.id}
          onClose={closeDetail}
          actions={me && canTechnicianUpdate(detail, me) ? <Button onClick={() => setUpdating(detail.id)}>{stepLabel(nextStatus(detail.status))}</Button> : undefined}
        />
      )}
      {toUpdate && <StatusUpdateDialog key={toUpdate.id} request={toUpdate} onClose={() => setUpdating(null)} />}
    </section>
  )
}

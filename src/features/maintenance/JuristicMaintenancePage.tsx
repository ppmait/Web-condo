import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import Button from '../../components/Button'
import DataTable, { type Column } from '../../components/DataTable'
import KpiCard from '../../components/KpiCard'
import StatusBadge from '../../components/StatusBadge'
import { formatDate } from '../../lib/format'
import { canAssign } from '../../maintenance/rules'
import type { MaintenanceRequest, RequestStatus } from '../../maintenance/types'
import { useMaintenance } from '../../maintenance/useMaintenance'
import AssignDialog from './AssignDialog'
import RequestDetailModal from './RequestDetailModal'
import { requestBadge } from './statusBadges'

const STATUSES: RequestStatus[] = ['waiting', 'assigned', 'inProgress', 'done']
type Filter = 'all' | RequestStatus

export default function JuristicMaintenancePage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'th'
  const { status, data } = useMaintenance()
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [assigning, setAssigning] = useState<string | null>(null)

  const all = [...data.requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.code.localeCompare(a.code))
  const rows = filter === 'all' ? all : all.filter((r) => r.status === filter)

  const wanted = params.get('request')
  const fromUrl = wanted && data.requests.some((r) => r.id === wanted) ? wanted : null
  const activeId = selected ?? fromUrl

  // an ?request= that does not exist is ignored and cleared from the address
  useEffect(() => {
    if (status === 'ready' && wanted && !fromUrl) setParams({}, { replace: true })
  }, [status, wanted, fromUrl, setParams])

  const closeDetail = () => {
    setSelected(null)
    if (wanted) setParams({}, { replace: true })
  }

  const technicianName = (r: MaintenanceRequest) => data.technicians.find((x) => x.id === r.assigneeId)?.name ?? '—'
  const detail = activeId ? data.requests.find((r) => r.id === activeId) : undefined
  const toAssign = assigning ? data.requests.find((r) => r.id === assigning) : undefined

  const columns: Column<MaintenanceRequest>[] = [
    { key: 'code', header: t('maintenance.juristic.columns.code'), render: (r) => r.code },
    { key: 'unit', header: t('maintenance.juristic.columns.unit'), render: (r) => r.unitCode },
    { key: 'tenant', header: t('maintenance.juristic.columns.tenant'), render: (r) => r.tenantName },
    { key: 'category', header: t('maintenance.juristic.columns.category'), render: (r) => t(`maintenance.category.${r.category}`) },
    { key: 'title', header: t('maintenance.juristic.columns.title'), render: (r) => r.title },
    { key: 'technician', header: t('maintenance.juristic.columns.technician'), render: technicianName },
    { key: 'status', header: t('maintenance.juristic.columns.status'), render: (r) => <StatusBadge status={requestBadge(r.status)} label={t(`maintenance.status.${r.status}`)} /> },
    { key: 'date', header: t('maintenance.juristic.columns.date'), render: (r) => formatDate(r.createdAt, lang) },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <button
          type="button"
          aria-label={t('maintenance.juristic.viewDetail', { code: r.code })}
          onClick={() => setSelected(r.id)}
          className="text-sm font-medium text-primary-container underline-offset-2 hover:underline"
        >
          {t('maintenance.juristic.openDetail')}
        </button>
      ),
    },
  ]

  return (
    <section>
      <h1 className="text-[28px] font-semibold leading-9 text-primary-container">{t('nav.maintenance')}</h1>

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

      {status === 'ready' && (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {STATUSES.map((s) => (
              <KpiCard key={s} label={t(`maintenance.juristic.cards.${s}`)} value={String(data.requests.filter((r) => r.status === s).length)} />
            ))}
          </div>

          <div className="mt-8 flex justify-end">
            <label className="flex flex-col gap-1 text-sm font-medium text-on-surface">
              {t('maintenance.juristic.filter')}
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as Filter)}
                className="h-10 rounded border border-[#cbd5e1] bg-surface-container-lowest px-3 text-sm outline-none focus:border-primary-container"
              >
                <option value="all">{t('maintenance.juristic.filterAll')}</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`maintenance.status.${s}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4">
            <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} emptyText={t(all.length === 0 ? 'maintenance.juristic.empty' : 'maintenance.juristic.emptyFiltered')} />
          </div>
        </>
      )}

      {detail && (
        <RequestDetailModal
          key={detail.id}
          requestId={detail.id}
          onClose={closeDetail}
          actions={
            canAssign(detail) ? (
              <Button onClick={() => setAssigning(detail.id)}>{t(detail.status === 'waiting' ? 'maintenance.juristic.assign' : 'maintenance.juristic.reassign')}</Button>
            ) : undefined
          }
        />
      )}
      {toAssign && <AssignDialog key={toAssign.id} request={toAssign} onClose={() => setAssigning(null)} />}
    </section>
  )
}

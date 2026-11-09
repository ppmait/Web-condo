import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import Button from '../../components/Button'
import DataTable, { type Column } from '../../components/DataTable'
import StatusBadge from '../../components/StatusBadge'
import type { Parcel, ParcelStatus } from '../../facilities/types'
import { useFacilities } from '../../facilities/useFacilities'
import { formatDate } from '../../lib/format'
import ParcelDetailModal from './ParcelDetailModal'
import ParcelFormModal from './ParcelFormModal'
import PickupDialog from './PickupDialog'
import { parcelStatusBadge } from './statusBadges'

type Filter = 'all' | ParcelStatus

export default function ParcelsTab() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'th'
  const { status, data } = useFacilities()
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [registering, setRegistering] = useState(false)
  const [picking, setPicking] = useState<string | null>(null)

  const all = [...data.parcels].sort((a, b) => b.registeredAt.localeCompare(a.registeredAt) || b.code.localeCompare(a.code))
  const rows = filter === 'all' ? all : all.filter((p) => p.status === filter)

  const wanted = params.get('parcel')
  const fromUrl = wanted && data.parcels.some((p) => p.id === wanted) ? wanted : null
  const activeId = selected ?? fromUrl

  // a ?parcel= that does not exist is ignored and cleared from the address
  useEffect(() => {
    if (status === 'ready' && wanted && !fromUrl) setParams({}, { replace: true })
  }, [status, wanted, fromUrl, setParams])

  const closeDetail = () => {
    setSelected(null)
    if (wanted) setParams({}, { replace: true })
  }

  const detail = activeId ? data.parcels.find((p) => p.id === activeId) : undefined
  const toPick = picking ? data.parcels.find((p) => p.id === picking) : undefined

  const columns: Column<Parcel>[] = [
    { key: 'code', header: t('facilities.juristic.columns.code'), render: (p) => <span className="whitespace-nowrap">{p.code}</span> },
    { key: 'unit', header: t('facilities.juristic.columns.unit'), render: (p) => <span className="whitespace-nowrap">{p.unitCode}</span> },
    { key: 'tenant', header: t('facilities.juristic.columns.receiver'), render: (p) => p.tenantName },
    { key: 'carrier', header: t('facilities.juristic.columns.carrier'), render: (p) => p.carrier },
    { key: 'tracking', header: t('facilities.juristic.columns.tracking'), render: (p) => p.trackingNo ?? '—' },
    { key: 'place', header: t('facilities.juristic.columns.place'), render: (p) => t(`facilities.location.${p.location}`) },
    { key: 'arrived', header: t('facilities.juristic.columns.arrived'), render: (p) => formatDate(p.registeredAt, lang) },
    { key: 'status', header: t('facilities.juristic.columns.status'), render: (p) => <StatusBadge status={parcelStatusBadge(p.status)} label={t(`facilities.status.parcel.${p.status}`)} /> },
    {
      key: 'actions',
      header: '',
      render: (p) => (
        <button
          type="button"
          aria-label={t('facilities.juristic.viewDetail', { code: p.code })}
          onClick={() => setSelected(p.id)}
          className="whitespace-nowrap text-sm font-medium text-primary-container underline-offset-2 hover:underline"
        >
          {t('facilities.juristic.openDetail')}
        </button>
      ),
    },
  ]

  return (
    <div>
      {status === 'loading' && (
        <p role="status" className="text-on-surface-variant">
          {t('facilities.loading')}
        </p>
      )}
      {status === 'error' && (
        <p role="alert" className="text-error">
          {t('facilities.loadFailed')}
        </p>
      )}

      {status === 'ready' && (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <Button onClick={() => setRegistering(true)}>{t('facilities.juristic.parcels.register')}</Button>
            <label className="flex flex-col gap-1 text-sm font-medium text-on-surface">
              {t('facilities.juristic.filter')}
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as Filter)}
                className="h-10 rounded border border-[#cbd5e1] bg-surface-container-lowest px-3 text-sm outline-none focus:border-primary-container"
              >
                <option value="all">{t('facilities.juristic.filterAll')}</option>
                {(['waiting', 'pickedUp'] as const).map((s) => (
                  <option key={s} value={s}>
                    {t(`facilities.status.parcel.${s}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-4">
            <DataTable columns={columns} rows={rows} rowKey={(p) => p.id} emptyText={t(all.length === 0 ? 'facilities.juristic.parcels.empty' : 'facilities.juristic.emptyFiltered')} />
          </div>
        </>
      )}

      {registering && <ParcelFormModal onClose={() => setRegistering(false)} />}
      {detail && (
        <ParcelDetailModal
          key={`detail-${detail.id}`}
          parcelId={detail.id}
          onClose={closeDetail}
          actions={detail.status === 'waiting' ? <Button onClick={() => setPicking(detail.id)}>{t('facilities.juristic.parcels.pickup')}</Button> : undefined}
        />
      )}
      {toPick && <PickupDialog key={`pickup-${toPick.id}`} parcel={toPick} onClose={() => setPicking(null)} />}
    </div>
  )
}

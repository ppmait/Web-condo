import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import Button from '../../components/Button'
import DataTable, { type Column } from '../../components/DataTable'
import KpiCard from '../../components/KpiCard'
import StatusBadge from '../../components/StatusBadge'
import { canDecide } from '../../facilities/rules'
import type { Booking, BookingStatus, Facility } from '../../facilities/types'
import { useFacilities } from '../../facilities/useFacilities'
import { formatDate } from '../../lib/format'
import BookingDetailModal from './BookingDetailModal'
import DecideDialog from './DecideDialog'
import FacilityClosedDialog from './FacilityClosedDialog'
import { bookingStatusBadge } from './statusBadges'

const STATUSES: BookingStatus[] = ['pending', 'confirmed', 'rejected', 'cancelled']
type Filter = 'all' | BookingStatus
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`

export default function BookingsTab() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'th'
  const { status, data, today } = useFacilities()
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [deciding, setDeciding] = useState<{ id: string; decision: 'confirmed' | 'rejected' } | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  const all = [...data.bookings].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.code.localeCompare(a.code))
  const rows = filter === 'all' ? all : all.filter((b) => b.status === filter)
  const facilityName = (b: Booking) => {
    const f = data.facilities.find((x) => x.id === b.facilityId)
    return f ? t(`facilities.names.${f.key}`) : '—'
  }

  const wanted = params.get('booking')
  const fromUrl = wanted && data.bookings.some((b) => b.id === wanted) ? wanted : null
  const activeId = selected ?? fromUrl

  // a ?booking= that does not exist is ignored and cleared from the address
  useEffect(() => {
    if (status === 'ready' && wanted && !fromUrl) setParams({}, { replace: true })
  }, [status, wanted, fromUrl, setParams])

  const closeDetail = () => {
    setSelected(null)
    if (wanted) setParams({}, { replace: true })
  }

  const detail = activeId ? data.bookings.find((b) => b.id === activeId) : undefined
  const decidingBooking = deciding ? data.bookings.find((b) => b.id === deciding.id) : undefined
  const togglingFacility: Facility | undefined = toggling ? data.facilities.find((f) => f.id === toggling) : undefined

  const columns: Column<Booking>[] = [
    { key: 'code', header: t('facilities.juristic.columns.code'), render: (b) => <span className="whitespace-nowrap">{b.code}</span> },
    { key: 'facility', header: t('facilities.juristic.columns.facility'), render: facilityName },
    { key: 'unit', header: t('facilities.juristic.columns.unit'), render: (b) => <span className="whitespace-nowrap">{b.unitCode}</span> },
    { key: 'tenant', header: t('facilities.juristic.columns.tenant'), render: (b) => b.tenantName },
    { key: 'date', header: t('facilities.juristic.columns.date'), render: (b) => formatDate(b.date, lang) },
    { key: 'time', header: t('facilities.juristic.columns.when'), render: (b) => <span className="whitespace-nowrap">{t('facilities.detail.time', { start: hh(b.startHour), end: hh(b.endHour) })}</span> },
    { key: 'people', header: t('facilities.juristic.columns.people'), numeric: true, render: (b) => b.people },
    { key: 'status', header: t('facilities.juristic.columns.status'), render: (b) => <StatusBadge status={bookingStatusBadge(b.status)} label={t(`facilities.status.booking.${b.status}`)} /> },
    {
      key: 'actions',
      header: '',
      render: (b) => (
        <button
          type="button"
          aria-label={t('facilities.juristic.viewDetail', { code: b.code })}
          onClick={() => setSelected(b.id)}
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {STATUSES.map((s) => (
              <KpiCard key={s} label={t(`facilities.juristic.cards.${s}`)} value={String(data.bookings.filter((b) => b.status === s).length)} />
            ))}
          </div>

          <section aria-labelledby="facility-panel" className="mt-6">
            <h2 id="facility-panel" className="mb-2 text-lg font-semibold text-primary-container">
              {t('facilities.juristic.panel.title')}
            </h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {data.facilities.map((f) => {
                const name = t(`facilities.names.${f.key}`)
                return (
                  <li key={f.id} className="flex flex-col gap-2 rounded-lg border border-[#e2e8f0] bg-surface-container-lowest p-3">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium">{name}</span>
                      <StatusBadge status={f.closed ? 'critical' : 'settled'} label={t(f.closed ? 'facilities.tenant.closed' : 'facilities.tenant.open')} />
                    </span>
                    {f.closed && f.closedNote && <span className="text-xs text-on-surface-variant">{f.closedNote}</span>}
                    <Button
                      variant="secondary"
                      className="h-8 px-3"
                      aria-label={t(f.closed ? 'facilities.juristic.panel.open' : 'facilities.juristic.panel.close', { name })}
                      onClick={() => setToggling(f.id)}
                    >
                      {t(f.closed ? 'facilities.juristic.panel.openDo' : 'facilities.juristic.panel.closeDo')}
                    </Button>
                  </li>
                )
              })}
            </ul>
          </section>

          <div className="mt-8 flex justify-end">
            <label className="flex flex-col gap-1 text-sm font-medium text-on-surface">
              {t('facilities.juristic.filter')}
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as Filter)}
                className="h-10 rounded border border-[#cbd5e1] bg-surface-container-lowest px-3 text-sm outline-none focus:border-primary-container"
              >
                <option value="all">{t('facilities.juristic.filterAll')}</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`facilities.status.booking.${s}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4">
            <DataTable columns={columns} rows={rows} rowKey={(b) => b.id} emptyText={t(all.length === 0 ? 'facilities.tenant.empty' : 'facilities.juristic.emptyFiltered')} />
          </div>
        </>
      )}

      {detail && (
        <BookingDetailModal
          key={`detail-${detail.id}`}
          bookingId={detail.id}
          onClose={closeDetail}
          actions={
            canDecide(detail, today) ? (
              <>
                <Button variant="secondary" onClick={() => setDeciding({ id: detail.id, decision: 'rejected' })}>
                  {t('facilities.juristic.reject')}
                </Button>
                <Button onClick={() => setDeciding({ id: detail.id, decision: 'confirmed' })}>{t('facilities.juristic.confirm')}</Button>
              </>
            ) : undefined
          }
        />
      )}
      {deciding && decidingBooking && <DecideDialog key={`${deciding.decision}-${deciding.id}`} booking={decidingBooking} decision={deciding.decision} onClose={() => setDeciding(null)} />}
      {togglingFacility && <FacilityClosedDialog key={`facility-${togglingFacility.id}`} facility={togglingFacility} onClose={() => setToggling(null)} />}
    </div>
  )
}

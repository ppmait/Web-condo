import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { useAuth } from '../../auth/useAuth'
import Button from '../../components/Button'
import ConfirmDialog from '../../components/ConfirmDialog'
import StatusBadge from '../../components/StatusBadge'
import { MAX_AHEAD_DAYS, WEEKLY_QUOTA, canCancel, quotaUsed } from '../../facilities/rules'
import { FacilitiesError } from '../../facilities/types'
import { useFacilities } from '../../facilities/useFacilities'
import { formatDate } from '../../lib/format'
import { addDays } from '../../property/dates'
import { PropertyProvider } from '../../property/PropertyProvider'
import type { PropertyApi } from '../../property/types'
import { useProperty } from '../../property/useProperty'
import AvailabilityBar from './AvailabilityBar'
import BookingDetailModal from './BookingDetailModal'
import BookingFormModal from './BookingFormModal'
import { bookingStatusBadge } from './statusBadges'

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`

function CancelDialog({ bookingId, onClose }: { bookingId: string; onClose(): void }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'th'
  const { user } = useAuth()
  const { data, cancelBooking, reload } = useFacilities()
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const lock = useRef(false)
  const booking = data.bookings.find((b) => b.id === bookingId)
  if (!booking) return null
  const facility = data.facilities.find((f) => f.id === booking.facilityId)

  const confirm = async () => {
    if (lock.current) return
    lock.current = true
    setPending(true)
    setMessage(null)
    try {
      await cancelBooking(booking.id, user?.phone ?? '')
      onClose()
    } catch (err) {
      if (err instanceof FacilitiesError && (err.code === 'invalid_transition' || err.code === 'not_found')) {
        setMessage(t('facilities.cancel.stale'))
        void reload()
      } else if (err instanceof FacilitiesError && err.code === 'storage_failed') {
        setMessage(t('facilities.errors.storageFailed'))
      } else {
        setMessage(t('facilities.cancel.failed'))
      }
    } finally {
      lock.current = false
      setPending(false)
    }
  }

  return (
    <ConfirmDialog
      open
      title={t('facilities.cancel.title', { code: booking.code })}
      message={t('facilities.cancel.message', {
        facility: facility ? t(`facilities.names.${facility.key}`) : '',
        date: formatDate(booking.date, lang),
        time: `${hh(booking.startHour)}–${hh(booking.endHour)}`,
      })}
      confirmLabel={t('facilities.cancel.confirm')}
      danger
      pending={pending}
      onConfirm={() => void confirm()}
      onCancel={onClose}
    >
      {message && (
        <p role="alert" className="mt-2 text-sm text-error">
          {message}
        </p>
      )}
    </ConfirmDialog>
  )
}

function TenantFacilitiesContent() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'th'
  const { user } = useAuth()
  const { status, data, today } = useFacilities()
  const property = useProperty()
  const [params, setParams] = useSearchParams()
  const [selected, setSelected] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [booking, setBooking] = useState<{ facilityId: string } | null>(null)
  const [pickedDay, setPickedDay] = useState('')

  const phone = user?.phone ?? ''
  const mine = data.bookings
    .filter((b) => b.tenantPhone === phone)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.code.localeCompare(a.code))
  const lease = property.data.leases.find((l) => l.tenantPhone === phone && !l.cancelledAt && l.startDate <= today && today <= l.endDate)
  const days = today ? Array.from({ length: MAX_AHEAD_DAYS }, (_, i) => addDays(today, i + 1)) : []
  const day = days.includes(pickedDay) ? pickedDay : (days[0] ?? '')

  const wanted = params.get('booking')
  const fromUrl = wanted && mine.some((b) => b.id === wanted) ? wanted : null
  const activeId = selected ?? fromUrl

  // a ?booking= that is not one of mine (or does not exist) is ignored and cleared from the address
  useEffect(() => {
    if (status === 'ready' && wanted && !fromUrl) setParams({}, { replace: true })
  }, [status, wanted, fromUrl, setParams])

  const closeDetail = () => {
    setSelected(null)
    if (wanted) setParams({}, { replace: true })
  }

  const ready = status === 'ready' && property.status === 'ready'
  const detail = activeId ? mine.find((b) => b.id === activeId) : undefined

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] font-semibold leading-9 text-primary-container">{t('nav.facilities')}</h1>
        {ready && lease && <Button onClick={() => setBooking({ facilityId: '' })}>{t('facilities.tenant.book')}</Button>}
      </div>

      {(status === 'loading' || property.status === 'loading') && (
        <p role="status" className="mt-4 text-on-surface-variant">
          {t('facilities.loading')}
        </p>
      )}
      {(status === 'error' || property.status === 'error') && (
        <p role="alert" className="mt-4 text-error">
          {t('facilities.loadFailed')}
        </p>
      )}

      {ready && !lease && <p className="mt-4 rounded-lg border border-[#e2e8f0] bg-surface-container-lowest p-4 text-sm text-on-surface-variant">{t('facilities.tenant.noLease')}</p>}

      {ready && (
        <>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium text-on-surface">
              {t('facilities.tenant.pickDate')}
              <select
                value={day}
                onChange={(e) => setPickedDay(e.target.value)}
                className="h-10 rounded border border-[#cbd5e1] bg-surface-container-lowest px-3 text-sm outline-none focus:border-primary-container"
              >
                {days.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            {lease && day && (
              <p className="text-sm tabular-nums text-on-surface-variant">
                {t('facilities.tenant.quota', { used: quotaUsed(data.bookings, lease.unitId, day), max: WEEKLY_QUOTA })}
              </p>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {data.facilities.map((f) => (
              <article key={f.id} className="flex flex-col gap-3 rounded-xl border border-[#e2e8f0] bg-surface-container-lowest p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold text-primary-container">{t(`facilities.names.${f.key}`)}</h3>
                  <StatusBadge status={f.closed ? 'critical' : 'settled'} label={t(f.closed ? 'facilities.tenant.closed' : 'facilities.tenant.open')} />
                </div>
                <p className="text-sm text-on-surface-variant">{t('facilities.tenant.hours', { open: hh(f.openHour), close: hh(f.closeHour) })}</p>
                <p className="text-sm text-on-surface-variant">{t('facilities.tenant.capacity', { count: f.capacity })}</p>
                {f.closed ? (
                  f.closedNote && <p className="text-sm text-error">{f.closedNote}</p>
                ) : (
                  <>
                    {day && <AvailabilityBar facility={f} bookings={data.bookings} date={day} />}
                    {lease && (
                      <Button variant="secondary" aria-label={t('facilities.tenant.bookOf', { name: t(`facilities.names.${f.key}`) })} onClick={() => setBooking({ facilityId: f.id })}>
                        {t('facilities.tenant.bookThis')}
                      </Button>
                    )}
                  </>
                )}
              </article>
            ))}
          </div>

          <h2 className="mt-8 text-lg font-semibold text-primary-container">{t('facilities.tenant.mine')}</h2>
          {mine.length === 0 ? (
            <p className="mt-3 text-on-surface-variant">{t('facilities.tenant.empty')}</p>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {mine.map((b) => {
                const f = data.facilities.find((x) => x.id === b.facilityId)
                return (
                  <button
                    key={b.id}
                    type="button"
                    aria-label={t('facilities.tenant.openBooking', { code: b.code })}
                    onClick={() => setSelected(b.id)}
                    className="flex flex-col gap-2 rounded-xl border border-[#e2e8f0] bg-surface-container-lowest p-4 text-left shadow-sm hover:border-primary-container"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="whitespace-nowrap font-semibold text-primary-container">{b.code}</span>
                      <StatusBadge status={bookingStatusBadge(b.status)} label={t(`facilities.status.booking.${b.status}`)} />
                    </span>
                    <span className="font-medium">{f ? t(`facilities.names.${f.key}`) : '—'}</span>
                    <span className="text-sm tabular-nums text-on-surface-variant">{formatDate(b.date, lang)}</span>
                    <span className="text-sm tabular-nums text-on-surface-variant">{t('facilities.detail.time', { start: hh(b.startHour), end: hh(b.endHour) })}</span>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}

      {booking && <BookingFormModal facilityId={booking.facilityId} date={day} onClose={() => setBooking(null)} />}
      {detail && (
        <BookingDetailModal
          key={`detail-${detail.id}`}
          bookingId={detail.id}
          onClose={closeDetail}
          actions={canCancel(detail, today) ? <Button variant="secondary" onClick={() => setCancelling(detail.id)}>{t('facilities.cancel.open')}</Button> : undefined}
        />
      )}
      {cancelling && <CancelDialog key={`cancel-${cancelling}`} bookingId={cancelling} onClose={() => setCancelling(null)} />}
    </section>
  )
}

interface Props {
  /** injectable for tests; defaults to the local (localStorage) api */
  api?: PropertyApi
  today?: () => string
}

export default function TenantFacilitiesPage({ api, today }: Props = {}) {
  return (
    <PropertyProvider api={api} today={today}>
      <TenantFacilitiesContent />
    </PropertyProvider>
  )
}

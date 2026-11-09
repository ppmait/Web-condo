import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { useAuth } from '../../auth/useAuth'
import StatusBadge from '../../components/StatusBadge'
import type { Parcel } from '../../facilities/types'
import { useFacilities } from '../../facilities/useFacilities'
import { formatDate } from '../../lib/format'
import ParcelDetailModal from './ParcelDetailModal'
import { parcelStatusBadge } from './statusBadges'

export default function TenantParcelsPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'th'
  const { user } = useAuth()
  const { status, data } = useFacilities()
  const [params, setParams] = useSearchParams()
  const [selected, setSelected] = useState<string | null>(null)

  const mine = data.parcels
    .filter((p) => p.tenantPhone === (user?.phone ?? ''))
    .sort((a, b) => b.registeredAt.localeCompare(a.registeredAt) || b.code.localeCompare(a.code))
  const waiting = mine.filter((p) => p.status === 'waiting')
  const done = mine.filter((p) => p.status === 'pickedUp')

  const wanted = params.get('parcel')
  const fromUrl = wanted && mine.some((p) => p.id === wanted) ? wanted : null
  const activeId = selected ?? fromUrl

  // a ?parcel= that is not one of mine (or does not exist) is ignored and cleared from the address
  useEffect(() => {
    if (status === 'ready' && wanted && !fromUrl) setParams({}, { replace: true })
  }, [status, wanted, fromUrl, setParams])

  const closeDetail = () => {
    setSelected(null)
    if (wanted) setParams({}, { replace: true })
  }

  const card = (p: Parcel) => (
    <button
      key={p.id}
      type="button"
      aria-label={t('facilities.parcels.open', { code: p.code })}
      onClick={() => setSelected(p.id)}
      className="flex flex-col gap-2 rounded-xl border border-[#e2e8f0] bg-surface-container-lowest p-4 text-left shadow-sm hover:border-primary-container"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-semibold text-primary-container">{p.carrier}</span>
        <StatusBadge status={parcelStatusBadge(p.status)} label={t(`facilities.status.parcel.${p.status}`)} />
      </span>
      {p.trackingNo && <span className="text-sm tabular-nums text-on-surface-variant">{t('facilities.parcels.tracking', { no: p.trackingNo })}</span>}
      <span className="text-sm text-on-surface-variant">{t(`facilities.location.${p.location}`)}</span>
      <span className="text-sm tabular-nums text-on-surface-variant">{t('facilities.parcels.arrived', { date: formatDate(p.registeredAt, lang) })}</span>
      {p.status === 'pickedUp' && <span className="text-sm tabular-nums text-on-surface-variant">{t('facilities.parcels.pickedOn', { date: formatDate(p.history.at(-1)?.at ?? p.registeredAt, lang) })}</span>}
    </button>
  )

  return (
    <section>
      <h1 className="text-[28px] font-semibold leading-9 text-primary-container">{t('nav.parcels')}</h1>

      {status === 'loading' && (
        <p role="status" className="mt-4 text-on-surface-variant">
          {t('facilities.loading')}
        </p>
      )}
      {status === 'error' && (
        <p role="alert" className="mt-4 text-error">
          {t('facilities.loadFailed')}
        </p>
      )}

      {status === 'ready' && (
        <>
          <section aria-labelledby="parcels-waiting" className="mt-6">
            <h2 id="parcels-waiting" className="mb-3 text-lg font-semibold text-primary-container">
              {t('facilities.parcels.pending', { count: waiting.length })}
            </h2>
            {waiting.length === 0 ? <p className="text-on-surface-variant">{t('facilities.parcels.emptyPending')}</p> : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{waiting.map(card)}</div>}
          </section>

          <section aria-labelledby="parcels-done" className="mt-8">
            <h2 id="parcels-done" className="mb-3 text-lg font-semibold text-primary-container">
              {t('facilities.parcels.done')}
            </h2>
            {done.length === 0 ? <p className="text-on-surface-variant">{t('facilities.parcels.emptyDone')}</p> : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{done.map(card)}</div>}
          </section>
        </>
      )}

      {activeId && <ParcelDetailModal key={`detail-${activeId}`} parcelId={activeId} onClose={closeDetail} />}
    </section>
  )
}

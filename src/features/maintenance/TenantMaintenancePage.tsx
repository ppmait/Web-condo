import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { useAuth } from '../../auth/useAuth'
import Button from '../../components/Button'
import StatusBadge from '../../components/StatusBadge'
import { formatDate } from '../../lib/format'
import { useMaintenance } from '../../maintenance/useMaintenance'
import { PropertyProvider } from '../../property/PropertyProvider'
import type { PropertyApi } from '../../property/types'
import { useProperty } from '../../property/useProperty'
import RequestDetailModal from './RequestDetailModal'
import RequestFormModal from './RequestFormModal'
import { requestBadge } from './statusBadges'

function TenantMaintenanceContent() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'th'
  const { user } = useAuth()
  const { status, data, today } = useMaintenance()
  const property = useProperty()
  const [params, setParams] = useSearchParams()
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const phone = user?.phone ?? ''
  const mine = data.requests
    .filter((r) => r.tenantPhone === phone)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.code.localeCompare(a.code))
  const hasLease = property.data.leases.some((l) => l.tenantPhone === phone && !l.cancelledAt && l.startDate <= today && today <= l.endDate)

  const wanted = params.get('request')
  const fromUrl = wanted && mine.some((r) => r.id === wanted) ? wanted : null
  const activeId = selected ?? fromUrl

  // a ?request= that is not one of mine (or does not exist) is ignored and cleared from the address
  useEffect(() => {
    if (status === 'ready' && wanted && !fromUrl) setParams({}, { replace: true })
  }, [status, wanted, fromUrl, setParams])

  const close = () => {
    setSelected(null)
    if (wanted) setParams({}, { replace: true })
  }

  const ready = status === 'ready' && property.status === 'ready'

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] font-semibold leading-9 text-primary-container">{t('nav.maintenance')}</h1>
        {ready && hasLease && <Button onClick={() => setCreating(true)}>{t('maintenance.tenant.new')}</Button>}
      </div>

      {(status === 'loading' || property.status === 'loading') && (
        <p role="status" className="mt-4 text-on-surface-variant">
          {t('maintenance.loading')}
        </p>
      )}
      {(status === 'error' || property.status === 'error') && (
        <p role="alert" className="mt-4 text-error">
          {t('maintenance.loadFailed')}
        </p>
      )}

      {ready && !hasLease && <p className="mt-4 rounded-lg border border-[#e2e8f0] bg-surface-container-lowest p-4 text-sm text-on-surface-variant">{t('maintenance.tenant.noLease')}</p>}

      {ready && mine.length === 0 && <p className="mt-6 text-on-surface-variant">{t('maintenance.tenant.empty')}</p>}

      {ready && mine.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {mine.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-label={t('maintenance.tenant.openRequest', { code: r.code })}
              onClick={() => setSelected(r.id)}
              className="flex flex-col gap-2 rounded-xl border border-[#e2e8f0] bg-surface-container-lowest p-4 text-left shadow-sm hover:border-primary-container"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold text-primary-container">{r.code}</span>
                <StatusBadge status={requestBadge(r.status)} label={t(`maintenance.status.${r.status}`)} />
              </span>
              <span className="font-medium">{r.title}</span>
              <span className="text-sm text-on-surface-variant">{t(`maintenance.category.${r.category}`)}</span>
              <span className="text-sm tabular-nums text-on-surface-variant">{formatDate(r.createdAt, lang)}</span>
            </button>
          ))}
        </div>
      )}

      {creating && <RequestFormModal onClose={() => setCreating(false)} />}
      {activeId && <RequestDetailModal key={activeId} requestId={activeId} onClose={close} />}
    </section>
  )
}

interface Props {
  /** injectable for tests; defaults to the local (localStorage) api */
  api?: PropertyApi
  today?: () => string
}

export default function TenantMaintenancePage({ api, today }: Props = {}) {
  return (
    <PropertyProvider api={api} today={today}>
      <TenantMaintenanceContent />
    </PropertyProvider>
  )
}

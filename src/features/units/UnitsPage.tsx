import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router'
import KpiCard from '../../components/KpiCard'
import { PropertyProvider } from '../../property/PropertyProvider'
import type { PropertyApi } from '../../property/types'
import { useProperty } from '../../property/useProperty'

const TABS = [
  { to: '/juristic/units', key: 'units', end: true },
  { to: '/juristic/units/leases', key: 'leases', end: false },
  { to: '/juristic/units/inspections', key: 'inspections', end: false },
] as const

function UnitsPageContent() {
  const { t } = useTranslation()
  const { status, summary } = useProperty()

  return (
    <section>
      <h1 className="text-[28px] font-semibold leading-9 text-primary-container">{t('nav.units')}</h1>

      {status === 'loading' && (
        <p role="status" className="mt-4 text-on-surface-variant">
          {t('property.loading')}
        </p>
      )}
      {status === 'error' && (
        <p role="alert" className="mt-4 text-error">
          {t('property.loadFailed')}
        </p>
      )}

      {status === 'ready' && (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label={t('property.summary.total')} value={String(summary.totalUnits)} />
            <KpiCard label={t('property.summary.vacant')} value={String(summary.vacantUnits)} />
            <KpiCard label={t('property.summary.expiring')} value={String(summary.expiringLeases)} />
            <KpiCard label={t('property.summary.awaitingMoveIn')} value={String(summary.awaitingMoveIn)} />
          </div>

          <nav aria-label={t('property.tabs.label')} className="mt-8 flex gap-1 overflow-x-auto border-b border-[#e2e8f0]">
            {TABS.map((tab) => (
              <NavLink
                key={tab.key}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-semibold ${
                    isActive
                      ? 'border-primary-container text-primary-container'
                      : 'border-transparent text-on-surface-variant hover:text-on-surface'
                  }`
                }
              >
                {t(`property.tabs.${tab.key}`)}
              </NavLink>
            ))}
          </nav>

          <div className="mt-6">
            <Outlet />
          </div>
        </>
      )}
    </section>
  )
}

interface Props {
  /** injectable for tests; defaults to the local (localStorage) api */
  api?: PropertyApi
  today?: () => string
}

export default function UnitsPage({ api, today }: Props = {}) {
  return (
    <PropertyProvider api={api} today={today}>
      <UnitsPageContent />
    </PropertyProvider>
  )
}

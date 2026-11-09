import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router'
import { PropertyProvider } from '../../property/PropertyProvider'
import type { PropertyApi } from '../../property/types'

const TABS = [
  { to: '/juristic/parcels-bookings', key: 'bookings', end: true },
  { to: '/juristic/parcels-bookings/parcels', key: 'parcels', end: false },
] as const

interface Props {
  /** injectable for tests; defaults to the local (localStorage) api */
  api?: PropertyApi
  today?: () => string
}

export default function JuristicFacilitiesPage({ api, today }: Props = {}) {
  const { t } = useTranslation()
  return (
    <PropertyProvider api={api} today={today}>
      <section>
        <h1 className="text-[28px] font-semibold leading-9 text-primary-container">{t('nav.parcelsBookings')}</h1>
        <nav aria-label={t('facilities.juristic.tabs.label')} className="mt-6 flex gap-1 overflow-x-auto border-b border-[#e2e8f0]">
          {TABS.map((tab) => (
            <NavLink
              key={tab.key}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-semibold ${isActive ? 'border-primary-container text-primary-container' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`
              }
            >
              {t(`facilities.juristic.tabs.${tab.key}`)}
            </NavLink>
          ))}
        </nav>
        <div className="mt-6">
          <Outlet />
        </div>
      </section>
    </PropertyProvider>
  )
}

import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useSearchParams } from 'react-router'
import KpiCard from '../../components/KpiCard'
import { formatBaht, formatPeriod } from '../../lib/format'
import { addMonths, isValidPeriod, periodOf } from '../../billing/periods'
import { summarize } from '../../billing/rules'
import { useBilling } from '../../billing/useBilling'
import { PropertyProvider } from '../../property/PropertyProvider'
import type { PropertyApi } from '../../property/types'
import { useProperty } from '../../property/useProperty'

const TABS = [
  { to: '/juristic/billing', key: 'readings', end: true },
  { to: '/juristic/billing/invoices', key: 'invoices', end: false },
  { to: '/juristic/billing/slips', key: 'slips', end: false },
  { to: '/juristic/billing/rates', key: 'rates', end: false },
] as const

function BillingPageContent() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'th'
  const property = useProperty()
  const billing = useBilling()
  const [params, setParams] = useSearchParams()

  const requested = params.get('period')
  const explicit = requested !== null && isValidPeriod(requested) ? requested : null
  const ready = property.status === 'ready' && billing.status === 'ready'
  const period = explicit ?? periodOf(billing.today || property.today)
  const goto = (p: string) => setParams({ period: p }, { replace: true })
  const search = explicit ? `?period=${explicit}` : ''

  return (
    <section>
      <h1 className="text-[28px] font-semibold leading-9 text-primary-container">{t('nav.billing')}</h1>

      {(property.status === 'loading' || billing.status === 'loading') && (
        <p role="status" className="mt-4 text-on-surface-variant">
          {t('billing.loading')}
        </p>
      )}
      {(property.status === 'error' || billing.status === 'error') && (
        <p role="alert" className="mt-4 text-error">
          {t('billing.loadFailed')}
        </p>
      )}

      {ready && (
        <>
          <div role="group" aria-label={t('billing.page.periodNav')} className="mt-4 flex items-center gap-2">
            <button
              type="button"
              aria-label={t('billing.page.prev')}
              onClick={() => goto(addMonths(period, -1))}
              className="rounded p-1 text-primary-container hover:bg-surface-container-low"
            >
              <span className="material-symbols-outlined" aria-hidden="true">chevron_left</span>
            </button>
            <p aria-live="polite" className="min-w-40 text-center text-lg font-semibold text-primary-container">
              {formatPeriod(period, lang)}
            </p>
            <button
              type="button"
              aria-label={t('billing.page.next')}
              onClick={() => goto(addMonths(period, 1))}
              className="rounded p-1 text-primary-container hover:bg-surface-container-low"
            >
              <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
            </button>
          </div>

          <SummaryCards period={period} />

          <nav aria-label={t('billing.tabs.label')} className="mt-8 flex gap-1 overflow-x-auto border-b border-[#e2e8f0]">
            {TABS.map((tab) => (
              <NavLink
                key={tab.key}
                to={`${tab.to}${search}`}
                end={tab.end}
                className={({ isActive }) =>
                  `-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-semibold ${
                    isActive ? 'border-primary-container text-primary-container' : 'border-transparent text-on-surface-variant hover:text-on-surface'
                  }`
                }
              >
                {t(`billing.tabs.${tab.key}`)}
              </NavLink>
            ))}
          </nav>

          <div className="mt-6">
            <Outlet context={{ period }} />
          </div>
        </>
      )}
    </section>
  )
}

function SummaryCards({ period }: { period: string }) {
  const { t } = useTranslation()
  const { data: property } = useProperty()
  const { data, today } = useBilling()
  const s = summarize(data, property, period, today)
  return (
    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <KpiCard label={t('billing.summary.billed')} value={formatBaht(s.billed)} />
      <KpiCard label={t('billing.summary.paid')} value={formatBaht(s.paid)} />
      <KpiCard label={t('billing.summary.outstanding')} value={formatBaht(s.outstanding)} />
      <KpiCard label={t('billing.summary.pendingSlips')} value={String(s.pendingSlips)} />
      <KpiCard label={t('billing.summary.awaitingReadings')} value={String(s.awaitingReadings)} />
    </div>
  )
}

interface Props {
  /** injectable for tests; defaults to the local (localStorage) api */
  api?: PropertyApi
  today?: () => string
}

export default function BillingPage({ api, today }: Props = {}) {
  return (
    <PropertyProvider api={api} today={today}>
      <BillingPageContent />
    </PropertyProvider>
  )
}

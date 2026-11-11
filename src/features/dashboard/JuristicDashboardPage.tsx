import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useProperty } from '../../property/useProperty'
import { useBilling } from '../../billing/useBilling'
import { useFacilities } from '../../facilities/useFacilities'
import { useMaintenance } from '../../maintenance/useMaintenance'
import { useAnnouncements } from '../../announcements/useAnnouncements'
import { invoiceStatus } from '../../billing/rules'
import { isLive } from '../../announcements/rules'
import { formatBaht, formatDate } from '../../lib/format'
import KpiCard from '../../components/KpiCard'
import StatusBadge from '../../components/StatusBadge'
import { announcementBadge } from '../announcements/categoryBadges'

export default function JuristicDashboardPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'th'

  const { data: propertyData } = useProperty()
  const { data: billingData, today: billingToday } = useBilling()
  const { data: facilitiesData } = useFacilities()
  const { data: maintenanceData } = useMaintenance()
  const { data: announcementsData, today: announcementsToday } = useAnnouncements()

  // 1. Occupancy calculations
  const totalUnits = propertyData.units.length
  const activeLeases = propertyData.leases.filter((l) => !l.cancelledAt)
  const rentedUnitsCount = propertyData.units.filter((u) =>
    activeLeases.some((l) => l.unitId === u.id),
  ).length
  const ownerOccupiedCount = propertyData.units.filter(
    (u) => u.ownership === 'ownerOccupied' && !u.closed,
  ).length
  const vacantCount = Math.max(0, totalUnits - rentedUnitsCount - ownerOccupiedCount)
  const occupancyRate = totalUnits > 0
    ? Math.round(((rentedUnitsCount + ownerOccupiedCount) / totalUnits) * 100)
    : 0

  // 2. Billing calculations
  const unpaidInvoices = billingData.invoices.filter(
    (i) => invoiceStatus(i, billingToday) !== 'paid',
  )
  const unpaidTotal = unpaidInvoices.reduce((sum, i) => sum + i.total, 0)

  // 3. Pending slips
  interface PendingSlipItem {
    invoiceId: string
    unitCode: string
    tenantName: string
    submittedAt: string
    amount: number
  }
  const pendingSlips: PendingSlipItem[] = []
  for (const inv of billingData.invoices) {
    for (const slip of inv.slips) {
      if (slip.status === 'pending') {
        pendingSlips.push({
          invoiceId: inv.id,
          unitCode: inv.unitCode,
          tenantName: inv.tenantName,
          submittedAt: slip.submittedAt,
          amount: inv.total,
        })
      }
    }
  }

  // 4. Maintenance
  const waitingRequests = maintenanceData.requests.filter((r) => r.status === 'waiting')
  const inProgressRequests = maintenanceData.requests.filter(
    (r) => r.status === 'inProgress' || r.status === 'assigned',
  )

  // 5. Parcels
  const waitingParcels = facilitiesData.parcels.filter((p) => p.status === 'waiting')

  // 6. Announcements
  const recentAnnouncements = announcementsData.announcements
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3)

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold leading-9 text-primary-container">
            {t('nav.dashboard')}
          </h1>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label={t('dashboard.kpis.occupancy')}
          value={`${occupancyRate}%`}
          delta={{
            trend: occupancyRate >= 80 ? 'up' : 'flat',
            text: t('dashboard.kpis.occupancyDetail', {
              rented: rentedUnitsCount,
              owner: ownerOccupiedCount,
              vacant: vacantCount,
            }),
          }}
        />
        <KpiCard
          label={t('dashboard.kpis.unpaidInvoices')}
          value={formatBaht(unpaidTotal)}
          delta={{
            trend: unpaidInvoices.length > 0 ? 'down' : 'flat',
            text: t('dashboard.kpis.unpaidDetail', { count: unpaidInvoices.length }),
          }}
        />
        <KpiCard
          label={t('dashboard.kpis.pendingSlips')}
          value={String(pendingSlips.length)}
          delta={{
            trend: pendingSlips.length > 0 ? 'up' : 'flat',
            text: t('dashboard.kpis.pendingSlipsDetail', { count: pendingSlips.length }),
          }}
        />
        <KpiCard
          label={t('dashboard.kpis.pendingRepairs')}
          value={String(waitingRequests.length + inProgressRequests.length)}
          delta={{
            trend: waitingRequests.length > 0 ? 'up' : 'flat',
            text: t('dashboard.kpis.pendingRepairsDetail', {
              waiting: waitingRequests.length,
              progress: inProgressRequests.length,
            }),
          }}
        />
        <KpiCard
          label={t('dashboard.kpis.waitingParcels')}
          value={String(waitingParcels.length)}
          delta={{
            trend: 'flat',
            text: t('dashboard.kpis.waitingParcelsDetail', { count: waitingParcels.length }),
          }}
        />
      </div>

      {/* Quick Navigation Cards */}
      <div className="rounded-xl border border-[#e2e8f0] bg-surface-container-lowest p-5 shadow-sm">
        <h2 className="text-base font-semibold text-primary-container">
          {t('dashboard.quickActions')}
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Link
            to="/juristic/units"
            className="flex flex-col items-center gap-2 rounded-lg border border-[#e2e8f0] p-4 text-center transition hover:border-primary-container hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined text-2xl text-primary-container" aria-hidden="true">
              apartment
            </span>
            <span className="text-xs font-medium text-on-surface">
              {t('dashboard.actions.units')}
            </span>
          </Link>
          <Link
            to="/juristic/billing"
            className="flex flex-col items-center gap-2 rounded-lg border border-[#e2e8f0] p-4 text-center transition hover:border-primary-container hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined text-2xl text-primary-container" aria-hidden="true">
              receipt_long
            </span>
            <span className="text-xs font-medium text-on-surface">
              {t('dashboard.actions.billing')}
            </span>
          </Link>
          <Link
            to="/juristic/maintenance"
            className="flex flex-col items-center gap-2 rounded-lg border border-[#e2e8f0] p-4 text-center transition hover:border-primary-container hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined text-2xl text-primary-container" aria-hidden="true">
              build
            </span>
            <span className="text-xs font-medium text-on-surface">
              {t('dashboard.actions.maintenance')}
            </span>
          </Link>
          <Link
            to="/juristic/parcels-bookings"
            className="flex flex-col items-center gap-2 rounded-lg border border-[#e2e8f0] p-4 text-center transition hover:border-primary-container hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined text-2xl text-primary-container" aria-hidden="true">
              package_2
            </span>
            <span className="text-xs font-medium text-on-surface">
              {t('dashboard.actions.parcels')}
            </span>
          </Link>
          <Link
            to="/juristic/announcements"
            className="flex flex-col items-center gap-2 rounded-lg border border-[#e2e8f0] p-4 text-center transition hover:border-primary-container hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined text-2xl text-primary-container" aria-hidden="true">
              campaign
            </span>
            <span className="text-xs font-medium text-on-surface">
              {t('dashboard.actions.announcements')}
            </span>
          </Link>
          <Link
            to="/juristic/reports"
            className="flex flex-col items-center gap-2 rounded-lg border border-[#e2e8f0] p-4 text-center transition hover:border-primary-container hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined text-2xl text-primary-container" aria-hidden="true">
              analytics
            </span>
            <span className="text-xs font-medium text-on-surface">
              {t('dashboard.actions.reports')}
            </span>
          </Link>
        </div>
      </div>

      {/* Two Column Layout for Action Required Items */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Slips Pending Review */}
        <div className="rounded-xl border border-[#e2e8f0] bg-surface-container-lowest p-5 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-[#f1f5f9]">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-lg text-primary-container" aria-hidden="true">
                mark_email_unread
              </span>
              <h2 className="font-semibold text-primary-container">
                {t('dashboard.recentSlips')}
              </h2>
            </div>
            <Link
              to="/juristic/billing/slips"
              className="text-xs font-semibold text-primary-container hover:underline"
            >
              {t('dashboard.viewAll')} →
            </Link>
          </div>
          <div className="mt-4">
            {pendingSlips.length === 0 ? (
              <p className="py-6 text-center text-sm text-on-surface-variant">
                {t('dashboard.noPendingSlips')}
              </p>
            ) : (
              <div className="divide-y divide-[#f1f5f9]">
                {pendingSlips.slice(0, 5).map((s, idx) => (
                  <div key={idx} className="flex items-center justify-between py-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-primary-container text-sm">
                          {s.unitCode}
                        </span>
                        <span className="text-xs text-on-surface">{s.tenantName}</span>
                      </div>
                      <span className="text-xs text-on-surface-variant">
                        {formatDate(s.submittedAt, lang)} · ฿{formatBaht(s.amount)}
                      </span>
                    </div>
                    <Link
                      to="/juristic/billing/slips"
                      className="rounded border border-[#cbd5e1] px-3 py-1 text-xs font-semibold text-primary-container hover:bg-[#f1f5f9]"
                    >
                      {t('dashboard.review')}
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Maintenance Awaiting Assignment */}
        <div className="rounded-xl border border-[#e2e8f0] bg-surface-container-lowest p-5 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-[#f1f5f9]">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-lg text-primary-container" aria-hidden="true">
                assignment_late
              </span>
              <h2 className="font-semibold text-primary-container">
                {t('dashboard.recentRepairs')}
              </h2>
            </div>
            <Link
              to="/juristic/maintenance"
              className="text-xs font-semibold text-primary-container hover:underline"
            >
              {t('dashboard.viewAll')} →
            </Link>
          </div>
          <div className="mt-4">
            {waitingRequests.length === 0 ? (
              <p className="py-6 text-center text-sm text-on-surface-variant">
                {t('dashboard.noPendingRepairs')}
              </p>
            ) : (
              <div className="divide-y divide-[#f1f5f9]">
                {waitingRequests.slice(0, 5).map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-3">
                    <div className="pr-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-primary-container text-sm">
                          {r.unitCode}
                        </span>
                        <span className="text-xs text-on-surface font-medium truncate max-w-[200px]">
                          {r.title}
                        </span>
                      </div>
                      <span className="text-xs text-on-surface-variant">
                        {r.code} · {formatDate(r.createdAt, lang)}
                      </span>
                    </div>
                    <Link
                      to={`/juristic/maintenance?request=${r.id}`}
                      className="shrink-0 rounded border border-[#cbd5e1] px-3 py-1 text-xs font-semibold text-primary-container hover:bg-[#f1f5f9]"
                    >
                      {t('dashboard.assign')}
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Announcements */}
      <div className="rounded-xl border border-[#e2e8f0] bg-surface-container-lowest p-5 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-[#f1f5f9]">
          <h2 className="font-semibold text-primary-container">
            {t('dashboard.recentAnnouncements')}
          </h2>
          <Link
            to="/juristic/announcements"
            className="text-xs font-semibold text-primary-container hover:underline"
          >
            {t('dashboard.viewAll')} →
          </Link>
        </div>
        <div className="mt-4 space-y-3">
          {recentAnnouncements.map((a) => {
            const live = isLive(a, announcementsToday)
            const badge = announcementBadge(a.category, t)
            return (
              <div
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#e2e8f0] p-4 transition hover:bg-surface-container-low"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-medium text-primary-container">
                    {a.code}
                  </span>
                  <StatusBadge status={badge.status} label={badge.label} />
                  <StatusBadge
                    status={live ? 'settled' : 'inactive'}
                    label={live ? t('announcements.status.live') : t('announcements.status.expired')}
                  />
                  <span className="text-sm font-medium text-on-surface">{a.title}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-on-surface-variant">
                  <span>{formatDate(a.createdAt, lang)}</span>
                  <span>{t('dashboard.readCount', { count: a.readBy.length })}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

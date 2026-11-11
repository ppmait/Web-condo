import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useAuth } from '../../auth/useAuth'
import { useProperty } from '../../property/useProperty'
import { useBilling } from '../../billing/useBilling'
import { useFacilities } from '../../facilities/useFacilities'
import { useMaintenance } from '../../maintenance/useMaintenance'
import { useAnnouncements } from '../../announcements/useAnnouncements'
import { invoiceStatus, tenantInvoices } from '../../billing/rules'
import { isLive } from '../../announcements/rules'
import { formatBaht, formatDate } from '../../lib/format'
import StatusBadge from '../../components/StatusBadge'
import { announcementBadge } from '../announcements/categoryBadges'
import AnnouncementDetailModal from '../announcements/AnnouncementDetailModal'

export default function TenantOverviewPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'th'
  const { user } = useAuth()
  const { data: propertyData, today: propertyToday } = useProperty()
  const { data: billingData, today: billingToday } = useBilling()
  const { data: facilitiesData, today: facilitiesToday } = useFacilities()
  const { data: maintenanceData } = useMaintenance()
  const { data: announcementsData, today: announcementsToday } = useAnnouncements()

  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState<string | null>(null)

  const phone = user?.phone ?? ''

  // Property / Lease info
  const activeLease = propertyData.leases.find(
    (l) => l.tenantPhone === phone && !l.cancelledAt && l.startDate <= propertyToday && propertyToday <= l.endDate,
  ) ?? propertyData.leases.find(
    (l) => l.tenantPhone === phone && !l.cancelledAt,
  )
  const unit = activeLease ? propertyData.units.find((u) => u.id === activeLease.unitId) : undefined
  const unitCode = unit?.code ?? ''

  // Billing
  const myInvoices = tenantInvoices(billingData.invoices, phone)
  const unpaidInvoices = myInvoices.filter(
    (i) => invoiceStatus(i, billingToday) !== 'paid',
  )
  const unpaidTotal = unpaidInvoices.reduce((sum, i) => sum + i.total, 0)
  const earliestDueInvoice = [...unpaidInvoices].sort((a, b) =>
    a.dueDate.localeCompare(b.dueDate),
  )[0]

  // Facilities & Parcels
  const myParcels = facilitiesData.parcels.filter(
    (p) => p.tenantPhone === phone && p.status === 'waiting',
  )
  const myUpcomingBookings = facilitiesData.bookings.filter(
    (b) =>
      b.tenantPhone === phone &&
      b.status === 'confirmed' &&
      b.date >= facilitiesToday,
  )

  // Maintenance
  const myActiveRequests = maintenanceData.requests.filter(
    (r) => r.tenantPhone === phone && r.status !== 'done',
  )

  // Announcements
  const liveAnnouncements = announcementsData.announcements
    .filter((a) => isLive(a, announcementsToday))
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return b.createdAt.localeCompare(a.createdAt)
    })
    .slice(0, 3)

  return (
    <section className="space-y-6">
      <h1 className="text-[28px] font-semibold leading-9 text-primary-container">
        {t('nav.overview')}
      </h1>

      {/* Welcome Banner */}
      <div className="rounded-xl border border-[#e2e8f0] bg-surface-container-lowest p-6 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-primary-container">
              {t('overview.welcome', { name: user?.fullName || 'Tenant' })}
            </h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              {unit
                ? t('overview.unitInfo', {
                    code: unit.code,
                    tower: unit.tower,
                    floor: unit.floor,
                  })
                : t('overview.unitInfo', {
                    code: unitCode || '—',
                    tower: '—',
                    floor: '—',
                  })}
            </p>
          </div>
          {activeLease ? (
            <div className="inline-flex items-center gap-2 rounded-lg bg-surface-container-low px-4 py-2 text-xs text-on-surface">
              <span className="material-symbols-outlined text-base text-primary-container" aria-hidden="true">
                verified
              </span>
              <span>
                {t('overview.leaseActive', {
                  start: formatDate(activeLease.startDate, lang),
                  end: formatDate(activeLease.endDate, lang),
                  rent: formatBaht(activeLease.monthlyRent),
                })}
              </span>
            </div>
          ) : (
            <div className="text-xs text-on-surface-variant">
              {t('overview.noLease')}
            </div>
          )}
        </div>
      </div>

      {/* KPI / Status Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Unpaid Bills */}
        <div className="flex flex-col justify-between rounded-lg border border-[#e2e8f0] bg-surface-container-lowest p-5 shadow-sm">
          <div>
            <div className="flex items-center justify-between text-on-surface-variant">
              <span className="text-xs font-medium">{t('overview.cards.unpaidBills')}</span>
              <span className="material-symbols-outlined text-xl text-primary" aria-hidden="true">
                receipt_long
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-primary-container">
              {unpaidInvoices.length > 0 ? formatBaht(unpaidTotal) : '฿0'}
            </p>
            <p className="mt-1 text-xs text-on-surface-variant">
              {earliestDueInvoice
                ? t('overview.unpaidDue', { due: formatDate(earliestDueInvoice.dueDate, lang) })
                : t('overview.noUnpaidBills')}
            </p>
          </div>
          <div className="mt-4 pt-2 border-t border-[#f1f5f9]">
            <Link
              to="/tenant/billing"
              className="text-xs font-semibold text-primary-container hover:underline"
            >
              {t('overview.payNow')} →
            </Link>
          </div>
        </div>

        {/* Waiting Parcels */}
        <div className="flex flex-col justify-between rounded-lg border border-[#e2e8f0] bg-surface-container-lowest p-5 shadow-sm">
          <div>
            <div className="flex items-center justify-between text-on-surface-variant">
              <span className="text-xs font-medium">{t('overview.cards.waitingParcels')}</span>
              <span className="material-symbols-outlined text-xl text-primary" aria-hidden="true">
                package_2
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-primary-container">
              {myParcels.length}
            </p>
            <p className="mt-1 text-xs text-on-surface-variant">
              {myParcels.length > 0
                ? `${myParcels.length} items waiting`
                : t('common.noData')}
            </p>
          </div>
          <div className="mt-4 pt-2 border-t border-[#f1f5f9]">
            <Link
              to="/tenant/parcels"
              className="text-xs font-semibold text-primary-container hover:underline"
            >
              {t('overview.viewParcels')} →
            </Link>
          </div>
        </div>

        {/* Active Repairs */}
        <div className="flex flex-col justify-between rounded-lg border border-[#e2e8f0] bg-surface-container-lowest p-5 shadow-sm">
          <div>
            <div className="flex items-center justify-between text-on-surface-variant">
              <span className="text-xs font-medium">{t('overview.cards.activeRepairs')}</span>
              <span className="material-symbols-outlined text-xl text-primary" aria-hidden="true">
                build
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-primary-container">
              {myActiveRequests.length}
            </p>
            <p className="mt-1 text-xs text-on-surface-variant">
              {myActiveRequests.length > 0
                ? `${myActiveRequests.length} in progress`
                : t('common.noData')}
            </p>
          </div>
          <div className="mt-4 pt-2 border-t border-[#f1f5f9]">
            <Link
              to="/tenant/maintenance"
              className="text-xs font-semibold text-primary-container hover:underline"
            >
              {t('overview.viewRepairs')} →
            </Link>
          </div>
        </div>

        {/* Upcoming Bookings */}
        <div className="flex flex-col justify-between rounded-lg border border-[#e2e8f0] bg-surface-container-lowest p-5 shadow-sm">
          <div>
            <div className="flex items-center justify-between text-on-surface-variant">
              <span className="text-xs font-medium">{t('overview.cards.upcomingBookings')}</span>
              <span className="material-symbols-outlined text-xl text-primary" aria-hidden="true">
                event_available
              </span>
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-primary-container">
              {myUpcomingBookings.length}
            </p>
            <p className="mt-1 text-xs text-on-surface-variant">
              {myUpcomingBookings.length > 0
                ? `${myUpcomingBookings.length} confirmed`
                : t('common.noData')}
            </p>
          </div>
          <div className="mt-4 pt-2 border-t border-[#f1f5f9]">
            <Link
              to="/tenant/facilities"
              className="text-xs font-semibold text-primary-container hover:underline"
            >
              {t('overview.viewBookings')} →
            </Link>
          </div>
        </div>
      </div>

      {/* Quick Actions & Announcements Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Latest Announcements (2 cols on large screen) */}
        <div className="rounded-xl border border-[#e2e8f0] bg-surface-container-lowest p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between pb-3 border-b border-[#f1f5f9]">
            <h2 className="font-semibold text-primary-container">
              {t('overview.announcementsTitle')}
            </h2>
            <Link
              to="/tenant/announcements"
              className="text-xs font-semibold text-primary-container hover:underline"
            >
              {t('overview.viewAllAnnouncements')} →
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {liveAnnouncements.length === 0 ? (
              <p className="py-6 text-center text-sm text-on-surface-variant">
                {t('overview.noAnnouncements')}
              </p>
            ) : (
              liveAnnouncements.map((a) => {
                const badge = announcementBadge(a.category, t)
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setSelectedAnnouncementId(a.id)}
                    className="w-full text-left rounded-lg border border-[#e2e8f0] p-4 transition hover:border-primary-container hover:bg-surface-container-low"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {a.pinned && (
                          <StatusBadge
                            status="settled"
                            label={t('announcements.status.pinned')}
                          />
                        )}
                        <StatusBadge status={badge.status} label={badge.label} />
                        <h3 className="font-medium text-on-surface">{a.title}</h3>
                      </div>
                      <span className="text-xs text-on-surface-variant">
                        {formatDate(a.createdAt, lang)}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs text-on-surface-variant leading-relaxed">
                      {a.body}
                    </p>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Quick Actions (1 col on large screen) */}
        <div className="flex flex-col justify-between rounded-xl border border-[#e2e8f0] bg-surface-container-lowest p-5 shadow-sm">
          <div>
            <h2 className="font-semibold text-primary-container pb-3 border-b border-[#f1f5f9]">
              {t('overview.quickActions')}
            </h2>
            <div className="mt-4 space-y-2">
              <Link
                to="/tenant/maintenance"
                className="flex items-center gap-3 rounded-lg border border-[#e2e8f0] p-3 text-sm font-medium text-on-surface transition hover:bg-surface-container-low hover:border-primary-container"
              >
                <span className="material-symbols-outlined text-primary-container" aria-hidden="true">
                  build
                </span>
                <span>{t('overview.newRepair')}</span>
              </Link>
              <Link
                to="/tenant/facilities"
                className="flex items-center gap-3 rounded-lg border border-[#e2e8f0] p-3 text-sm font-medium text-on-surface transition hover:bg-surface-container-low hover:border-primary-container"
              >
                <span className="material-symbols-outlined text-primary-container" aria-hidden="true">
                  event_available
                </span>
                <span>{t('overview.bookFacility')}</span>
              </Link>
              <Link
                to="/tenant/billing"
                className="flex items-center gap-3 rounded-lg border border-[#e2e8f0] p-3 text-sm font-medium text-on-surface transition hover:bg-surface-container-low hover:border-primary-container"
              >
                <span className="material-symbols-outlined text-primary-container" aria-hidden="true">
                  receipt_long
                </span>
                <span>{t('overview.viewBilling')}</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {selectedAnnouncementId && (
        <AnnouncementDetailModal
          announcementId={selectedAnnouncementId}
          onClose={() => setSelectedAnnouncementId(null)}
        />
      )}
    </section>
  )
}

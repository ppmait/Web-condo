import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProperty } from '../../property/useProperty'
import { useBilling } from '../../billing/useBilling'
import { useMaintenance } from '../../maintenance/useMaintenance'
import { invoiceStatus } from '../../billing/rules'
import type { Category } from '../../maintenance/types'
import { formatBaht, formatDate, formatPeriod } from '../../lib/format'
import Button from '../../components/Button'
import DataTable, { type Column } from '../../components/DataTable'
import KpiCard from '../../components/KpiCard'
import StatusBadge from '../../components/StatusBadge'

type TabKey = 'financial' | 'maintenance' | 'occupancy'

export default function JuristicReportsPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'th'

  const [activeTab, setActiveTab] = useState<TabKey>('financial')
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all')

  const { data: propertyData } = useProperty()
  const { data: billingData, today: billingToday } = useBilling()
  const { data: maintenanceData } = useMaintenance()

  // --- Financial calculations ---
  const allPeriods = Array.from(new Set(billingData.invoices.map((i) => i.period))).sort(
    (a, b) => b.localeCompare(a),
  )

  const filteredInvoices =
    selectedPeriod === 'all'
      ? billingData.invoices
      : billingData.invoices.filter((i) => i.period === selectedPeriod)

  const isInvoicePaid = (i: typeof billingData.invoices[0]) =>
    invoiceStatus(i, billingToday) === 'paid'

  const totalBilled = filteredInvoices.reduce((sum, i) => sum + i.total, 0)
  const totalCollected = filteredInvoices
    .filter(isInvoicePaid)
    .reduce((sum, i) => sum + i.total, 0)
  const totalOutstanding = Math.max(0, totalBilled - totalCollected)
  const collectionRate =
    totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0

  const waterRevenue = filteredInvoices
    .filter(isInvoicePaid)
    .reduce((sum, i) => sum + i.water.amount, 0)
  const electricRevenue = filteredInvoices
    .filter(isInvoicePaid)
    .reduce((sum, i) => sum + i.electric.amount, 0)
  const commonRevenue = filteredInvoices
    .filter(isInvoicePaid)
    .reduce((sum, i) => sum + i.common.amount, 0)

  interface PeriodSummaryRow {
    period: string
    totalBilled: number
    collected: number
    pending: number
    rate: number
  }

  const periodRows: PeriodSummaryRow[] = (selectedPeriod === 'all' ? allPeriods : [selectedPeriod])
    .filter(Boolean)
    .map((period) => {
      const invs = billingData.invoices.filter((i) => i.period === period)
      const billed = invs.reduce((s, i) => s + i.total, 0)
      const paid = invs.filter(isInvoicePaid).reduce((s, i) => s + i.total, 0)
      const pending = Math.max(0, billed - paid)
      const rate = billed > 0 ? Math.round((paid / billed) * 100) : 0
      return { period, totalBilled: billed, collected: paid, pending, rate }
    })

  const financialColumns: Column<PeriodSummaryRow>[] = [
    {
      key: 'period',
      header: t('reports.financial.periodCol'),
      render: (r) => (
        <span className="font-semibold text-primary-container">
          {formatPeriod(r.period, lang)}
        </span>
      ),
    },
    {
      key: 'totalBilled',
      header: t('reports.financial.totalBilled'),
      numeric: true,
      render: (r) => formatBaht(r.totalBilled),
    },
    {
      key: 'collected',
      header: t('reports.financial.collected'),
      numeric: true,
      render: (r) => (
        <span className="font-medium text-[#0d9488]">{formatBaht(r.collected)}</span>
      ),
    },
    {
      key: 'pending',
      header: t('reports.financial.pending'),
      numeric: true,
      render: (r) => (
        <span className={r.pending > 0 ? 'font-medium text-error' : ''}>
          {formatBaht(r.pending)}
        </span>
      ),
    },
    {
      key: 'rate',
      header: t('reports.financial.collectionRate'),
      numeric: true,
      render: (r) => (
        <StatusBadge
          status={r.rate >= 90 ? 'settled' : r.rate >= 60 ? 'pending' : 'critical'}
          label={`${r.rate}%`}
        />
      ),
    },
  ]

  // --- Maintenance calculations ---
  const allRequests = maintenanceData.requests
  const completedRequests = allRequests.filter((r) => r.status === 'done')
  const pendingRequests = allRequests.filter(
    (r) => r.status === 'waiting' || r.status === 'assigned' || r.status === 'inProgress',
  )
  const maintenanceCompletionRate =
    allRequests.length > 0
      ? Math.round((completedRequests.length / allRequests.length) * 100)
      : 0

  const CATEGORIES: Category[] = [
    'electrical',
    'plumbing',
    'airConditioning',
    'furniture',
    'other',
  ]

  interface CategorySummaryRow {
    category: Category
    total: number
    done: number
    inProgress: number
    rate: number
  }

  const categoryRows: CategorySummaryRow[] = CATEGORIES.map((cat) => {
    const reqs = allRequests.filter((r) => r.category === cat)
    const done = reqs.filter((r) => r.status === 'done').length
    const inProgress = reqs.filter((r) => r.status !== 'done').length
    const rate = reqs.length > 0 ? Math.round((done / reqs.length) * 100) : 0
    return { category: cat, total: reqs.length, done, inProgress, rate }
  })

  const maintenanceColumns: Column<CategorySummaryRow>[] = [
    {
      key: 'category',
      header: t('reports.maintenance.categoryCol'),
      render: (r) => (
        <span className="font-semibold text-primary-container">
          {t(`maintenance.category.${r.category}`)}
        </span>
      ),
    },
    {
      key: 'total',
      header: t('reports.maintenance.totalCol'),
      numeric: true,
      render: (r) => r.total,
    },
    {
      key: 'done',
      header: t('reports.maintenance.doneCol'),
      numeric: true,
      render: (r) => <span className="text-[#0d9488] font-medium">{r.done}</span>,
    },
    {
      key: 'inProgress',
      header: t('reports.maintenance.inProgressCol'),
      numeric: true,
      render: (r) => (
        <span className={r.inProgress > 0 ? 'text-on-surface' : 'text-on-surface-variant'}>
          {r.inProgress}
        </span>
      ),
    },
    {
      key: 'rate',
      header: t('reports.maintenance.rateCol'),
      numeric: true,
      render: (r) => (
        <StatusBadge
          status={r.rate >= 80 ? 'settled' : r.rate >= 50 ? 'pending' : 'inactive'}
          label={`${r.rate}%`}
        />
      ),
    },
  ]

  // --- Occupancy calculations ---
  const totalUnits = propertyData.units.length
  const activeLeases = propertyData.leases.filter((l) => !l.cancelledAt)
  const rentedUnits = propertyData.units.filter((u) =>
    activeLeases.some((l) => l.unitId === u.id),
  ).length
  const ownerOccupiedUnits = propertyData.units.filter(
    (u) => u.ownership === 'ownerOccupied' && !u.closed,
  ).length
  const vacantUnits = Math.max(0, totalUnits - rentedUnits - ownerOccupiedUnits)
  const occupancyRate =
    totalUnits > 0
      ? Math.round(((rentedUnits + ownerOccupiedUnits) / totalUnits) * 100)
      : 0

  interface ExpiringLeaseRow {
    id: string
    unitCode: string
    tenantName: string
    tenantPhone: string
    endDate: string
    monthlyRent: number
    daysLeft: number
  }

  const expiringLeases: ExpiringLeaseRow[] = activeLeases
    .map((l) => {
      const unit = propertyData.units.find((u) => u.id === l.unitId)
      const diffMs = new Date(`${l.endDate}T00:00:00Z`).getTime() - new Date(`${billingToday}T00:00:00Z`).getTime()
      const daysLeft = Math.ceil(diffMs / (1000 * 3600 * 24))
      return {
        id: l.id,
        unitCode: unit?.code ?? '—',
        tenantName: l.tenantName,
        tenantPhone: l.tenantPhone,
        endDate: l.endDate,
        monthlyRent: l.monthlyRent,
        daysLeft,
      }
    })
    .filter((l) => l.daysLeft <= 90)
    .sort((a, b) => a.daysLeft - b.daysLeft)

  const occupancyColumns: Column<ExpiringLeaseRow>[] = [
    {
      key: 'unit',
      header: t('reports.occupancy.unitCol'),
      render: (r) => (
        <span className="font-semibold text-primary-container">{r.unitCode}</span>
      ),
    },
    {
      key: 'tenant',
      header: t('reports.occupancy.tenantCol'),
      render: (r) => r.tenantName,
    },
    {
      key: 'phone',
      header: t('reports.occupancy.phoneCol'),
      render: (r) => r.tenantPhone,
    },
    {
      key: 'endDate',
      header: t('reports.occupancy.endCol'),
      render: (r) => formatDate(r.endDate, lang),
    },
    {
      key: 'rent',
      header: t('reports.occupancy.rentCol'),
      numeric: true,
      render: (r) => formatBaht(r.monthlyRent),
    },
    {
      key: 'daysLeft',
      header: t('reports.occupancy.daysLeftCol'),
      numeric: true,
      render: (r) => (
        <StatusBadge
          status={r.daysLeft <= 0 ? 'critical' : r.daysLeft <= 30 ? 'critical' : 'pending'}
          label={
            r.daysLeft <= 0
              ? t('reports.occupancy.expired')
              : t('reports.occupancy.days', { count: r.daysLeft })
          }
        />
      ),
    },
  ]

  return (
    <section className="space-y-6">
      {/* Header and Print action */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[28px] font-semibold leading-9 text-primary-container">
          {t('reports.title')}
        </h1>
        <Button variant="secondary" onClick={() => window.print()}>
          <span className="material-symbols-outlined text-lg" aria-hidden="true">
            print
          </span>
          {t('reports.print')}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#e2e8f0]">
        {(['financial', 'maintenance', 'occupancy'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`border-b-2 px-6 py-3 text-sm font-semibold transition ${
              activeTab === tab
                ? 'border-primary-container text-primary-container'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {t(`reports.tabs.${tab}`)}
          </button>
        ))}
      </div>

      {/* Financial Tab */}
      {activeTab === 'financial' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <label className="flex items-center gap-2 text-sm font-medium text-on-surface">
              <span>{t('reports.period')}:</span>
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="h-10 rounded border border-[#cbd5e1] bg-surface-container-lowest px-3 text-sm outline-none focus:border-primary-container"
              >
                <option value="all">{t('reports.allPeriods')}</option>
                {allPeriods.map((p) => (
                  <option key={p} value={p}>
                    {formatPeriod(p, lang)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard
              label={t('reports.financial.totalRevenue')}
              value={formatBaht(totalCollected)}
              delta={{
                trend: collectionRate >= 80 ? 'up' : 'down',
                text: `${collectionRate}% ${t('reports.financial.collectionRate')}`,
              }}
            />
            <KpiCard
              label={t('reports.financial.outstanding')}
              value={formatBaht(totalOutstanding)}
              delta={{
                trend: totalOutstanding > 0 ? 'down' : 'flat',
                text: `${filteredInvoices.length} Invoices`,
              }}
            />
            <KpiCard
              label={t('reports.financial.waterRevenue')}
              value={formatBaht(waterRevenue)}
            />
            <KpiCard
              label={t('reports.financial.electricRevenue')}
              value={formatBaht(electricRevenue)}
            />
            <KpiCard
              label={t('reports.financial.commonRevenue')}
              value={formatBaht(commonRevenue)}
            />
          </div>

          <div className="mt-4">
            <DataTable
              columns={financialColumns}
              rows={periodRows}
              rowKey={(r) => r.period}
              emptyText={t('reports.financial.empty')}
            />
          </div>
        </div>
      )}

      {/* Maintenance Tab */}
      {activeTab === 'maintenance' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label={t('reports.maintenance.totalRequests')}
              value={String(allRequests.length)}
            />
            <KpiCard
              label={t('reports.maintenance.completed')}
              value={String(completedRequests.length)}
            />
            <KpiCard
              label={t('reports.maintenance.pending')}
              value={String(pendingRequests.length)}
            />
            <KpiCard
              label={t('reports.maintenance.completionRate')}
              value={`${maintenanceCompletionRate}%`}
              delta={{
                trend: maintenanceCompletionRate >= 80 ? 'up' : 'flat',
                text: `${completedRequests.length}/${allRequests.length}`,
              }}
            />
          </div>

          <div className="mt-4">
            <DataTable
              columns={maintenanceColumns}
              rows={categoryRows}
              rowKey={(r) => r.category}
              emptyText={t('reports.maintenance.empty')}
            />
          </div>
        </div>
      )}

      {/* Occupancy Tab */}
      {activeTab === 'occupancy' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard
              label={t('reports.occupancy.totalUnits')}
              value={String(totalUnits)}
            />
            <KpiCard
              label={t('reports.occupancy.occupancyRate')}
              value={`${occupancyRate}%`}
              delta={{
                trend: occupancyRate >= 80 ? 'up' : 'flat',
                text: `${rentedUnits + ownerOccupiedUnits}/${totalUnits}`,
              }}
            />
            <KpiCard
              label={t('reports.occupancy.rented')}
              value={String(rentedUnits)}
            />
            <KpiCard
              label={t('reports.occupancy.owner')}
              value={String(ownerOccupiedUnits)}
            />
            <KpiCard
              label={t('reports.occupancy.vacant')}
              value={String(vacantUnits)}
            />
          </div>

          <div className="mt-8">
            <h2 className="mb-4 text-base font-semibold text-primary-container">
              {t('reports.occupancy.expiringTitle')}
            </h2>
            <DataTable
              columns={occupancyColumns}
              rows={expiringLeases}
              rowKey={(r) => r.id}
              emptyText={t('reports.occupancy.noExpiring')}
            />
          </div>
        </div>
      )}
    </section>
  )
}

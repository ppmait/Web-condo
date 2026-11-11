import { Navigate, Route, Routes } from 'react-router'
import { HomeRedirect, PublicOnly, RequireAuth } from '../auth/guards'
import LoginPage from '../features/auth/LoginPage'
import RegisterPage from '../features/auth/RegisterPage'
import NotFoundPage from '../features/NotFoundPage'
import PlaceholderPage from '../features/PlaceholderPage'
import BillingPage from '../features/billing/BillingPage'
import InvoicesTab from '../features/billing/InvoicesTab'
import RatesTab from '../features/billing/RatesTab'
import ReadingsTab from '../features/billing/ReadingsTab'
import SlipsTab from '../features/billing/SlipsTab'
import JuristicMaintenancePage from '../features/maintenance/JuristicMaintenancePage'
import BookingsTab from '../features/facilities/BookingsTab'
import JuristicFacilitiesPage from '../features/facilities/JuristicFacilitiesPage'
import ParcelsTab from '../features/facilities/ParcelsTab'
import TenantParcelsPage from '../features/facilities/TenantParcelsPage'
import TenantFacilitiesPage from '../features/facilities/TenantFacilitiesPage'
import TenantAnnouncementsPage from '../features/announcements/TenantAnnouncementsPage'
import JuristicAnnouncementsPage from '../features/announcements/JuristicAnnouncementsPage'
import TechnicianJobsPage from '../features/maintenance/TechnicianJobsPage'
import TenantMaintenancePage from '../features/maintenance/TenantMaintenancePage'
import TenantBillingPage from '../features/billing/TenantBillingPage'
import InspectionsTab from '../features/units/InspectionsTab'
import LeasesTab from '../features/units/LeasesTab'
import UnitsPage from '../features/units/UnitsPage'
import UnitsTab from '../features/units/UnitsTab'
import TenantOverviewPage from '../features/overview/TenantOverviewPage'
import JuristicDashboardPage from '../features/dashboard/JuristicDashboardPage'
import JuristicReportsPage from '../features/reports/JuristicReportsPage'
import AppShell from './AppShell'
import { NAV_BY_ROLE, ROLES, roleHome } from './roles'

const UNITS_PATH = '/juristic/units' // built page with its own nested tab routes
const TENANT_BILLING_PATH = '/tenant/billing' // built page
const TENANT_MAINTENANCE_PATH = '/tenant/maintenance' // built page
const JURISTIC_MAINTENANCE_PATH = '/juristic/maintenance' // built page
const TECHNICIAN_JOBS_PATH = '/technician/jobs' // built page
const TENANT_FACILITIES_PATH = '/tenant/facilities' // built page
const TENANT_PARCELS_PATH = '/tenant/parcels' // built page
const TENANT_ANNOUNCEMENTS_PATH = '/tenant/announcements' // built page
const JURISTIC_ANNOUNCEMENTS_PATH = '/juristic/announcements' // built page
const JURISTIC_FACILITIES_PATH = '/juristic/parcels-bookings' // built page with its own nested tab routes
const JURISTIC_BILLING_PATH = '/juristic/billing' // built page with its own nested tab routes
const TENANT_OVERVIEW_PATH = '/tenant/overview' // built page
const JURISTIC_DASHBOARD_PATH = '/juristic/dashboard' // built page
const JURISTIC_REPORTS_PATH = '/juristic/reports' // built page

const BUILT_PATHS = new Set([
  UNITS_PATH,
  TENANT_BILLING_PATH,
  JURISTIC_BILLING_PATH,
  TENANT_MAINTENANCE_PATH,
  JURISTIC_MAINTENANCE_PATH,
  TECHNICIAN_JOBS_PATH,
  TENANT_FACILITIES_PATH,
  TENANT_PARCELS_PATH,
  JURISTIC_FACILITIES_PATH,
  TENANT_ANNOUNCEMENTS_PATH,
  JURISTIC_ANNOUNCEMENTS_PATH,
  TENANT_OVERVIEW_PATH,
  JURISTIC_DASHBOARD_PATH,
  JURISTIC_REPORTS_PATH,
])

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route element={<PublicOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          {ROLES.map((role) => (
            <Route key={role} path={`/${role}`} element={<Navigate to={roleHome(role)} replace />} />
          ))}
          {ROLES.flatMap((role) =>
            NAV_BY_ROLE[role]
              .filter((item) => !BUILT_PATHS.has(item.path))
              .map((item) => <Route key={item.path} path={item.path} element={<PlaceholderPage />} />),
          )}
          <Route path={TENANT_OVERVIEW_PATH} element={<TenantOverviewPage />} />
          <Route path={JURISTIC_DASHBOARD_PATH} element={<JuristicDashboardPage />} />
          <Route path={JURISTIC_REPORTS_PATH} element={<JuristicReportsPage />} />
          <Route path={TENANT_ANNOUNCEMENTS_PATH} element={<TenantAnnouncementsPage />} />
          <Route path={JURISTIC_ANNOUNCEMENTS_PATH} element={<JuristicAnnouncementsPage />} />
          <Route path={TENANT_BILLING_PATH} element={<TenantBillingPage />} />
          <Route path={TENANT_MAINTENANCE_PATH} element={<TenantMaintenancePage />} />
          <Route path={JURISTIC_MAINTENANCE_PATH} element={<JuristicMaintenancePage />} />
          <Route path={TECHNICIAN_JOBS_PATH} element={<TechnicianJobsPage />} />
          <Route path={TENANT_FACILITIES_PATH} element={<TenantFacilitiesPage />} />
          <Route path={TENANT_PARCELS_PATH} element={<TenantParcelsPage />} />
          <Route path={JURISTIC_FACILITIES_PATH} element={<JuristicFacilitiesPage />}>
            <Route index element={<BookingsTab />} />
            <Route path="parcels" element={<ParcelsTab />} />
          </Route>
          <Route path={JURISTIC_BILLING_PATH} element={<BillingPage />}>
            <Route index element={<ReadingsTab />} />
            <Route path="invoices" element={<InvoicesTab />} />
            <Route path="slips" element={<SlipsTab />} />
            <Route path="rates" element={<RatesTab />} />
          </Route>
          <Route path={UNITS_PATH} element={<UnitsPage />}>
            <Route index element={<UnitsTab />} />
            <Route path="leases" element={<LeasesTab />} />
            <Route path="inspections" element={<InspectionsTab />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}

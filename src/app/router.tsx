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
import TenantParcelsPage from '../features/facilities/TenantParcelsPage'
import TenantFacilitiesPage from '../features/facilities/TenantFacilitiesPage'
import TechnicianJobsPage from '../features/maintenance/TechnicianJobsPage'
import TenantMaintenancePage from '../features/maintenance/TenantMaintenancePage'
import TenantBillingPage from '../features/billing/TenantBillingPage'
import InspectionsTab from '../features/units/InspectionsTab'
import LeasesTab from '../features/units/LeasesTab'
import UnitsPage from '../features/units/UnitsPage'
import UnitsTab from '../features/units/UnitsTab'
import AppShell from './AppShell'
import { NAV_BY_ROLE, ROLES, roleHome } from './roles'

const UNITS_PATH = '/juristic/units' // built page with its own nested tab routes
const TENANT_BILLING_PATH = '/tenant/billing' // built page
const TENANT_MAINTENANCE_PATH = '/tenant/maintenance' // built page
const JURISTIC_MAINTENANCE_PATH = '/juristic/maintenance' // built page
const TECHNICIAN_JOBS_PATH = '/technician/jobs' // built page
const TENANT_FACILITIES_PATH = '/tenant/facilities' // built page
const TENANT_PARCELS_PATH = '/tenant/parcels' // built page
const JURISTIC_BILLING_PATH = '/juristic/billing' // built page with its own nested tab routes

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
              .filter((item) => item.path !== UNITS_PATH && item.path !== TENANT_BILLING_PATH && item.path !== JURISTIC_BILLING_PATH && item.path !== TENANT_MAINTENANCE_PATH && item.path !== JURISTIC_MAINTENANCE_PATH && item.path !== TECHNICIAN_JOBS_PATH && item.path !== TENANT_FACILITIES_PATH && item.path !== TENANT_PARCELS_PATH)
              .map((item) => <Route key={item.path} path={item.path} element={<PlaceholderPage />} />),
          )}
          <Route path={TENANT_BILLING_PATH} element={<TenantBillingPage />} />
          <Route path={TENANT_MAINTENANCE_PATH} element={<TenantMaintenancePage />} />
          <Route path={JURISTIC_MAINTENANCE_PATH} element={<JuristicMaintenancePage />} />
          <Route path={TECHNICIAN_JOBS_PATH} element={<TechnicianJobsPage />} />
          <Route path={TENANT_FACILITIES_PATH} element={<TenantFacilitiesPage />} />
          <Route path={TENANT_PARCELS_PATH} element={<TenantParcelsPage />} />
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

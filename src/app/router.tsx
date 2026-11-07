import { Navigate, Route, Routes } from 'react-router'
import { HomeRedirect, PublicOnly, RequireAuth } from '../auth/guards'
import LoginPage from '../features/auth/LoginPage'
import RegisterPage from '../features/auth/RegisterPage'
import NotFoundPage from '../features/NotFoundPage'
import PlaceholderPage from '../features/PlaceholderPage'
import InspectionsTab from '../features/units/InspectionsTab'
import LeasesTab from '../features/units/LeasesTab'
import UnitsPage from '../features/units/UnitsPage'
import UnitsTab from '../features/units/UnitsTab'
import AppShell from './AppShell'
import { NAV_BY_ROLE, ROLES, roleHome } from './roles'

const UNITS_PATH = '/juristic/units' // built page with its own nested tab routes

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
              .filter((item) => item.path !== UNITS_PATH)
              .map((item) => <Route key={item.path} path={item.path} element={<PlaceholderPage />} />),
          )}
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

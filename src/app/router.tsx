import { Navigate, Route, Routes } from 'react-router'
import NotFoundPage from '../features/NotFoundPage'
import PlaceholderPage from '../features/PlaceholderPage'
import AppShell from './AppShell'
import { NAV_BY_ROLE, ROLES, roleHome } from './roles'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={roleHome('tenant')} replace />} />
      <Route element={<AppShell />}>
        {ROLES.map((role) => (
          <Route key={role} path={`/${role}`} element={<Navigate to={roleHome(role)} replace />} />
        ))}
        {ROLES.flatMap((role) =>
          NAV_BY_ROLE[role].map((item) => (
            <Route key={item.path} path={item.path} element={<PlaceholderPage />} />
          )),
        )}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

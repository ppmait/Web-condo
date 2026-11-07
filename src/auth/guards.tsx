import { Navigate, Outlet, useLocation } from 'react-router'
import { roleFromPath, roleHome } from '../app/roles'
import AuthLoading from './AuthLoading'
import { useAuth } from './useAuth'

/** Layout route for everything that needs a signed-in user of the role in the URL prefix. */
export function RequireAuth() {
  const { status, user } = useAuth()
  const { pathname } = useLocation()
  if (status === 'loading') return <AuthLoading />
  if (!user) return <Navigate to="/login" replace />
  const urlRole = roleFromPath(pathname)
  if (urlRole && urlRole !== user.role) return <Navigate to={roleHome(user.role)} replace />
  return <Outlet />
}

/** Layout route for /login and /register: signed-in users are sent to their home page. */
export function PublicOnly() {
  const { status, user } = useAuth()
  if (status === 'loading') return <AuthLoading />
  if (user) return <Navigate to={roleHome(user.role)} replace />
  return <Outlet />
}

/** `/`: home page of the role, or the login page when signed out. */
export function HomeRedirect() {
  const { status, user } = useAuth()
  if (status === 'loading') return <AuthLoading />
  return <Navigate to={user ? roleHome(user.role) : '/login'} replace />
}

import { useAuth } from '../auth/useAuth'

/** Test-only marker that appears once the AuthProvider has loaded the session. */
export default function ReadyProbe() {
  const { status } = useAuth()
  return status === 'ready' ? <span data-testid="auth-ready" hidden /> : null
}

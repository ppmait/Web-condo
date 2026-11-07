import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { useAuth } from '../auth/useAuth'

export default function UserMenu() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  if (!user) return null

  const signOut = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="min-w-0 text-right leading-tight">
        <p
          title={user.fullName}
          className="hidden max-w-40 truncate text-sm font-medium text-on-surface sm:block"
        >
          {user.fullName}
        </p>
        <p className="max-w-24 truncate text-xs text-on-surface-variant sm:max-w-40">
          {t(`role.${user.role}`)}
        </p>
      </div>
      <button
        type="button"
        aria-label={t('auth.logout')}
        title={t('auth.logout')}
        onClick={signOut}
        className="shrink-0 rounded p-1 text-primary-container hover:bg-surface-container-low"
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          logout
        </span>
      </button>
    </div>
  )
}

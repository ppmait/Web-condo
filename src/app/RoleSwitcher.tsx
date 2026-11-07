import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { ROLES, roleHome, type Role } from './roles'

interface Props {
  role: Role | null
}

/** Temporary dev control: replaced by real authentication later. */
export default function RoleSwitcher({ role }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <select
      aria-label={t('shell.role')}
      value={role ?? ''}
      onChange={(e) => navigate(roleHome(e.target.value as Role))}
      className="h-9 max-w-40 rounded border border-[#cbd5e1] bg-surface-container-lowest px-2 text-sm text-primary-container"
    >
      {role === null && <option value="" disabled />}
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {t(`role.${r}`)}
        </option>
      ))}
    </select>
  )
}

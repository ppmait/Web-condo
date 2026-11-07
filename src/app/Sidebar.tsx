import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router'
import { NAV_BY_ROLE, type Role } from './roles'

interface Props {
  role: Role | null
  open: boolean
}

export default function Sidebar({ role, open }: Props) {
  const { t } = useTranslation()
  const items = role ? NAV_BY_ROLE[role] : []

  return (
    <nav
      id="app-sidebar"
      aria-label={t('shell.nav')}
      className={`fixed inset-y-0 left-0 z-40 w-60 -translate-x-full overflow-y-auto border-r border-[#e2e8f0] bg-surface-container-lowest pt-14 transition-transform md:static md:z-auto md:w-16 md:translate-x-0 md:pt-0 lg:w-60 ${
        open ? 'translate-x-0' : 'max-md:invisible'
      } ${items.length === 0 ? 'md:hidden' : ''}`}
    >
      <ul className="flex flex-col gap-1 p-2">
        {items.map((item) => {
          const label = t(`nav.${item.key}`)
          return (
            <li key={item.path}>
              <NavLink
                to={item.path}
                title={label}
                className={({ isActive }) =>
                  `flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium md:justify-center lg:justify-start ${
                    isActive
                      ? 'bg-primary-container text-on-primary'
                      : 'text-on-surface-variant hover:bg-surface-container-low'
                  }`
                }
              >
                <span className="material-symbols-outlined shrink-0" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="truncate md:hidden lg:inline">{label}</span>
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

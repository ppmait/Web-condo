import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'
import { NAV_BY_ROLE, ROLES } from '../app/roles'

export default function PlaceholderPage() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const item = ROLES.flatMap((r) => NAV_BY_ROLE[r]).find((i) => i.path === pathname)

  return (
    <section>
      <h1 className="text-[28px] font-semibold leading-9 text-primary-container">
        {item ? t(`nav.${item.key}`) : ''}
      </h1>
      <p className="mt-2 text-on-surface-variant">{t('shell.placeholder')}</p>
    </section>
  )
}

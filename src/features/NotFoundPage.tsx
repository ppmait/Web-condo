import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router'
import { roleFromPath, roleHome } from '../app/roles'

export default function NotFoundPage() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const home = roleHome(roleFromPath(pathname) ?? 'tenant')

  return (
    <section>
      <h1 className="text-[28px] font-semibold leading-9 text-primary-container">{t('notFound.title')}</h1>
      <p className="mt-2 text-on-surface-variant">{t('notFound.body')}</p>
      <Link to={home} className="mt-4 inline-block font-semibold text-primary-container underline">
        {t('notFound.back')}
      </Link>
    </section>
  )
}

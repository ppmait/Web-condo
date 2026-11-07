import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { roleHome } from '../app/roles'
import { useAuth } from '../auth/useAuth'

export default function NotFoundPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const home = roleHome(user?.role ?? 'tenant')

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

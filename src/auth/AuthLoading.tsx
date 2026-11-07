import { useTranslation } from 'react-i18next'

export default function AuthLoading() {
  const { t } = useTranslation()
  return (
    <div role="status" className="flex min-h-screen items-center justify-center text-on-surface-variant">
      {t('auth.loading')}
    </div>
  )
}

import { useTranslation } from 'react-i18next'

/** Placeholder until the leases tab is built. */
export default function LeasesTab() {
  const { t } = useTranslation()
  return <h2 className="text-lg font-semibold text-primary-container">{t('property.tabs.leases')}</h2>
}

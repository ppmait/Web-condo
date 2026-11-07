import { useTranslation } from 'react-i18next'

/** Placeholder until the inspections tab is built. */
export default function InspectionsTab() {
  const { t } = useTranslation()
  return <h2 className="text-lg font-semibold text-primary-container">{t('property.tabs.inspections')}</h2>
}

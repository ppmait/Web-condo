import { useTranslation } from 'react-i18next'

/** Placeholder until the units tab is built. */
export default function UnitsTab() {
  const { t } = useTranslation()
  return <h2 className="text-lg font-semibold text-primary-container">{t('property.tabs.units')}</h2>
}

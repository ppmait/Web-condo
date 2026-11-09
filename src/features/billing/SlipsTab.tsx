import { useTranslation } from 'react-i18next'

/** Placeholder: replaced by the real tab in a later task. */
export default function SlipsTab() {
  const { t } = useTranslation()
  return <h2 className="text-lg font-semibold text-primary-container">{t('billing.tabs.slips')}</h2>
}

import { useTranslation } from 'react-i18next'
import { formatDate } from '../../lib/format'
import type { Invoice } from '../../billing/types'
import InvoiceBreakdown from './InvoiceBreakdown'

export default function ReceiptView({ invoice }: { invoice: Invoice }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'th'
  if (!invoice.receipt) return null
  const rows: [string, string][] = [
    [t('billing.receipt.number'), invoice.receipt.number],
    [t('billing.receipt.issuedAt'), formatDate(invoice.receipt.issuedAt, lang)],
    [t('billing.detail.unit'), invoice.unitCode],
    [t('billing.receipt.payer'), invoice.tenantName],
  ]
  return (
    <section role="region" aria-label={t('billing.receipt.title')} className="flex flex-col gap-4">
      <h3 className="text-base font-semibold text-primary-container">{t('billing.receipt.title')}</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-on-surface-variant">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <InvoiceBreakdown invoice={invoice} />
      <p className="text-xs font-medium text-[#b45309]">{t('billing.receipt.sample')}</p>
    </section>
  )
}

import { useTranslation } from 'react-i18next'
import Modal from '../../components/Modal'
import StatusBadge from '../../components/StatusBadge'
import { formatDate, formatPeriod } from '../../lib/format'
import { invoiceStatus } from '../../billing/rules'
import { useBilling } from '../../billing/useBilling'
import InvoiceBreakdown from './InvoiceBreakdown'
import ReceiptView from './ReceiptView'
import { invoiceBadge } from './statusBadges'

/** The juristic office's read-only view of one invoice: lines, status, slip history and the receipt. */
export default function AdminInvoiceModal({ invoiceId, onClose }: { invoiceId: string; onClose(): void }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'th'
  const { data, today } = useBilling()
  const invoice = data.invoices.find((i) => i.id === invoiceId)
  if (!invoice) return null
  const status = invoiceStatus(invoice, today)
  const meta: [string, React.ReactNode][] = [
    [t('billing.detail.unit'), invoice.unitCode],
    [t('billing.readings.tenant'), invoice.tenantName],
    [t('billing.detail.period'), formatPeriod(invoice.period, lang)],
    [t('billing.detail.dueDate'), formatDate(invoice.dueDate, lang)],
    [t('billing.detail.status'), <StatusBadge key="s" status={invoiceBadge(status)} label={t(`billing.invoiceStatus.${status}`)} />],
  ]
  return (
    <Modal open title={t('billing.detail.title', { number: invoice.number })} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1 text-sm">
          {meta.map(([label, value], i) => (
            <div key={i} className="contents">
              <dt className="text-on-surface-variant">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <InvoiceBreakdown invoice={invoice} />
        <div>
          <h3 className="mb-1 text-sm font-semibold text-primary-container">{t('billing.slip.history')}</h3>
          {invoice.slips.length === 0 ? (
            <p className="text-sm text-on-surface-variant">{t('billing.invoices.noSlips')}</p>
          ) : (
            <ul aria-label={t('billing.slip.history')} className="flex flex-col gap-2 text-sm">
              {invoice.slips.map((s) => (
                <li key={s.id}>
                  <div className="flex flex-wrap justify-between gap-2">
                    <span>
                      {s.fileName} · {formatDate(s.submittedAt, lang)}
                    </span>
                    <span className="text-on-surface-variant">{t(`billing.slip.status.${s.status}`)}</span>
                  </div>
                  {s.status === 'rejected' && s.rejectReason && <p className="text-xs text-error">{t('billing.invoices.reason', { reason: s.rejectReason })}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
        {invoice.receipt && <ReceiptView invoice={invoice} />}
      </div>
    </Modal>
  )
}

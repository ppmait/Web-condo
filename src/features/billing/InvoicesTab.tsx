import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '../../components/Button'
import ConfirmDialog from '../../components/ConfirmDialog'
import DataTable, { type Column } from '../../components/DataTable'
import StatusBadge from '../../components/StatusBadge'
import { formatBaht, formatDate } from '../../lib/format'
import { invoiceStatus, needsReceipt } from '../../billing/rules'
import { BillingError, type Invoice } from '../../billing/types'
import { useBilling } from '../../billing/useBilling'
import AdminInvoiceModal from './AdminInvoiceModal'
import { invoiceBadge } from './statusBadges'
import { usePeriod } from './usePeriod'

const FILTERS = ['all', 'outstanding', 'verifying', 'overdue', 'paid', 'awaitingReceipt'] as const
type Filter = (typeof FILTERS)[number]

export default function InvoicesTab() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'th'
  const period = usePeriod()
  const { data, today, issueReceipt, reload } = useBilling()
  const [filter, setFilter] = useState<Filter>('all')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [receiptFor, setReceiptFor] = useState<Invoice | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)

  const ofPeriod = data.invoices.filter((i) => i.period === period).sort((a, b) => a.unitCode.localeCompare(b.unitCode))
  const matches = (i: Invoice) => {
    const status = invoiceStatus(i, today)
    return {
      all: true,
      outstanding: status !== 'paid',
      verifying: status === 'verifying',
      overdue: status === 'overdue',
      paid: status === 'paid',
      awaitingReceipt: needsReceipt(i),
    }[filter]
  }
  const rows = ofPeriod.filter(matches)

  const closeReceipt = () => {
    setReceiptFor(null)
    setMessage(null)
  }

  const confirmReceipt = async () => {
    if (!receiptFor || inFlight.current) return
    inFlight.current = true
    setPending(true)
    setMessage(null)
    try {
      await issueReceipt(receiptFor.id)
      setReceiptFor(null)
    } catch (err) {
      if (err instanceof BillingError && err.code === 'receipt_exists') {
        setMessage(t('billing.invoices.receiptExists'))
        void reload()
      } else if (err instanceof BillingError && (err.code === 'not_payable' || err.code === 'already_paid')) {
        setMessage(t('billing.invoices.receiptNotPayable'))
        void reload()
      } else {
        setMessage(t('billing.invoices.receiptFailed'))
      }
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  const columns: Column<Invoice>[] = [
    { key: 'number', header: t('billing.columns.number'), render: (i) => i.number },
    { key: 'unit', header: t('billing.readings.unit'), render: (i) => i.unitCode },
    { key: 'tenant', header: t('billing.readings.tenant'), render: (i) => i.tenantName },
    { key: 'total', header: t('billing.columns.total'), numeric: true, render: (i) => formatBaht(i.total) },
    { key: 'due', header: t('billing.detail.dueDate'), render: (i) => formatDate(i.dueDate, lang) },
    {
      key: 'status',
      header: t('billing.columns.status'),
      render: (i) => {
        const status = invoiceStatus(i, today)
        return (
          <span className="flex flex-wrap items-center gap-1">
            <StatusBadge status={invoiceBadge(status)} label={t(`billing.invoiceStatus.${status}`)} />
            {needsReceipt(i) && <StatusBadge status="pending" label={t('billing.receiptPending')} />}
          </span>
        )
      },
    },
    {
      key: 'actions',
      header: '',
      render: (i) => (
        <span className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label={t('billing.invoices.viewDetail', { number: i.number })}
            onClick={() => setDetailId(i.id)}
            className="text-sm font-medium text-primary-container underline-offset-2 hover:underline"
          >
            {t('billing.openDetail')}
          </button>
          {needsReceipt(i) && (
            <Button variant="secondary" className="h-8 px-3" aria-label={t('billing.invoices.issueReceiptOf', { number: i.number })} onClick={() => setReceiptFor(i)}>
              {t('billing.invoices.issueReceipt')}
            </Button>
          )}
        </span>
      ),
    },
  ]

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold text-primary-container">{t('billing.tabs.invoices')}</h2>
        <label className="flex flex-col gap-1 text-sm font-medium text-on-surface">
          {t('billing.invoices.filter')}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            className="h-10 rounded border border-[#cbd5e1] bg-surface-container-lowest px-3 text-sm outline-none focus:border-primary-container"
          >
            {FILTERS.map((f) => (
              <option key={f} value={f}>
                {t(`billing.invoices.filterOption.${f}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(i) => i.id}
          emptyText={t(ofPeriod.length === 0 ? 'billing.invoices.empty' : 'billing.invoices.emptyFiltered')}
        />
      </div>

      {detailId && <AdminInvoiceModal invoiceId={detailId} onClose={() => setDetailId(null)} />}

      <ConfirmDialog
        open={receiptFor !== null}
        title={t('billing.invoices.receiptTitle', { number: receiptFor?.number ?? '' })}
        message={receiptFor ? t('billing.invoices.receiptMessage', { amount: formatBaht(receiptFor.total), unit: receiptFor.unitCode }) : undefined}
        confirmLabel={t('billing.invoices.issueReceipt')}
        pending={pending}
        onConfirm={confirmReceipt}
        onCancel={closeReceipt}
      >
        {message && (
          <p role="alert" className="mt-2 text-sm text-error">
            {message}
          </p>
        )}
      </ConfirmDialog>
    </div>
  )
}

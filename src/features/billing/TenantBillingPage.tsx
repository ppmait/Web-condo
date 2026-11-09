import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { useAuth } from '../../auth/useAuth'
import { useBilling } from '../../billing/useBilling'
import DataTable, { type Column } from '../../components/DataTable'
import StatusBadge from '../../components/StatusBadge'
import { formatBaht, formatDate, formatPeriod } from '../../lib/format'
import { invoiceStatus, tenantInvoices } from '../../billing/rules'
import type { Invoice } from '../../billing/types'
import InvoiceDetailModal from './InvoiceDetailModal'
import { invoiceBadge } from './statusBadges'

interface Selected {
  id: string
  receipt: boolean
}

export default function TenantBillingPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'th'
  const { user } = useAuth()
  const { status, data, today } = useBilling()
  const [params, setParams] = useSearchParams()
  const [selected, setSelected] = useState<Selected | null>(null)

  const mine = tenantInvoices(data.invoices, user?.phone ?? '')
  const wanted = params.get('invoice')
  const fromUrl = wanted && mine.some((i) => i.id === wanted) ? wanted : null
  const active: Selected | null = selected ?? (fromUrl ? { id: fromUrl, receipt: false } : null)

  // an ?invoice= that is not one of mine (or does not exist) is ignored and cleared from the address
  useEffect(() => {
    if (status === 'ready' && wanted && !fromUrl) setParams({}, { replace: true })
  }, [status, wanted, fromUrl, setParams])

  const close = () => {
    setSelected(null)
    if (wanted) setParams({}, { replace: true })
  }

  const open = (id: string, receipt = false) => setSelected({ id, receipt })
  const statusOf = (i: Invoice) => invoiceStatus(i, today)
  const due = mine.filter((i) => statusOf(i) !== 'paid')
  const paid = mine.filter((i) => statusOf(i) === 'paid')
  const paidOn = (i: Invoice) => i.slips.find((s) => s.status === 'approved')?.reviewedAt ?? ''

  const columns: Column<Invoice>[] = [
    {
      key: 'number',
      header: t('billing.columns.number'),
      render: (i) => (
        <button
          type="button"
          aria-label={t('billing.openInvoice', { number: i.number })}
          onClick={() => open(i.id)}
          className="font-medium text-primary-container underline-offset-2 hover:underline"
        >
          {i.number}
        </button>
      ),
    },
    { key: 'period', header: t('billing.columns.period'), render: (i) => formatPeriod(i.period, lang) },
    { key: 'paidOn', header: t('billing.columns.paidOn'), render: (i) => (paidOn(i) ? formatDate(paidOn(i), lang) : '') },
    { key: 'total', header: t('billing.columns.total'), numeric: true, render: (i) => formatBaht(i.total) },
    {
      key: 'status',
      header: t('billing.columns.status'),
      render: (i) => <StatusBadge status={invoiceBadge(statusOf(i))} label={t(`billing.invoiceStatus.${statusOf(i)}`)} />,
    },
    {
      key: 'receipt',
      header: t('billing.columns.receipt'),
      render: (i) =>
        i.receipt ? (
          <button
            type="button"
            aria-label={t('billing.viewReceiptOf', { number: i.number })}
            onClick={() => open(i.id, true)}
            className="text-sm font-medium text-primary-container underline-offset-2 hover:underline"
          >
            {t('billing.viewReceipt')}
          </button>
        ) : (
          <span className="text-sm text-on-surface-variant">{t('billing.receiptPending')}</span>
        ),
    },
  ]

  return (
    <section>
      <h1 className="text-[28px] font-semibold leading-9 text-primary-container">{t('nav.billing')}</h1>

      {status === 'loading' && (
        <p role="status" className="mt-4 text-on-surface-variant">
          {t('billing.loading')}
        </p>
      )}
      {status === 'error' && (
        <p role="alert" className="mt-4 text-error">
          {t('billing.loadFailed')}
        </p>
      )}

      {status === 'ready' && mine.length === 0 && <p className="mt-6 text-on-surface-variant">{t('billing.tenant.noInvoices')}</p>}

      {status === 'ready' && mine.length > 0 && (
        <>
          <section aria-labelledby="billing-due" className="mt-6">
            <h2 id="billing-due" className="mb-3 text-lg font-semibold text-primary-container">
              {t('billing.tenant.due')}
            </h2>
            {due.length === 0 ? (
              <p className="text-on-surface-variant">{t('billing.tenant.noneDue')}</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {due.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    aria-label={t('billing.openInvoice', { number: i.number })}
                    onClick={() => open(i.id)}
                    className="flex flex-col gap-2 rounded-xl border border-[#e2e8f0] bg-surface-container-lowest p-4 text-left shadow-sm hover:border-primary-container"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-primary-container">{i.number}</span>
                      <StatusBadge status={invoiceBadge(statusOf(i))} label={t(`billing.invoiceStatus.${statusOf(i)}`)} />
                    </span>
                    <span className="text-sm text-on-surface-variant">{formatPeriod(i.period, lang)}</span>
                    <span className="text-2xl font-semibold tabular-nums text-primary-container">{formatBaht(i.total)}</span>
                    <span className="text-sm text-on-surface-variant">{t('billing.dueOn', { date: formatDate(i.dueDate, lang) })}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="billing-history" className="mt-8">
            <h2 id="billing-history" className="mb-3 text-lg font-semibold text-primary-container">
              {t('billing.tenant.history')}
            </h2>
            <DataTable columns={columns} rows={paid} rowKey={(i) => i.id} emptyText={t('billing.tenant.noHistory')} />
          </section>
        </>
      )}

      {active && <InvoiceDetailModal key={`${active.id}:${active.receipt}`} invoiceId={active.id} initialReceipt={active.receipt} onClose={close} />}
    </section>
  )
}

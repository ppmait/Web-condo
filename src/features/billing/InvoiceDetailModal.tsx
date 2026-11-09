import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '../../components/Button'
import FormField from '../../components/FormField'
import Modal from '../../components/Modal'
import StatusBadge from '../../components/StatusBadge'
import { formatDate, formatFileSize, formatPeriod } from '../../lib/format'
import { invoiceStatus, validateSlipFile } from '../../billing/rules'
import { BillingError } from '../../billing/types'
import { useBilling } from '../../billing/useBilling'
import InvoiceBreakdown from './InvoiceBreakdown'
import ReceiptView from './ReceiptView'
import SampleQr from './SampleQr'
import { invoiceBadge } from './statusBadges'

interface Props {
  invoiceId: string
  onClose(): void
  /** open straight on the receipt */
  initialReceipt?: boolean
}

/** Mount it only while it is open, so the form starts fresh every time. */
export default function InvoiceDetailModal({ invoiceId, onClose, initialReceipt = false }: Props) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'th'
  const { data, today, submitSlip, reload } = useBilling()
  const invoice = data.invoices.find((i) => i.id === invoiceId)

  const [showReceipt, setShowReceipt] = useState(initialReceipt)
  const [file, setFile] = useState<File | null>(null)
  const [fieldError, setFieldError] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const [focusTick, setFocusTick] = useState(0)

  useEffect(() => {
    if (focusTick > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [focusTick])

  if (!invoice) return null

  const status = invoiceStatus(invoice, today)
  const pendingSlip = invoice.slips.find((s) => s.status === 'pending')
  const lastSlip = invoice.slips.at(-1)
  const canPay = status === 'unpaid' || status === 'overdue'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (inFlight.current) return
    setNotice(null)
    const slip = file ? { name: file.name, type: file.type, size: file.size } : null
    if (!slip || validateSlipFile(slip) !== null) {
      setFieldError(true)
      setFocusTick((n) => n + 1)
      return
    }
    inFlight.current = true
    setPending(true)
    try {
      await submitSlip(invoice.id, slip)
    } catch (err) {
      if (err instanceof BillingError && err.code === 'invalid_input') {
        setFieldError(true)
        setFocusTick((n) => n + 1)
      } else if (err instanceof BillingError && err.code === 'slip_pending') {
        setNotice(t('billing.slip.alreadyPending'))
        void reload()
      } else if (err instanceof BillingError && err.code === 'already_paid') {
        setNotice(t('billing.slip.alreadyPaid'))
        void reload()
      } else if (err instanceof BillingError && err.code === 'not_found') {
        setNotice(t('billing.slip.notFound'))
      } else {
        setNotice(t('billing.slip.failed'))
      }
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  const meta: [string, React.ReactNode][] = [
    [t('billing.detail.unit'), invoice.unitCode],
    [t('billing.detail.period'), formatPeriod(invoice.period, lang)],
    [t('billing.detail.dueDate'), formatDate(invoice.dueDate, lang)],
    [t('billing.detail.status'), <StatusBadge key="s" status={invoiceBadge(status)} label={t(`billing.invoiceStatus.${status}`)} />],
  ]

  return (
    <Modal open title={t('billing.detail.title', { number: invoice.number })} onClose={onClose}>
      {showReceipt && invoice.receipt ? (
        <div className="flex flex-col gap-4">
          <ReceiptView invoice={invoice} />
          <Button variant="secondary" onClick={() => setShowReceipt(false)}>
            {t('billing.receipt.back')}
          </Button>
        </div>
      ) : (
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

          {status === 'paid' &&
            (invoice.receipt ? (
              <Button variant="secondary" onClick={() => setShowReceipt(true)}>
                {t('billing.viewReceipt')}
              </Button>
            ) : (
              <p className="text-sm text-on-surface-variant">{t('billing.paidAwaitingReceipt')}</p>
            ))}

          {status === 'verifying' && pendingSlip && (
            <p className="text-sm text-[#b45309]">
              {t('billing.slip.sent')} <span>({pendingSlip.fileName})</span>
            </p>
          )}

          {canPay && (
            <>
              {lastSlip?.status === 'rejected' && (
                <p role="alert" className="text-sm text-error">
                  {t('billing.slip.rejected', { reason: lastSlip.rejectReason ?? '' })}
                </p>
              )}
              <SampleQr amount={invoice.total} invoiceNumber={invoice.number} />
              <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-3">
                <FormField label={t('billing.slip.field')} error={fieldError ? t('billing.errors.slip') : undefined}>
                  {(a) => (
                    <input
                      {...a}
                      type="file"
                      accept="image/png,image/jpeg"
                      className={`${a.className} h-auto py-2`}
                      onChange={(e) => {
                        setFile(e.target.files?.[0] ?? null)
                        setFieldError(false)
                      }}
                    />
                  )}
                </FormField>
                {file && !fieldError && (
                  <p className="text-xs text-on-surface-variant">
                    {file.name} · {formatFileSize(file.size)}
                  </p>
                )}
                <Button type="submit" disabled={pending}>
                  {t('billing.slip.submit')}
                </Button>
              </form>
            </>
          )}

          {notice && (
            <p role="alert" className="text-sm text-error">
              {notice}
            </p>
          )}

          {invoice.slips.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-semibold text-primary-container">{t('billing.slip.history')}</h3>
              <ul aria-label={t('billing.slip.history')} className="flex flex-col gap-1 text-sm">
                {invoice.slips.map((s) => (
                  <li key={s.id} className="flex flex-wrap justify-between gap-2">
                    <span>
                      {s.fileName} · {formatDate(s.submittedAt, lang)}
                    </span>
                    <span className="text-on-surface-variant">{t(`billing.slip.status.${s.status}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '../../components/Button'
import ConfirmDialog from '../../components/ConfirmDialog'
import DataTable, { type Column } from '../../components/DataTable'
import FormField from '../../components/FormField'
import { formatBaht, formatDate, formatFileSize } from '../../lib/format'
import { BillingError, type Invoice, type Slip } from '../../billing/types'
import { useBilling } from '../../billing/useBilling'

interface Queued {
  invoice: Invoice
  slip: Slip
}

type Action = { kind: 'approve' | 'reject'; item: Queued }

interface DialogProps {
  item: Queued
  onClose(): void
  /** the slip was checked from another tab: say so, close the box */
  onStale(): void
}

/** Runs `work`, turning the api's errors into a message for the dialog or into a stale-slip notice. */
function useAction(onClose: () => void, onStale: () => void) {
  const { t } = useTranslation()
  const { reload } = useBilling()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const inFlight = useRef(false)

  const run = async (work: () => Promise<unknown>) => {
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    setMessage(null)
    try {
      await work()
      onClose()
    } catch (err) {
      if (err instanceof BillingError && err.code === 'already_reviewed') {
        onStale()
        void reload()
      } else if (err instanceof BillingError && err.code === 'not_found') {
        setMessage(t('billing.slips.notFound'))
        void reload()
      } else {
        setMessage(t('billing.slips.failed'))
      }
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }
  return { run, pending, message }
}

function ApproveDialog({ item, onClose, onStale }: DialogProps) {
  const { t } = useTranslation()
  const { approveSlip } = useBilling()
  const { run, pending, message } = useAction(onClose, onStale)
  const { invoice, slip } = item
  return (
    <ConfirmDialog
      open
      title={t('billing.slips.approveTitle', { number: invoice.number })}
      message={t('billing.slips.approveMessage', { unit: invoice.unitCode, amount: formatBaht(invoice.total) })}
      confirmLabel={t('billing.slips.approve')}
      pending={pending}
      onConfirm={() => void run(() => approveSlip(invoice.id, slip.id))}
      onCancel={onClose}
    >
      {message && (
        <p role="alert" className="mt-2 text-sm text-error">
          {message}
        </p>
      )}
    </ConfirmDialog>
  )
}

function RejectDialog({ item, onClose, onStale }: DialogProps) {
  const { t } = useTranslation()
  const { rejectSlip } = useBilling()
  const { run, pending, message } = useAction(onClose, onStale)
  const [reason, setReason] = useState('')
  const [error, setError] = useState(false)
  const [focusTick, setFocusTick] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const { invoice, slip } = item

  useEffect(() => {
    if (focusTick > 0) boxRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [focusTick])

  const confirm = () => {
    const text = reason.trim()
    if (text === '') {
      setError(true)
      setFocusTick((n) => n + 1)
      return
    }
    void run(() => rejectSlip(invoice.id, slip.id, text))
  }

  return (
    <ConfirmDialog
      open
      title={t('billing.slips.rejectTitle', { number: invoice.number })}
      confirmLabel={t('billing.slips.rejectConfirm')}
      danger
      pending={pending}
      onConfirm={confirm}
      onCancel={onClose}
    >
      <div ref={boxRef} className="mt-2">
        <FormField label={t('billing.slips.reason')} error={error ? t('billing.errors.rejectReason') : undefined}>
          {(a) => (
            <textarea
              {...a}
              rows={3}
              value={reason}
              className={`${a.className} h-auto py-2`}
              onChange={(e) => {
                setReason(e.target.value)
                setError(false)
              }}
            />
          )}
        </FormField>
      </div>
      {message && (
        <p role="alert" className="mt-2 text-sm text-error">
          {message}
        </p>
      )}
    </ConfirmDialog>
  )
}

export default function SlipsTab() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'th'
  const { data } = useBilling()
  const [action, setAction] = useState<Action | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const queue: Queued[] = data.invoices
    .flatMap((invoice) => invoice.slips.filter((s) => s.status === 'pending').map((slip) => ({ invoice, slip })))
    .sort((a, b) => a.slip.submittedAt.localeCompare(b.slip.submittedAt) || a.invoice.number.localeCompare(b.invoice.number))

  const close = () => setAction(null)
  const stale = () => {
    setAction(null)
    setNotice(t('billing.slips.alreadyReviewed'))
  }
  const start = (kind: Action['kind'], item: Queued) => {
    setNotice(null)
    setAction({ kind, item })
  }

  const columns: Column<Queued>[] = [
    { key: 'number', header: t('billing.columns.number'), render: (q) => q.invoice.number },
    { key: 'unit', header: t('billing.readings.unit'), render: (q) => q.invoice.unitCode },
    { key: 'tenant', header: t('billing.readings.tenant'), render: (q) => q.invoice.tenantName },
    { key: 'file', header: t('billing.slips.file'), render: (q) => `${q.slip.fileName} · ${formatFileSize(q.slip.fileSize)}` },
    { key: 'sent', header: t('billing.slips.submittedAt'), render: (q) => formatDate(q.slip.submittedAt, lang) },
    { key: 'total', header: t('billing.columns.total'), numeric: true, render: (q) => formatBaht(q.invoice.total) },
    {
      key: 'actions',
      header: '',
      render: (q) => (
        <span className="flex flex-wrap gap-2">
          <Button className="h-8 px-3" aria-label={t('billing.slips.approveOf', { number: q.invoice.number })} onClick={() => start('approve', q)}>
            {t('billing.slips.approve')}
          </Button>
          <Button variant="secondary" className="h-8 px-3" aria-label={t('billing.slips.rejectOf', { number: q.invoice.number })} onClick={() => start('reject', q)}>
            {t('billing.slips.reject')}
          </Button>
        </span>
      ),
    },
  ]

  return (
    <div>
      <h2 className="text-lg font-semibold text-primary-container">{t('billing.tabs.slips')}</h2>
      {notice && (
        <p role="alert" className="mt-3 text-sm text-error">
          {notice}
        </p>
      )}
      <div className="mt-4">
        <DataTable columns={columns} rows={queue} rowKey={(q) => q.slip.id} emptyText={t('billing.slips.empty')} />
      </div>
      {action?.kind === 'approve' && <ApproveDialog key={action.item.slip.id} item={action.item} onClose={close} onStale={stale} />}
      {action?.kind === 'reject' && <RejectDialog key={action.item.slip.id} item={action.item} onClose={close} onStale={stale} />}
    </div>
  )
}

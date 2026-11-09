import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '../../components/Button'
import ConfirmDialog from '../../components/ConfirmDialog'
import Modal from '../../components/Modal'
import { formatPeriod } from '../../lib/format'
import type { IssueResult, Period } from '../../billing/types'
import { useBilling } from '../../billing/useBilling'

interface Props {
  period: Period
  /** how many invoices would be issued now */
  readyCount: number
  /** codes of the billed units that have no reading yet */
  missing: string[]
  onClose(): void
}

/** Confirms, issues the invoices of the period, then shows the result. Mount it only while it is open. */
export default function IssueDialog({ period, readyCount, missing, onClose }: Props) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'th'
  const { issueInvoices } = useBilling()
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const [result, setResult] = useState<IssueResult | null>(null)
  const inFlight = useRef(false)

  const confirm = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    setFailed(false)
    try {
      setResult(await issueInvoices(period))
    } catch {
      setFailed(true)
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  if (result) {
    return (
      <Modal open title={t('billing.issue.resultTitle')} onClose={onClose}>
        <p className="text-sm">{t('billing.issue.result', { issued: result.issued.length, skipped: result.skipped.length })}</p>
        <div className="mt-6 flex justify-end">
          <Button onClick={onClose}>{t('common.close')}</Button>
        </div>
      </Modal>
    )
  }

  return (
    <ConfirmDialog
      open
      title={t('billing.issue.title', { period: formatPeriod(period, lang) })}
      confirmLabel={t('billing.issue.confirm')}
      pending={pending}
      onConfirm={confirm}
      onCancel={onClose}
    >
      <p className="text-sm font-medium text-on-surface">{t('billing.issue.willIssue', { count: readyCount })}</p>
      {missing.length > 0 && (
        <p className="mt-2 text-sm text-on-surface-variant">{t('billing.issue.willSkip', { count: missing.length, units: missing.join(', ') })}</p>
      )}
      {failed && (
        <p role="alert" className="mt-2 text-sm text-error">
          {t('billing.issue.failed')}
        </p>
      )}
    </ConfirmDialog>
  )
}

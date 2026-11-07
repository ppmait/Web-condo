import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import Button from '../../components/Button'
import ConfirmDialog from '../../components/ConfirmDialog'
import DataTable, { type Column } from '../../components/DataTable'
import StatusBadge, { type Status } from '../../components/StatusBadge'
import { formatBaht, formatDate } from '../../lib/format'
import { isExpiringSoon, isLeaseEditable, leaseStatus, type LeaseStatus } from '../../property/rules'
import { PropertyError, type Lease } from '../../property/types'
import { useProperty } from '../../property/useProperty'
import LeaseFormModal from './LeaseFormModal'

const STATUSES: LeaseStatus[] = ['active', 'upcoming', 'ended', 'cancelled']
const BADGE: Record<LeaseStatus, Status> = { active: 'settled', upcoming: 'pending', ended: 'inactive', cancelled: 'critical' }

type Row = Lease & { unitCode: string; status: LeaseStatus; expiring: boolean; editable: boolean; nextInspection: 'moveIn' | 'moveOut' | null }
type Dialog = { kind: 'form'; lease?: Lease } | { kind: 'cancel'; lease: Lease } | null

const FIELD = 'h-10 rounded border border-[#cbd5e1] bg-surface-container-lowest px-3 text-sm text-primary-container'

export default function LeasesTab() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'th'
  const { data, today, cancelLease } = useProperty()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'all' | LeaseStatus>('all')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [reason, setReason] = useState('')
  const [cancelError, setCancelError] = useState<'locked' | 'generic' | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const inFlight = useRef(false)

  const rows: Row[] = useMemo(
    () =>
      data.leases
        .map((l) => {
          const inspections = data.inspections.filter((i) => i.leaseId === l.id)
          const hasMoveIn = inspections.some((i) => i.type === 'moveIn')
          const hasMoveOut = inspections.some((i) => i.type === 'moveOut')
          return {
            ...l,
            unitCode: data.units.find((u) => u.id === l.unitId)?.code ?? '?',
            status: leaseStatus(l, today),
            expiring: isExpiringSoon(l, today),
            editable: isLeaseEditable(l, today),
            nextInspection: !hasMoveIn ? ('moveIn' as const) : !hasMoveOut ? ('moveOut' as const) : null,
          }
        })
        .filter((l) => status === 'all' || l.status === status)
        .sort((a, b) => a.unitCode.localeCompare(b.unitCode) || b.startDate.localeCompare(a.startDate)),
    [data, today, status],
  )

  const closeDialog = () => {
    setDialog(null)
    setReason('')
    setCancelError(null)
  }

  const confirmCancel = async (lease: Lease) => {
    if (inFlight.current) return
    inFlight.current = true
    setCancelling(true)
    setCancelError(null)
    try {
      await cancelLease(lease.id, reason)
      closeDialog()
    } catch (err) {
      setCancelError(err instanceof PropertyError && err.code === 'lease_locked' ? 'locked' : 'generic')
    } finally {
      inFlight.current = false
      setCancelling(false)
    }
  }

  const columns: Column<Row>[] = [
    { key: 'unit', header: t('property.leases.columns.unit'), render: (l) => <span className="whitespace-nowrap font-semibold tabular-nums">{l.unitCode}</span> },
    {
      key: 'tenant',
      header: t('property.leases.columns.tenant'),
      render: (l) => (
        <span className="flex flex-col">
          <span>{l.tenantName}</span>
          <span className="text-xs text-on-surface-variant tabular-nums">{l.tenantPhone}</span>
        </span>
      ),
    },
    {
      key: 'period',
      header: t('property.leases.columns.period'),
      render: (l) => (
        <span className="whitespace-nowrap tabular-nums">
          {formatDate(l.startDate, lang)} – {formatDate(l.endDate, lang)}
        </span>
      ),
    },
    { key: 'rent', header: t('property.leases.columns.rent'), numeric: true, render: (l) => formatBaht(l.monthlyRent) },
    {
      key: 'status',
      header: t('property.leases.columns.status'),
      render: (l) => (
        <span className="flex flex-wrap gap-1">
          <StatusBadge status={BADGE[l.status]} label={t(`property.leaseStatus.${l.status}`)} />
          {l.expiring && <StatusBadge status="pending" label={t('property.leaseStatus.expiring')} />}
        </span>
      ),
    },
    {
      key: 'actions',
      header: t('property.leases.columns.actions'),
      align: 'right',
      render: (l) => (
        <span className="inline-flex gap-1">
          <IconButton
            icon="edit"
            label={t('property.leases.editLabel', { unit: l.unitCode })}
            disabled={!l.editable}
            disabledHint={t('property.leases.lockedHint')}
            onClick={() => setDialog({ kind: 'form', lease: l })}
          />
          <IconButton
            icon="event_busy"
            label={t('property.leases.cancelLabel', { unit: l.unitCode })}
            disabled={!l.editable}
            disabledHint={t('property.leases.lockedHint')}
            danger
            onClick={() => setDialog({ kind: 'cancel', lease: l })}
          />
          <IconButton
            icon="fact_check"
            label={t('property.leases.inspectLabel', { unit: l.unitCode })}
            disabled={l.nextInspection === null}
            disabledHint={t('property.leases.inspectionsDone')}
            onClick={() => navigate(`/juristic/units/inspections?lease=${l.id}&type=${l.nextInspection}`)}
          />
        </span>
      ),
    },
  ]

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-primary-container">{t('property.tabs.leases')}</h2>
        <Button onClick={() => setDialog({ kind: 'form' })}>{t('property.leases.add')}</Button>
      </div>

      <div className="mt-4 max-w-xs">
        <label className="flex flex-col gap-1 text-sm font-medium text-on-surface">
          {t('property.filters.status')}
          <select className={FIELD} value={status} onChange={(e) => setStatus(e.target.value as 'all' | LeaseStatus)}>
            <option value="all">{t('property.filters.allStatuses')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`property.leaseStatus.${s}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4">
        <DataTable columns={columns} rows={rows} rowKey={(l) => l.id} />
      </div>

      {dialog?.kind === 'form' && <LeaseFormModal lease={dialog.lease} onClose={closeDialog} />}

      <ConfirmDialog
        open={dialog?.kind === 'cancel'}
        title={t('property.leases.cancelTitle')}
        message={dialog?.kind === 'cancel' ? t('property.leases.cancelConfirm', { unit: rows.find((r) => r.id === dialog.lease.id)?.unitCode }) : undefined}
        confirmLabel={t('property.leases.cancelButton')}
        cancelLabel={t('property.leases.keepButton')}
        danger
        pending={cancelling}
        onConfirm={() => dialog?.kind === 'cancel' && confirmCancel(dialog.lease)}
        onCancel={closeDialog}
      >
        <label className="mt-4 flex flex-col gap-1 text-sm font-medium text-on-surface">
          {t('property.leases.reasonLabel')}
          <textarea
            rows={3}
            className="rounded border border-[#cbd5e1] bg-surface-container-lowest px-3 py-2 text-sm text-primary-container"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {cancelError && (
          <p role="alert" className="mt-3 text-sm text-error">
            {cancelError === 'locked' ? t('property.leases.lockedHint') : t('auth.errors.generic')}
          </p>
        )}
      </ConfirmDialog>
    </section>
  )
}

interface IconButtonProps {
  icon: string
  label: string
  onClick(): void
  disabled?: boolean
  disabledHint?: string
  danger?: boolean
}

function IconButton({ icon, label, onClick, disabled = false, disabledHint, danger = false }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={disabled && disabledHint ? `${label} — ${disabledHint}` : label}
      disabled={disabled}
      onClick={onClick}
      className={`rounded p-1 hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-40 ${danger ? 'text-error' : 'text-primary-container'}`}
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        {icon}
      </span>
    </button>
  )
}

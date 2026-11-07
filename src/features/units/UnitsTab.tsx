import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '../../components/Button'
import ConfirmDialog from '../../components/ConfirmDialog'
import DataTable, { type Column } from '../../components/DataTable'
import Pager from '../../components/Pager'
import StatusBadge, { type Status } from '../../components/StatusBadge'
import { formatBaht } from '../../lib/format'
import { unitStatus, type UnitStatus } from '../../property/rules'
import { PropertyError, type Unit } from '../../property/types'
import { useProperty } from '../../property/useProperty'
import UnitFormModal from './UnitFormModal'

const PAGE_SIZE = 10
const STATUSES: UnitStatus[] = ['rented', 'vacant', 'ownerOccupied', 'closed']
const BADGE: Record<UnitStatus, Status> = { rented: 'settled', vacant: 'pending', ownerOccupied: 'inactive', closed: 'critical' }

type Row = Unit & { status: UnitStatus }
type Dialog = { kind: 'form'; unit?: Unit } | { kind: 'delete'; unit: Unit } | null

const FIELD = 'h-10 rounded border border-[#cbd5e1] bg-surface-container-lowest px-3 text-sm text-primary-container'

export default function UnitsTab() {
  const { t } = useTranslation()
  const { data, today, deleteUnit } = useProperty()
  const [query, setQuery] = useState('')
  const [tower, setTower] = useState('all')
  const [status, setStatus] = useState<'all' | UnitStatus>('all')
  const [page, setPage] = useState(1)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [deleteError, setDeleteError] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const inFlight = useRef(false)

  const towers = useMemo(() => [...new Set(data.units.map((u) => u.tower))].sort(), [data.units])

  const rows: Row[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.units
      .map((u) => ({ ...u, status: unitStatus(u, data.leases, today) }))
      .filter((u) => (tower === 'all' || u.tower === tower) && (status === 'all' || u.status === status))
      .filter((u) => q === '' || u.code.toLowerCase().includes(q) || u.ownerName.toLowerCase().includes(q))
      .sort((a, b) => a.code.localeCompare(b.code))
  }, [data.units, data.leases, today, query, tower, status])

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const visible = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  const closeDialog = () => {
    setDialog(null)
    setDeleteError(false)
  }

  const confirmDelete = async (unit: Unit) => {
    if (inFlight.current) return
    inFlight.current = true
    setDeleting(true)
    setDeleteError(false)
    try {
      await deleteUnit(unit.id)
      closeDialog()
    } catch (err) {
      if (err instanceof PropertyError && err.code === 'unit_has_leases') setDeleteError(true)
      else closeDialog()
    } finally {
      inFlight.current = false
      setDeleting(false)
    }
  }

  const columns: Column<Row>[] = [
    { key: 'code', header: t('property.units.columns.code'), render: (u) => <span className="whitespace-nowrap font-semibold tabular-nums">{u.code}</span> },
    { key: 'towerFloor', header: t('property.units.columns.towerFloor'), render: (u) => <span className="whitespace-nowrap">{t('property.units.towerFloor', { tower: u.tower, floor: u.floor })}</span> },
    {
      key: 'typeArea',
      header: t('property.units.columns.typeArea'),
      render: (u) => (
        <span className="whitespace-nowrap">
          {t(`property.unitType.${u.type}`)} • {t('property.units.sqm', { area: u.areaSqm })}
        </span>
      ),
    },
    { key: 'owner', header: t('property.units.columns.owner'), render: (u) => u.ownerName },
    { key: 'status', header: t('property.units.columns.status'), render: (u) => <StatusBadge status={BADGE[u.status]} label={t(`property.unitStatus.${u.status}`)} /> },
    { key: 'rent', header: t('property.units.columns.rent'), numeric: true, render: (u) => (u.ownership === 'forRent' ? formatBaht(u.listRent) : '—') },
    {
      key: 'actions',
      header: t('property.units.columns.actions'),
      align: 'right',
      render: (u) => (
        <span className="inline-flex gap-1">
          <button
            type="button"
            aria-label={t('property.units.editLabel', { code: u.code })}
            title={t('property.units.editLabel', { code: u.code })}
            onClick={() => setDialog({ kind: 'form', unit: u })}
            className="rounded p-1 text-primary-container hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              edit
            </span>
          </button>
          <button
            type="button"
            aria-label={t('property.units.deleteLabel', { code: u.code })}
            title={t('property.units.deleteLabel', { code: u.code })}
            onClick={() => setDialog({ kind: 'delete', unit: u })}
            className="rounded p-1 text-error hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              delete
            </span>
          </button>
        </span>
      ),
    },
  ]

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-primary-container">{t('property.tabs.units')}</h2>
        <Button onClick={() => setDialog({ kind: 'form' })}>{t('property.units.add')}</Button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-on-surface">
          {t('property.filters.search')}
          <input
            type="search"
            className={FIELD}
            placeholder={t('property.filters.searchPlaceholder')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(1)
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-on-surface">
          {t('property.filters.tower')}
          <select
            className={FIELD}
            value={tower}
            onChange={(e) => {
              setTower(e.target.value)
              setPage(1)
            }}
          >
            <option value="all">{t('property.filters.allTowers')}</option>
            {towers.map((tw) => (
              <option key={tw} value={tw}>
                {tw}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-on-surface">
          {t('property.filters.status')}
          <select
            className={FIELD}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as 'all' | UnitStatus)
              setPage(1)
            }}
          >
            <option value="all">{t('property.filters.allStatuses')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`property.unitStatus.${s}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4">
        <DataTable columns={columns} rows={visible} rowKey={(u) => u.id} />
        <Pager page={current} pageCount={pageCount} onChange={setPage} />
      </div>

      {dialog?.kind === 'form' && <UnitFormModal unit={dialog.unit} onClose={closeDialog} />}

      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        title={t('property.units.deleteTitle')}
        message={dialog?.kind === 'delete' ? t('property.units.deleteConfirm', { code: dialog.unit.code }) : undefined}
        confirmLabel={t('property.units.deleteButton')}
        danger
        pending={deleting}
        onConfirm={() => dialog?.kind === 'delete' && confirmDelete(dialog.unit)}
        onCancel={closeDialog}
      >
        {deleteError && (
          <p role="alert" className="mt-3 text-sm text-error">
            {t('property.units.hasLeases')}
          </p>
        )}
      </ConfirmDialog>
    </section>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import Button from '../../components/Button'
import DataTable, { type Column } from '../../components/DataTable'
import StatusBadge from '../../components/StatusBadge'
import { formatDate } from '../../lib/format'
import { damagedCount } from '../../property/rules'
import type { Inspection, InspectionType } from '../../property/types'
import { useProperty } from '../../property/useProperty'
import InspectionFormModal from './InspectionFormModal'

const TYPES: InspectionType[] = ['moveIn', 'moveOut']
const isType = (value: string | null): value is InspectionType => value === 'moveIn' || value === 'moveOut'

type Row = Inspection & { unitCode: string; tenantName: string; problems: number }
type Dialog = { kind: 'form'; inspection?: Inspection } | null

const FIELD = 'h-10 rounded border border-[#cbd5e1] bg-surface-container-lowest px-3 text-sm text-primary-container'

export default function InspectionsTab() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'th'
  const { status, data } = useProperty()
  const [searchParams, setSearchParams] = useSearchParams()
  const [type, setType] = useState<'all' | InspectionType>('all')
  const [dialog, setDialog] = useState<Dialog>(null)

  const hasType = (leaseId: string, kind: InspectionType) => data.inspections.some((i) => i.leaseId === leaseId && i.type === kind)
  const canInspect = data.leases.some((l) => TYPES.some((kind) => !hasType(l.id, kind)))

  // ?lease=<id>&type=<moveIn|moveOut> (from the lease list): open the form filled in, if it makes sense
  const leaseParam = searchParams.get('lease')
  const typeParam = searchParams.get('type')
  const hasParams = leaseParam !== null || typeParam !== null
  const prefillUsable =
    status === 'ready' && leaseParam !== null && isType(typeParam) && data.leases.some((l) => l.id === leaseParam) && !hasType(leaseParam, typeParam)
  const urlPrefill = prefillUsable && leaseParam !== null && isType(typeParam) ? { leaseId: leaseParam, type: typeParam } : null

  useEffect(() => {
    // parameters that cannot be used are dropped right away; usable ones are dropped when the form closes
    if (status === 'ready' && hasParams && !prefillUsable) setSearchParams({}, { replace: true })
  }, [status, hasParams, prefillUsable, setSearchParams])

  const closeForm = () => {
    setDialog(null)
    if (hasParams) setSearchParams({}, { replace: true })
  }

  const rows: Row[] = useMemo(
    () =>
      data.inspections
        .map((i) => {
          const lease = data.leases.find((l) => l.id === i.leaseId)
          return {
            ...i,
            unitCode: data.units.find((u) => u.id === lease?.unitId)?.code ?? '?',
            tenantName: lease?.tenantName ?? '',
            problems: damagedCount(i),
          }
        })
        .filter((i) => type === 'all' || i.type === type)
        .sort((a, b) => b.date.localeCompare(a.date) || a.unitCode.localeCompare(b.unitCode)),
    [data, type],
  )

  const columns: Column<Row>[] = [
    { key: 'unit', header: t('property.inspections.columns.unit'), render: (i) => <span className="whitespace-nowrap font-semibold tabular-nums">{i.unitCode}</span> },
    { key: 'tenant', header: t('property.inspections.columns.tenant'), render: (i) => i.tenantName },
    { key: 'type', header: t('property.inspections.columns.type'), render: (i) => <span className="whitespace-nowrap">{t(`property.inspectionType.${i.type}`)}</span> },
    { key: 'date', header: t('property.inspections.columns.date'), render: (i) => <span className="whitespace-nowrap tabular-nums">{formatDate(i.date, lang)}</span> },
    { key: 'inspector', header: t('property.inspections.columns.inspector'), render: (i) => i.inspector },
    {
      key: 'problems',
      header: t('property.inspections.columns.problems'),
      render: (i) =>
        i.problems === 0 ? (
          <StatusBadge status="settled" label={t('property.inspections.allOk')} />
        ) : (
          <StatusBadge status="critical" label={t('property.inspections.problems', { count: i.problems })} />
        ),
    },
    {
      key: 'actions',
      header: t('property.inspections.columns.actions'),
      align: 'right',
      render: (i) => {
        const label = t('property.inspections.openLabel', { unit: i.unitCode, type: t(`property.inspectionType.${i.type}`) })
        return (
          <button
            type="button"
            aria-label={label}
            title={label}
            onClick={() => setDialog({ kind: 'form', inspection: i })}
            className="rounded p-1 text-primary-container hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              visibility
            </span>
          </button>
        )
      },
    },
  ]

  const form = dialog ?? (urlPrefill ? ({ kind: 'form', prefill: urlPrefill } as const) : null)

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-primary-container">{t('property.tabs.inspections')}</h2>
        <Button disabled={!canInspect} title={canInspect ? undefined : t('property.inspections.noneLeft')} onClick={() => setDialog({ kind: 'form' })}>
          {t('property.inspections.record')}
        </Button>
      </div>

      <div className="mt-4 max-w-xs">
        <label className="flex flex-col gap-1 text-sm font-medium text-on-surface">
          {t('property.filters.inspectionType')}
          <select className={FIELD} value={type} onChange={(e) => setType(e.target.value as 'all' | InspectionType)}>
            <option value="all">{t('property.filters.allTypes')}</option>
            {TYPES.map((kind) => (
              <option key={kind} value={kind}>
                {t(`property.inspectionType.${kind}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4">
        <DataTable columns={columns} rows={rows} rowKey={(i) => i.id} />
      </div>

      {form && (
        <InspectionFormModal
          key={`${form.kind}-${'inspection' in form && form.inspection ? form.inspection.id : 'new'}-${'prefill' in form && form.prefill ? `${form.prefill.leaseId}-${form.prefill.type}` : ''}`}
          inspection={'inspection' in form ? form.inspection : undefined}
          prefill={'prefill' in form ? form.prefill : undefined}
          onClose={closeForm}
        />
      )}
    </section>
  )
}

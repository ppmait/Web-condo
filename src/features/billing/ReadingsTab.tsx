import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '../../components/Button'
import StatusBadge from '../../components/StatusBadge'
import { formatBaht } from '../../lib/format'
import { billable, computeLines, isLatestReading, previousReading, validateReading, type FieldErrors } from '../../billing/rules'
import { BillingError, type MeterReading, type MeterReadingInput, type Period } from '../../billing/types'
import { useBilling } from '../../billing/useBilling'
import { useProperty } from '../../property/useProperty'
import IssueDialog from './IssueDialog'
import { usePeriod } from './usePeriod'

type Field = 'waterPrev' | 'waterCurr' | 'electricPrev' | 'electricCurr'
type Draft = Record<Field, string>
const FIELDS: Field[] = ['waterPrev', 'waterCurr', 'electricPrev', 'electricCurr']

const toNumber = (text: string): number => (text.trim() === '' ? NaN : Number(text))
const text = (n: number | undefined): string => (n === undefined ? '' : String(n))

export default function ReadingsTab() {
  const period = usePeriod()
  // a different period starts with empty drafts and no leftover messages
  return <ReadingsTable key={period} period={period} />
}

function ReadingsTable({ period }: { period: Period }) {
  const { t } = useTranslation()
  const { data: property } = useProperty()
  const { data, saveReading } = useBilling()
  const [drafts, setDrafts] = useState<Record<string, Partial<Draft>>>({})
  const [errors, setErrors] = useState<Record<string, FieldErrors>>({})
  const [failed, setFailed] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const inFlight = useRef(new Set<string>())
  const [focus, setFocus] = useState<{ unitId: string; tick: number } | null>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const [issueOpen, setIssueOpen] = useState(false)

  useEffect(() => {
    if (!focus) return
    const row = tableRef.current?.querySelector<HTMLElement>(`tr[data-unit="${focus.unitId}"]`)
    row?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [focus])

  const rows = billable(property, period).map(({ unit, lease }) => {
    const reading = data.readings.find((r) => r.unitId === unit.id && r.period === period)
    const invoice = data.invoices.find((i) => i.unitId === unit.id && i.period === period)
    const earlier = previousReading(data.readings, unit.id, period)
    const lockedKey = invoice ? 'billing.errors.readingLocked' : !isLatestReading(data.readings, unit.id, period) ? 'billing.errors.readingChained' : null
    return { unit, lease, reading, invoice, earlier, lockedKey }
  })

  const ready = rows.filter((r) => r.reading && !r.invoice)
  const missing = rows.filter((r) => !r.reading && !r.invoice).map((r) => r.unit.code)

  const valueOf = (unitId: string, field: Field, saved: MeterReading | undefined, earlier: MeterReading | undefined): string => {
    const draft = drafts[unitId]?.[field]
    if (draft !== undefined) return draft
    if (saved) return text(saved[field])
    if (field === 'waterPrev') return text(earlier?.waterCurr)
    if (field === 'electricPrev') return text(earlier?.electricCurr)
    return ''
  }

  const change = (unitId: string, field: Field, value: string) => {
    setDrafts((d) => ({ ...d, [unitId]: { ...d[unitId], [field]: value } }))
    setErrors((all) => {
      const mine = all[unitId]
      if (!mine?.[field]) return all
      const rest = { ...mine }
      delete rest[field]
      return { ...all, [unitId]: rest }
    })
  }

  const save = async (row: (typeof rows)[number]) => {
    const id = row.unit.id
    if (inFlight.current.has(id)) return
    setFailed((f) => ({ ...f, [id]: false }))
    const input: MeterReadingInput = {
      unitId: id,
      period,
      waterPrev: toNumber(valueOf(id, 'waterPrev', row.reading, row.earlier)),
      waterCurr: toNumber(valueOf(id, 'waterCurr', row.reading, row.earlier)),
      electricPrev: toNumber(valueOf(id, 'electricPrev', row.reading, row.earlier)),
      electricCurr: toNumber(valueOf(id, 'electricCurr', row.reading, row.earlier)),
    }
    const found = validateReading(input, { readings: data.readings, invoices: data.invoices, selfId: row.reading?.id })
    if (Object.keys(found).length > 0) {
      setErrors((all) => ({ ...all, [id]: found }))
      setFocus((f) => ({ unitId: id, tick: (f?.tick ?? 0) + 1 }))
      return
    }
    inFlight.current.add(id)
    setSaving((s) => ({ ...s, [id]: true }))
    try {
      await saveReading(input)
      setDrafts((d) => {
        const rest = { ...d }
        delete rest[id]
        return rest
      })
      setErrors((all) => ({ ...all, [id]: {} }))
    } catch (err) {
      if (err instanceof BillingError && err.code === 'invalid_input' && err.fieldErrors) {
        setErrors((all) => ({ ...all, [id]: err.fieldErrors as FieldErrors }))
        setFocus((f) => ({ unitId: id, tick: (f?.tick ?? 0) + 1 }))
      } else {
        setFailed((f) => ({ ...f, [id]: true }))
      }
    } finally {
      inFlight.current.delete(id)
      setSaving((s) => ({ ...s, [id]: false }))
    }
  }

  const input = (row: (typeof rows)[number], meter: 'water' | 'electric', which: 'Prev' | 'Curr') => {
    const field = `${meter}${which}` as Field
    const error = errors[row.unit.id]?.[field]
    const prevLocked = which === 'Prev' && row.earlier !== undefined
    const disabled = row.lockedKey !== null || prevLocked
    const errorId = `${row.unit.id}-${field}-error`
    return (
      <div className="flex flex-col gap-1">
        <input
          type="text"
          inputMode="numeric"
          aria-label={t('billing.readings.inputLabel', {
            meter: t(`billing.readings.${meter}`),
            field: t(`billing.readings.${which === 'Prev' ? 'prev' : 'curr'}`),
            unit: row.unit.code,
          })}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          disabled={disabled}
          value={valueOf(row.unit.id, field, row.reading, row.earlier)}
          onChange={(e) => change(row.unit.id, field, e.target.value)}
          className={`h-9 w-24 rounded border bg-surface-container-lowest px-2 text-right text-sm tabular-nums outline-none focus:border-primary-container disabled:bg-[#f1f5f9] disabled:text-on-surface-variant ${error ? 'border-error' : 'border-[#cbd5e1]'}`}
        />
        {error && (
          <p id={errorId} className="max-w-32 text-xs text-error">
            {t(error)}
          </p>
        )}
      </div>
    )
  }

  /** usage and amount, or dashes while the four numbers do not make a valid reading */
  const lines = (row: (typeof rows)[number]) => {
    const id = row.unit.id
    const draft: MeterReading = {
      id: '',
      unitId: id,
      period,
      waterPrev: toNumber(valueOf(id, 'waterPrev', row.reading, row.earlier)),
      waterCurr: toNumber(valueOf(id, 'waterCurr', row.reading, row.earlier)),
      electricPrev: toNumber(valueOf(id, 'electricPrev', row.reading, row.earlier)),
      electricCurr: toNumber(valueOf(id, 'electricCurr', row.reading, row.earlier)),
    }
    const ok = FIELDS.every((f) => Number.isInteger(draft[f]) && draft[f] >= 0) && draft.waterCurr >= draft.waterPrev && draft.electricCurr >= draft.electricPrev
    return ok ? computeLines(draft, row.unit.areaSqm, data.rates) : null
  }

  const stateOf = (row: (typeof rows)[number]) => (row.invoice ? 'invoiced' : row.reading ? 'recorded' : 'none')
  const BADGE = { invoiced: 'settled', recorded: 'pending', none: 'inactive' } as const

  const th = 'px-3 text-[11px] font-semibold uppercase tracking-wide text-[#64748b]'

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-primary-container">{t('billing.readings.title')}</h2>
        <div className="flex flex-col items-end gap-1">
          <Button disabled={ready.length === 0} onClick={() => setIssueOpen(true)}>
            {t('billing.issue.open')}
          </Button>
          {ready.length === 0 && rows.length > 0 && <p className="text-xs text-on-surface-variant">{t('billing.issue.noneReady')}</p>}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 rounded-lg border border-[#e2e8f0] px-4 py-8 text-center text-sm text-on-surface-variant">{t('billing.readings.empty')}</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-[#e2e8f0] bg-surface-container-lowest">
          <table ref={tableRef} className="w-full border-collapse text-sm">
            <thead>
              <tr className="h-10 border-b border-[#e2e8f0] bg-[#f8fafc] text-left">
                <th scope="col" className={th}>{t('billing.readings.unit')}</th>
                <th scope="col" className={th}>{t('billing.readings.tenant')}</th>
                <th scope="col" className={th}>{t('billing.readings.water')} ({t('billing.readings.prev')})</th>
                <th scope="col" className={th}>{t('billing.readings.water')} ({t('billing.readings.curr')})</th>
                <th scope="col" className={`${th} text-right`}>{t('billing.readings.water')} ({t('billing.readings.usage')} / {t('billing.readings.amount')})</th>
                <th scope="col" className={th}>{t('billing.readings.electric')} ({t('billing.readings.prev')})</th>
                <th scope="col" className={th}>{t('billing.readings.electric')} ({t('billing.readings.curr')})</th>
                <th scope="col" className={`${th} text-right`}>{t('billing.readings.electric')} ({t('billing.readings.usage')} / {t('billing.readings.amount')})</th>
                <th scope="col" className={`${th} text-right`}>{t('billing.readings.common')}</th>
                <th scope="col" className={th}>{t('billing.readings.status')}</th>
                <th scope="col" className={th}>
                  <span className="sr-only">{t('billing.readings.save')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const computed = lines(row)
                const state = stateOf(row)
                const rowError = errors[row.unit.id]
                const rowMessage = row.lockedKey ?? rowError?.reading ?? rowError?.unitId ?? rowError?.period
                return (
                  <tr key={row.unit.id} data-unit={row.unit.id} className="border-b border-[#f1f5f9] align-top last:border-b-0">
                    <th scope="row" className="px-3 py-2 text-left font-semibold">{row.unit.code}</th>
                    <td className="px-3 py-2">{row.lease.tenantName}</td>
                    <td className="px-3 py-2">{input(row, 'water', 'Prev')}</td>
                    <td className="px-3 py-2">{input(row, 'water', 'Curr')}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {computed ? (
                        <>
                          {computed.water.units}
                          <br />
                          <span className="text-on-surface-variant">{formatBaht(computed.water.amount)}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2">{input(row, 'electric', 'Prev')}</td>
                    <td className="px-3 py-2">{input(row, 'electric', 'Curr')}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {computed ? (
                        <>
                          {computed.electric.units}
                          <br />
                          <span className="text-on-surface-variant">{formatBaht(computed.electric.amount)}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatBaht(computeLines({ id: '', unitId: row.unit.id, period, waterPrev: 0, waterCurr: 0, electricPrev: 0, electricCurr: 0 }, row.unit.areaSqm, data.rates).common.amount)}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={BADGE[state]} label={t(`billing.readings.state.${state}`)} />
                      {rowMessage && <p className="mt-1 max-w-48 text-xs text-on-surface-variant">{t(rowMessage)}</p>}
                      {failed[row.unit.id] && (
                        <p role="alert" className="mt-1 max-w-48 text-xs text-error">
                          {t('billing.readings.failed')}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {row.lockedKey === null && (
                        <Button
                          variant="secondary"
                          className="h-9 px-3"
                          aria-label={t('billing.readings.saveRow', { unit: row.unit.code })}
                          disabled={saving[row.unit.id] === true}
                          onClick={() => void save(row)}
                        >
                          {t('billing.readings.save')}
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {issueOpen && <IssueDialog period={period} readyCount={ready.length} missing={missing} onClose={() => setIssueOpen(false)} />}
    </div>
  )
}

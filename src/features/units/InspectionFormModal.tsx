import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/useAuth'
import Button from '../../components/Button'
import FormField from '../../components/FormField'
import Modal from '../../components/Modal'
import { validateInspection, type FieldErrors } from '../../property/rules'
import {
  CHECK_ITEMS,
  CONDITIONS,
  PropertyError,
  type CheckItemKey,
  type Condition,
  type Inspection,
  type InspectionInput,
  type InspectionType,
} from '../../property/types'
import { useProperty } from '../../property/useProperty'

interface Props {
  /** the inspection to open for viewing / editing */
  inspection?: Inspection
  /** lease and type to start from when recording a new inspection */
  prefill?: { leaseId: string; type: InspectionType }
  onClose(): void
}

interface ItemState {
  condition: Condition
  note: string
}

interface FormState {
  leaseId: string
  type: InspectionType | ''
  date: string
  inspector: string
  items: Record<CheckItemKey, ItemState>
  waterMeter: string
  electricMeter: string
  note: string
}

const ALL_TYPES: InspectionType[] = ['moveIn', 'moveOut']
const emptyItems = () => Object.fromEntries(CHECK_ITEMS.map((key) => [key, { condition: 'ok', note: '' }])) as Record<CheckItemKey, ItemState>
const meterText = (value: number | undefined) => (value === undefined ? '' : String(value))
const meterValue = (text: string) => (text.trim() === '' ? undefined : Number(text))

/** Record / view an inspection. Mount it only while it is open, so the form starts fresh every time. */
export default function InspectionFormModal({ inspection, prefill, onClose }: Props) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { data, today, saveInspection } = useProperty()

  const [form, setForm] = useState<FormState>(() =>
    inspection
      ? {
          leaseId: inspection.leaseId,
          type: inspection.type,
          date: inspection.date,
          inspector: inspection.inspector,
          items: Object.fromEntries(inspection.items.map((i) => [i.key, { condition: i.condition, note: i.note }])) as Record<CheckItemKey, ItemState>,
          waterMeter: meterText(inspection.waterMeter),
          electricMeter: meterText(inspection.electricMeter),
          note: inspection.note,
        }
      : {
          leaseId: prefill?.leaseId ?? '',
          type: prefill?.type ?? '',
          date: today,
          inspector: user?.fullName ?? '',
          items: emptyItems(),
          waterMeter: '',
          electricMeter: '',
          note: '',
        },
  )
  const [errors, setErrors] = useState<FieldErrors>({})
  const [generalError, setGeneralError] = useState(false)
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const [focusTick, setFocusTick] = useState(0)

  const editing = inspection !== undefined
  const freeTypes = (leaseId: string) =>
    ALL_TYPES.filter((type) => !data.inspections.some((i) => i.leaseId === leaseId && i.type === type && i.id !== inspection?.id))

  const unitCode = (unitId: string) => data.units.find((u) => u.id === unitId)?.code ?? '?'
  const leaseOptions = data.leases
    .filter((l) => l.id === inspection?.leaseId || freeTypes(l.id).length > 0)
    .map((l) => ({ id: l.id, label: `${unitCode(l.unitId)} — ${l.tenantName}`, code: unitCode(l.unitId) }))
    .sort((a, b) => a.code.localeCompare(b.code))
  const typeOptions = form.leaseId ? freeTypes(form.leaseId) : []

  useEffect(() => {
    if (focusTick > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [focusTick])

  const clearError = (name: string) =>
    setErrors((e) => {
      if (!e[name]) return e
      const rest = { ...e }
      delete rest[name]
      return rest
    })

  const change = <K extends keyof FormState>(name: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [name]: value }))
    clearError(name)
  }

  const chooseLease = (leaseId: string) => {
    const free = leaseId ? freeTypes(leaseId) : []
    setForm((f) => ({ ...f, leaseId, type: free.length === 1 ? free[0] : free.includes(f.type as InspectionType) ? f.type : '' }))
    clearError('leaseId')
    clearError('type')
  }

  const changeItem = (key: CheckItemKey, patch: Partial<ItemState>) => {
    setForm((f) => ({ ...f, items: { ...f.items, [key]: { ...f.items[key], ...patch } } }))
    clearError(`item:${key}`)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (inFlight.current) return
    setGeneralError(false)
    const input: InspectionInput = {
      leaseId: form.leaseId,
      type: form.type as InspectionType,
      date: form.date,
      inspector: form.inspector,
      items: CHECK_ITEMS.map((key) => ({ key, ...form.items[key] })),
      waterMeter: meterValue(form.waterMeter),
      electricMeter: meterValue(form.electricMeter),
      note: form.note,
    }
    const found = validateInspection(input, { leases: data.leases, inspections: data.inspections, selfId: inspection?.id })
    setErrors(found)
    if (Object.keys(found).length > 0) {
      setFocusTick((n) => n + 1)
      return
    }

    inFlight.current = true
    setPending(true)
    try {
      await saveInspection(input, inspection?.id)
      onClose()
    } catch (err) {
      if (err instanceof PropertyError && err.code === 'invalid_input' && err.fieldErrors) {
        setErrors(err.fieldErrors)
        setFocusTick((n) => n + 1)
      } else {
        setGeneralError(true)
      }
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  const err = (name: string) => (errors[name] ? t(errors[name]) : undefined)

  return (
    <Modal open title={t(editing ? 'property.inspections.editTitle' : 'property.inspections.recordTitle')} onClose={onClose}>
      <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormField label={t('property.fields.leaseId')} error={err('leaseId')}>
          {(a) => (
            <select {...a} disabled={editing} value={form.leaseId} onChange={(e) => chooseLease(e.target.value)}>
              <option value="">{t('property.inspections.chooseLease')}</option>
              {leaseOptions.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          )}
        </FormField>

        <FormField label={t('property.fields.inspectionType')} error={err('type')}>
          {(a) => (
            <select {...a} disabled={editing} value={form.type} onChange={(e) => change('type', e.target.value as InspectionType)}>
              {form.type === '' && <option value="">{t('property.inspections.chooseType')}</option>}
              {typeOptions.map((type) => (
                <option key={type} value={type}>
                  {t(`property.inspectionType.${type}`)}
                </option>
              ))}
            </select>
          )}
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label={t('property.fields.date')} error={err('date')}>
            {(a) => <input {...a} type="date" value={form.date} onChange={(e) => change('date', e.target.value)} />}
          </FormField>
          <FormField label={t('property.fields.inspector')} error={err('inspector')}>
            {(a) => <input {...a} type="text" value={form.inspector} onChange={(e) => change('inspector', e.target.value)} />}
          </FormField>
        </div>

        <div className="flex flex-col gap-3">
          {CHECK_ITEMS.map((key) => (
            <fieldset key={key} className="rounded-lg border border-[#e2e8f0] p-3">
              <legend className="px-1 text-sm font-semibold text-primary-container">{t(`property.checkItems.${key}`)}</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
                <FormField label={t('property.inspections.conditionLabel')}>
                  {(a) => (
                    <select {...a} value={form.items[key].condition} onChange={(e) => changeItem(key, { condition: e.target.value as Condition })}>
                      {CONDITIONS.map((c) => (
                        <option key={c} value={c}>
                          {t(`property.condition.${c}`)}
                        </option>
                      ))}
                    </select>
                  )}
                </FormField>
                <FormField label={t('property.inspections.noteLabel')} error={err(`item:${key}`)}>
                  {(a) => <input {...a} type="text" value={form.items[key].note} onChange={(e) => changeItem(key, { note: e.target.value })} />}
                </FormField>
              </div>
            </fieldset>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label={t('property.fields.waterMeter')} error={err('waterMeter')}>
            {(a) => <input {...a} type="number" inputMode="decimal" value={form.waterMeter} onChange={(e) => change('waterMeter', e.target.value)} />}
          </FormField>
          <FormField label={t('property.fields.electricMeter')} error={err('electricMeter')}>
            {(a) => <input {...a} type="number" inputMode="decimal" value={form.electricMeter} onChange={(e) => change('electricMeter', e.target.value)} />}
          </FormField>
        </div>

        <FormField label={t('property.inspections.generalNote')}>
          {(a) => <textarea {...a} rows={3} className={`${a.className} h-auto py-2`} value={form.note} onChange={(e) => change('note', e.target.value)} />}
        </FormField>

        {generalError && (
          <p role="alert" className="text-sm text-error">
            {t('auth.errors.generic')}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={pending}>
            {t('property.inspections.save')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

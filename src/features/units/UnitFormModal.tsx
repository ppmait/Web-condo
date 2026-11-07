import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '../../components/Button'
import FormField from '../../components/FormField'
import Modal from '../../components/Modal'
import { unitHasLeases, validateUnit, type FieldErrors } from '../../property/rules'
import {
  OWNERSHIPS,
  PropertyError,
  UNIT_TYPES,
  type Ownership,
  type Unit,
  type UnitInput,
  type UnitType,
} from '../../property/types'
import { useProperty } from '../../property/useProperty'

interface Props {
  /** the unit to edit; leave out to add a new one */
  unit?: Unit
  onClose(): void
}

interface FormState {
  code: string
  floor: string
  areaSqm: string
  type: UnitType
  ownerName: string
  ownership: Ownership
  listRent: string
  closed: boolean
}

const toNumber = (text: string) => (text.trim() === '' ? Number.NaN : Number(text))

function initialState(unit?: Unit): FormState {
  return unit
    ? {
        code: unit.code,
        floor: String(unit.floor),
        areaSqm: String(unit.areaSqm),
        type: unit.type,
        ownerName: unit.ownerName,
        ownership: unit.ownership,
        listRent: String(unit.listRent),
        closed: unit.closed,
      }
    : { code: '', floor: '', areaSqm: '', type: 'studio', ownerName: '', ownership: 'forRent', listRent: '', closed: false }
}

/** Add / edit a unit. Mount it only while it is open, so the form starts fresh every time. */
export default function UnitFormModal({ unit, onClose }: Props) {
  const { t } = useTranslation()
  const { data, createUnit, updateUnit } = useProperty()
  const [form, setForm] = useState<FormState>(() => initialState(unit))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [generalError, setGeneralError] = useState(false)
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const [focusTick, setFocusTick] = useState(0)

  const locked = unit !== undefined && unitHasLeases(unit.id, data.leases)

  // after a failed submit, move focus to the first invalid field so screen-reader users hear the error
  useEffect(() => {
    if (focusTick > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [focusTick])

  const change = <K extends keyof FormState>(name: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [name]: value }))
    setErrors((e) => {
      if (!e[name]) return e
      const rest = { ...e }
      delete rest[name]
      return rest
    })
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (inFlight.current) return
    setGeneralError(false)
    const input: UnitInput = {
      code: form.code,
      floor: toNumber(form.floor),
      areaSqm: toNumber(form.areaSqm),
      type: form.type,
      ownerName: form.ownerName,
      ownership: form.ownership,
      listRent: toNumber(form.listRent),
      closed: form.closed,
    }
    const found = validateUnit(input, data.units, data.leases, unit?.id)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      setFocusTick((n) => n + 1)
      return
    }

    inFlight.current = true
    setPending(true)
    try {
      if (unit) await updateUnit(unit.id, input)
      else await createUnit(input)
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
    <Modal open title={t(unit ? 'property.units.editTitle' : 'property.units.addTitle')} onClose={onClose}>
      <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
        {locked && <p className="text-xs text-on-surface-variant">{t('property.units.lockedHint')}</p>}

        <FormField label={t('property.fields.code')} error={err('code')}>
          {(a) => (
            <input {...a} type="text" autoComplete="off" disabled={locked} value={form.code} onChange={(e) => change('code', e.target.value)} />
          )}
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label={t('property.fields.floor')} error={err('floor')}>
            {(a) => <input {...a} type="number" inputMode="numeric" value={form.floor} onChange={(e) => change('floor', e.target.value)} />}
          </FormField>
          <FormField label={t('property.fields.areaSqm')} error={err('areaSqm')}>
            {(a) => (
              <input {...a} type="number" inputMode="decimal" step="0.1" value={form.areaSqm} onChange={(e) => change('areaSqm', e.target.value)} />
            )}
          </FormField>
        </div>

        <FormField label={t('property.fields.type')} error={err('type')}>
          {(a) => (
            <select {...a} value={form.type} onChange={(e) => change('type', e.target.value as UnitType)}>
              {UNIT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`property.unitType.${type}`)}
                </option>
              ))}
            </select>
          )}
        </FormField>

        <FormField label={t('property.fields.ownerName')} error={err('ownerName')}>
          {(a) => <input {...a} type="text" value={form.ownerName} onChange={(e) => change('ownerName', e.target.value)} />}
        </FormField>

        <FormField label={t('property.fields.ownership')} error={err('ownership')}>
          {(a) => (
            <select {...a} disabled={locked} value={form.ownership} onChange={(e) => change('ownership', e.target.value as Ownership)}>
              {OWNERSHIPS.map((o) => (
                <option key={o} value={o}>
                  {t(`property.ownership.${o}`)}
                </option>
              ))}
            </select>
          )}
        </FormField>

        <FormField label={t('property.fields.listRent')} error={err('listRent')}>
          {(a) => <input {...a} type="number" inputMode="numeric" value={form.listRent} onChange={(e) => change('listRent', e.target.value)} />}
        </FormField>

        <label className="flex items-center gap-2 text-sm text-on-surface">
          <input type="checkbox" checked={form.closed} onChange={(e) => change('closed', e.target.checked)} />
          {t('property.fields.closed')}
        </label>

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
            {t('property.units.save')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

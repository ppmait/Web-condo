import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '../../components/Button'
import FormField from '../../components/FormField'
import Modal from '../../components/Modal'
import { validateLease, type FieldErrors } from '../../property/rules'
import { PropertyError, type Lease, type LeaseInput } from '../../property/types'
import { useProperty } from '../../property/useProperty'

interface Props {
  /** the lease to edit; leave out to create a new one */
  lease?: Lease
  onClose(): void
}

interface FormState {
  unitId: string
  tenantName: string
  tenantPhone: string
  startDate: string
  endDate: string
  monthlyRent: string
  deposit: string
}

const toNumber = (text: string) => (text.trim() === '' ? Number.NaN : Number(text))

function initialState(lease?: Lease): FormState {
  return lease
    ? {
        unitId: lease.unitId,
        tenantName: lease.tenantName,
        tenantPhone: lease.tenantPhone,
        startDate: lease.startDate,
        endDate: lease.endDate,
        monthlyRent: String(lease.monthlyRent),
        deposit: String(lease.deposit),
      }
    : { unitId: '', tenantName: '', tenantPhone: '', startDate: '', endDate: '', monthlyRent: '', deposit: '' }
}

/** Create / edit a lease. Mount it only while it is open, so the form starts fresh every time. */
export default function LeaseFormModal({ lease, onClose }: Props) {
  const { t } = useTranslation()
  const { data, createLease, updateLease } = useProperty()
  const [form, setForm] = useState<FormState>(() => initialState(lease))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [generalError, setGeneralError] = useState<'locked' | 'generic' | null>(null)
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const [focusTick, setFocusTick] = useState(0)

  // only units that can be rented out, plus the unit this lease already belongs to
  const unitOptions = data.units
    .filter((u) => (u.ownership === 'forRent' && !u.closed) || u.id === lease?.unitId)
    .sort((a, b) => a.code.localeCompare(b.code))

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

  const chooseUnit = (unitId: string) => {
    change('unitId', unitId)
    const unit = data.units.find((u) => u.id === unitId)
    // suggest the unit's list rent, but never overwrite what the user already typed
    if (unit && form.monthlyRent.trim() === '') change('monthlyRent', String(unit.listRent))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (inFlight.current) return
    setGeneralError(null)
    const input: LeaseInput = {
      unitId: form.unitId,
      tenantName: form.tenantName,
      tenantPhone: form.tenantPhone,
      startDate: form.startDate,
      endDate: form.endDate,
      monthlyRent: toNumber(form.monthlyRent),
      deposit: toNumber(form.deposit),
    }
    const found = validateLease(input, { units: data.units, leases: data.leases, selfId: lease?.id })
    setErrors(found)
    if (Object.keys(found).length > 0) {
      setFocusTick((n) => n + 1)
      return
    }

    inFlight.current = true
    setPending(true)
    try {
      if (lease) await updateLease(lease.id, input)
      else await createLease(input)
      onClose()
    } catch (err) {
      if (err instanceof PropertyError && err.code === 'invalid_input' && err.fieldErrors) {
        setErrors(err.fieldErrors)
        setFocusTick((n) => n + 1)
      } else if (err instanceof PropertyError && err.code === 'lease_locked') {
        setGeneralError('locked')
      } else {
        setGeneralError('generic')
      }
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  const err = (name: string) => (errors[name] ? t(errors[name]) : undefined)

  return (
    <Modal open title={t(lease ? 'property.leases.editTitle' : 'property.leases.addTitle')} onClose={onClose}>
      <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormField label={t('property.fields.unitId')} error={err('unitId')}>
          {(a) => (
            <select {...a} value={form.unitId} onChange={(e) => chooseUnit(e.target.value)}>
              <option value="">{t('property.leases.chooseUnit')}</option>
              {unitOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code}
                </option>
              ))}
            </select>
          )}
        </FormField>

        <FormField label={t('property.fields.tenantName')} error={err('tenantName')}>
          {(a) => <input {...a} type="text" value={form.tenantName} onChange={(e) => change('tenantName', e.target.value)} />}
        </FormField>

        <FormField label={t('property.fields.tenantPhone')} error={err('tenantPhone')}>
          {(a) => <input {...a} type="tel" inputMode="numeric" autoComplete="off" value={form.tenantPhone} onChange={(e) => change('tenantPhone', e.target.value)} />}
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label={t('property.fields.startDate')} error={err('startDate')}>
            {(a) => <input {...a} type="date" value={form.startDate} onChange={(e) => change('startDate', e.target.value)} />}
          </FormField>
          <FormField label={t('property.fields.endDate')} error={err('endDate')}>
            {(a) => <input {...a} type="date" value={form.endDate} onChange={(e) => change('endDate', e.target.value)} />}
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label={t('property.fields.monthlyRent')} error={err('monthlyRent')}>
            {(a) => <input {...a} type="number" inputMode="numeric" value={form.monthlyRent} onChange={(e) => change('monthlyRent', e.target.value)} />}
          </FormField>
          <FormField label={t('property.fields.deposit')} error={err('deposit')}>
            {(a) => <input {...a} type="number" inputMode="numeric" value={form.deposit} onChange={(e) => change('deposit', e.target.value)} />}
          </FormField>
        </div>

        {generalError && (
          <p role="alert" className="text-sm text-error">
            {generalError === 'locked' ? t('property.leases.lockedHint') : t('auth.errors.generic')}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={pending}>
            {t('property.leases.save')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/useAuth'
import Button from '../../components/Button'
import FormField from '../../components/FormField'
import Modal from '../../components/Modal'
import { validateParcel, type FieldErrors } from '../../facilities/rules'
import { FacilitiesError, type ParcelLocation } from '../../facilities/types'
import { useFacilities } from '../../facilities/useFacilities'
import { useProperty } from '../../property/useProperty'

/** Register a parcel that arrived. Mount it only while it is open, so the form starts fresh every time. */
export default function ParcelFormModal({ onClose }: { onClose(): void }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { today, registerParcel } = useFacilities()
  const { data: property } = useProperty()
  const [form, setForm] = useState({ unitId: '', carrier: '', trackingNo: '', location: 'frontDesk' as ParcelLocation })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [problem, setProblem] = useState<'noLease' | 'storageFailed' | 'failed' | null>(null)
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const [focusTick, setFocusTick] = useState(0)

  useEffect(() => {
    if (focusTick > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [focusTick])

  // only a unit with a tenant whose lease is in force can receive a parcel
  const units = property.leases
    .filter((l) => !l.cancelledAt && l.startDate <= today && today <= l.endDate)
    .map((l) => ({ id: l.unitId, label: `${property.units.find((u) => u.id === l.unitId)?.code ?? '?'} — ${l.tenantName}` }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const change = <K extends keyof typeof form>(name: K, value: (typeof form)[K], errorKey: string) => {
    setForm((f) => ({ ...f, [name]: value }))
    setErrors((e) => {
      if (!e[errorKey]) return e
      const rest = { ...e }
      delete rest[errorKey]
      return rest
    })
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (inFlight.current) return
    setProblem(null)
    const found = validateParcel(form)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      setFocusTick((n) => n + 1)
      return
    }
    inFlight.current = true
    setPending(true)
    try {
      await registerParcel(form, user?.fullName ?? '')
      onClose()
    } catch (err) {
      if (err instanceof FacilitiesError && err.code === 'invalid_input' && err.fieldErrors) {
        setErrors(err.fieldErrors)
        setFocusTick((n) => n + 1)
      } else if (err instanceof FacilitiesError && (err.code === 'no_lease' || err.code === 'not_found')) {
        setProblem('noLease')
      } else if (err instanceof FacilitiesError && err.code === 'storage_failed') {
        setProblem('storageFailed')
      } else {
        setProblem('failed')
      }
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  const err = (name: string) => (errors[name] ? t(errors[name]) : undefined)

  return (
    <Modal open title={t('facilities.juristic.parcels.formTitle')} onClose={onClose}>
      <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormField label={t('facilities.juristic.parcels.unit')} error={err('unitId')}>
          {(a) => (
            <select {...a} value={form.unitId} onChange={(e) => change('unitId', e.target.value, 'unitId')}>
              <option value="">{t('facilities.juristic.parcels.chooseUnit')}</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label={t('facilities.juristic.parcels.carrier')} error={err('carrier')}>
          {(a) => <input {...a} type="text" value={form.carrier} onChange={(e) => change('carrier', e.target.value, 'carrier')} />}
        </FormField>
        <FormField label={t('facilities.juristic.parcels.tracking')} error={err('trackingNo')}>
          {(a) => <input {...a} type="text" value={form.trackingNo} onChange={(e) => change('trackingNo', e.target.value, 'trackingNo')} />}
        </FormField>
        <FormField label={t('facilities.juristic.parcels.location')} error={err('location')}>
          {(a) => (
            <select {...a} value={form.location} onChange={(e) => change('location', e.target.value as ParcelLocation, 'location')}>
              <option value="frontDesk">{t('facilities.location.frontDesk')}</option>
              <option value="locker">{t('facilities.location.locker')}</option>
            </select>
          )}
        </FormField>

        {problem && (
          <p role="alert" className="text-sm text-error">
            {problem === 'noLease' ? t('facilities.juristic.parcels.noLease') : problem === 'storageFailed' ? t('facilities.errors.storageFailed') : t('facilities.juristic.failed')}
          </p>
        )}

        <Button type="submit" disabled={pending}>
          {t('facilities.juristic.parcels.submit')}
        </Button>
      </form>
    </Modal>
  )
}

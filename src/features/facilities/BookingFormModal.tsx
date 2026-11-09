import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/useAuth'
import Button from '../../components/Button'
import FormField from '../../components/FormField'
import Modal from '../../components/Modal'
import { freeAt, validateBooking, type FieldErrors } from '../../facilities/rules'
import { FacilitiesError } from '../../facilities/types'
import { useFacilities } from '../../facilities/useFacilities'
import { isValidDate } from '../../property/dates'

interface Props {
  facilityId?: string
  date?: string
  onClose(): void
}

type Problem = 'noCapacity' | 'quotaExceeded' | 'closed' | 'noLease' | 'storageFailed' | 'failed'
const PROBLEMS: Partial<Record<FacilitiesError['code'], Problem>> = {
  no_capacity: 'noCapacity',
  quota_exceeded: 'quotaExceeded',
  closed: 'closed',
  no_lease: 'noLease',
  storage_failed: 'storageFailed',
}

const toNumber = (text: string): number => (text.trim() === '' ? NaN : Number(text))

/** Mount it only while it is open, so the form starts fresh every time. */
export default function BookingFormModal({ facilityId = '', date = '', onClose }: Props) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { data, today, createBooking } = useFacilities()
  const [form, setForm] = useState({ facilityId, date, start: '', hours: '1', people: '1' })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [problem, setProblem] = useState<Problem | null>(null)
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const [focusTick, setFocusTick] = useState(0)

  useEffect(() => {
    if (focusTick > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [focusTick])

  const facility = data.facilities.find((f) => f.id === form.facilityId)
  const clear = (...names: string[]) =>
    setErrors((e) => {
      if (!names.some((n) => e[n])) return e
      const rest = { ...e }
      for (const n of names) delete rest[n]
      return rest
    })
  const change = (name: keyof typeof form, value: string, ...errorKeys: string[]) => {
    setForm((f) => ({ ...f, [name]: value }))
    clear(...errorKeys)
  }

  const startHour = toNumber(form.start)
  const hours = toNumber(form.hours)
  // the free places of the chosen slot, shown only while the slot makes sense
  const free =
    facility && isValidDate(form.date) && Number.isInteger(startHour) && Number.isInteger(hours) && hours >= 1 && startHour >= facility.openHour && startHour + hours <= facility.closeHour
      ? Math.min(...Array.from({ length: hours }, (_, i) => freeAt(facility, data.bookings, form.date, startHour + i)))
      : null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (inFlight.current) return
    setProblem(null)
    const input = { facilityId: form.facilityId, date: form.date, startHour, endHour: startHour + hours, people: toNumber(form.people) }
    const found = validateBooking(input, facility, today)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      setFocusTick((n) => n + 1)
      return
    }
    inFlight.current = true
    setPending(true)
    try {
      await createBooking({ ...input, tenantPhone: user?.phone ?? '', tenantName: user?.fullName ?? '' })
      onClose()
    } catch (err) {
      if (err instanceof FacilitiesError && err.code === 'invalid_input' && err.fieldErrors) {
        setErrors(err.fieldErrors)
        setFocusTick((n) => n + 1)
      } else {
        setProblem((err instanceof FacilitiesError && PROBLEMS[err.code]) || 'failed')
      }
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  const err = (name: string) => (errors[name] ? t(errors[name]) : undefined)
  const open = data.facilities.filter((f) => !f.closed)

  return (
    <Modal open title={t('facilities.form.title')} onClose={onClose}>
      <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
        {Object.keys(errors).length > 0 && (
          <p role="alert" className="text-sm text-error">
            {t('facilities.errors.incomplete')}
          </p>
        )}

        <FormField label={t('facilities.form.facility')} error={err('facilityId')}>
          {(a) => (
            <select {...a} value={form.facilityId} onChange={(e) => change('facilityId', e.target.value, 'facilityId', 'time')}>
              <option value="">{t('facilities.form.choose')}</option>
              {open.map((f) => (
                <option key={f.id} value={f.id}>
                  {t(`facilities.names.${f.key}`)}
                </option>
              ))}
            </select>
          )}
        </FormField>

        <FormField label={t('facilities.form.date')} error={err('date')}>
          {(a) => <input {...a} type="date" value={form.date} onChange={(e) => change('date', e.target.value, 'date')} />}
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label={t('facilities.form.start')} error={err('time')}>
            {(a) => <input {...a} type="number" inputMode="numeric" value={form.start} onChange={(e) => change('start', e.target.value, 'time')} />}
          </FormField>
          <FormField label={t('facilities.form.hours')}>
            {(a) => <input {...a} type="number" inputMode="numeric" value={form.hours} onChange={(e) => change('hours', e.target.value, 'time')} />}
          </FormField>
        </div>

        <FormField label={t('facilities.form.people')} error={err('people')}>
          {(a) => <input {...a} type="number" inputMode="numeric" value={form.people} onChange={(e) => change('people', e.target.value, 'people')} />}
        </FormField>

        {free !== null && (
          <p aria-live="polite" className="text-sm tabular-nums text-on-surface-variant">
            {t('facilities.form.free', { count: free })}
          </p>
        )}

        {problem && (
          <p role="alert" className="text-sm text-error">
            {problem === 'failed' ? t('facilities.form.failed') : t(`facilities.errors.${problem}`)}
          </p>
        )}

        <Button type="submit" disabled={pending}>
          {t('facilities.form.submit')}
        </Button>
      </form>
    </Modal>
  )
}

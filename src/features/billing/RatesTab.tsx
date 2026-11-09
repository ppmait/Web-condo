import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '../../components/Button'
import FormField from '../../components/FormField'
import { validateRates, type FieldErrors } from '../../billing/rules'
import { BillingError } from '../../billing/types'
import { useBilling } from '../../billing/useBilling'

const KEYS = ['water', 'electric', 'common'] as const
type Key = (typeof KEYS)[number]
const toNumber = (text: string): number => (text.trim() === '' ? NaN : Number(text))

export default function RatesTab() {
  const { t } = useTranslation()
  const { data, saveRates } = useBilling()
  const [form, setForm] = useState<Record<Key, string>>(() => ({
    water: String(data.rates.water),
    electric: String(data.rates.electric),
    common: String(data.rates.common),
  }))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saved, setSaved] = useState(false)
  const [failed, setFailed] = useState(false)
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const [focusTick, setFocusTick] = useState(0)

  useEffect(() => {
    if (focusTick > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [focusTick])

  const change = (key: Key, value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    setSaved(false)
    setErrors((e) => {
      if (!e[key]) return e
      const rest = { ...e }
      delete rest[key]
      return rest
    })
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (inFlight.current) return
    setSaved(false)
    setFailed(false)
    const rates = { water: toNumber(form.water), electric: toNumber(form.electric), common: toNumber(form.common) }
    const found = validateRates(rates)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      setFocusTick((n) => n + 1)
      return
    }
    inFlight.current = true
    setPending(true)
    try {
      await saveRates(rates)
      setSaved(true)
    } catch (err) {
      if (err instanceof BillingError && err.code === 'invalid_input' && err.fieldErrors) {
        setErrors(err.fieldErrors)
        setFocusTick((n) => n + 1)
      } else {
        setFailed(true)
      }
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-primary-container">{t('billing.tabs.rates')}</h2>
      <p className="mt-2 text-sm text-on-surface-variant">{t('billing.rates.hint')}</p>
      <form ref={formRef} onSubmit={submit} noValidate className="mt-4 flex max-w-md flex-col gap-4">
        {KEYS.map((key) => (
          <FormField key={key} label={t(`billing.rates.${key}`)} error={errors[key] ? t(errors[key]) : undefined}>
            {(a) => <input {...a} type="text" inputMode="numeric" value={form[key]} onChange={(e) => change(key, e.target.value)} />}
          </FormField>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {t('billing.rates.save')}
          </Button>
          {saved && (
            <p role="status" className="text-sm font-medium text-[#0f766e]">
              {t('billing.rates.saved')}
            </p>
          )}
          {failed && (
            <p role="alert" className="text-sm text-error">
              {t('billing.rates.failed')}
            </p>
          )}
        </div>
      </form>
    </div>
  )
}

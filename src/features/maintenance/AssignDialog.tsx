import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/useAuth'
import ConfirmDialog from '../../components/ConfirmDialog'
import FormField from '../../components/FormField'
import { MaintenanceError, type MaintenanceRequest } from '../../maintenance/types'
import { useMaintenance } from '../../maintenance/useMaintenance'

/** Pick a technician for a request and confirm. Mount it only while it is open. */
export default function AssignDialog({ request, onClose }: { request: MaintenanceRequest; onClose(): void }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { data, assign, reload } = useMaintenance()
  const [technicianId, setTechnicianId] = useState('')
  const [error, setError] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const [focusTick, setFocusTick] = useState(0)

  useEffect(() => {
    if (focusTick > 0) boxRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [focusTick])

  const confirm = async () => {
    if (inFlight.current) return
    setMessage(null)
    if (technicianId === '') {
      setError(true)
      setFocusTick((n) => n + 1)
      return
    }
    inFlight.current = true
    setPending(true)
    try {
      await assign(request.id, technicianId, user?.fullName ?? '')
      onClose()
    } catch (err) {
      if (err instanceof MaintenanceError && err.code === 'invalid_transition') {
        setMessage(t('maintenance.juristic.stale'))
        void reload()
      } else if (err instanceof MaintenanceError && err.code === 'storage_failed') {
        setMessage(t('maintenance.form.storageFailed'))
      } else if (err instanceof MaintenanceError && err.code === 'not_found') {
        setMessage(t('maintenance.juristic.notFound'))
        void reload()
      } else {
        setMessage(t('maintenance.juristic.failed'))
      }
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return (
    <ConfirmDialog
      open
      title={t('maintenance.juristic.assignTitle', { code: request.code })}
      confirmLabel={t('maintenance.juristic.assignConfirm')}
      pending={pending}
      onConfirm={() => void confirm()}
      onCancel={onClose}
    >
      <div ref={boxRef}>
        <FormField label={t('maintenance.juristic.technician')} error={error ? t('maintenance.errors.technician') : undefined}>
          {(a) => (
            <select
              {...a}
              value={technicianId}
              onChange={(e) => {
                setTechnicianId(e.target.value)
                setError(false)
              }}
            >
              <option value="">{t('maintenance.juristic.chooseTechnician')}</option>
              {data.technicians.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          )}
        </FormField>
      </div>
      {message && (
        <p role="alert" className="mt-2 text-sm text-error">
          {message}
        </p>
      )}
    </ConfirmDialog>
  )
}

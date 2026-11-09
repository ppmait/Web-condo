import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/useAuth'
import ConfirmDialog from '../../components/ConfirmDialog'
import FormField from '../../components/FormField'
import { nextStatus, validateNote } from '../../maintenance/rules'
import { MaintenanceError, type MaintenanceRequest } from '../../maintenance/types'
import { useMaintenance } from '../../maintenance/useMaintenance'

/** Move a job one step forward, with an optional note. Mount it only while it is open. */
export default function StatusUpdateDialog({ request, onClose }: { request: MaintenanceRequest; onClose(): void }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { updateStatus, reload } = useMaintenance()
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const [focusTick, setFocusTick] = useState(0)

  useEffect(() => {
    if (focusTick > 0) boxRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [focusTick])

  const target = nextStatus(request.status)
  const label = t(target === 'done' ? 'maintenance.technician.finish' : 'maintenance.technician.start')

  const confirm = async () => {
    if (inFlight.current || !target) return
    setMessage(null)
    const problem = validateNote(note)
    setNoteError(problem)
    if (problem) {
      setFocusTick((n) => n + 1)
      return
    }
    inFlight.current = true
    setPending(true)
    try {
      await updateStatus(request.id, target, note, { phone: user?.phone ?? '', name: user?.fullName ?? '' })
      onClose()
    } catch (err) {
      if (err instanceof MaintenanceError && err.code === 'invalid_input' && err.fieldErrors?.note) {
        setNoteError(err.fieldErrors.note)
        setFocusTick((n) => n + 1)
      } else if (err instanceof MaintenanceError && err.code === 'storage_failed') {
        setMessage(t('maintenance.form.storageFailed'))
      } else if (err instanceof MaintenanceError && (err.code === 'invalid_transition' || err.code === 'not_assigned' || err.code === 'not_found')) {
        setMessage(t('maintenance.technician.stale'))
        void reload()
      } else {
        setMessage(t('maintenance.technician.failed'))
      }
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return (
    <ConfirmDialog
      open
      title={t('maintenance.technician.updateTitle', { code: request.code })}
      message={target ? t('maintenance.technician.updateMessage', { status: t(`maintenance.status.${target}`) }) : undefined}
      confirmLabel={label}
      pending={pending}
      onConfirm={() => void confirm()}
      onCancel={onClose}
    >
      <div ref={boxRef} className="mt-3">
        <FormField label={t('maintenance.technician.note')} error={noteError ? t(noteError) : undefined}>
          {(a) => (
            <textarea
              {...a}
              rows={3}
              value={note}
              className={`${a.className} h-auto py-2`}
              onChange={(e) => {
                setNote(e.target.value)
                setNoteError(null)
              }}
            />
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

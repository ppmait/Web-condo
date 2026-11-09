import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/useAuth'
import ConfirmDialog from '../../components/ConfirmDialog'
import FormField from '../../components/FormField'
import { validateNote } from '../../facilities/rules'
import { FacilitiesError, type Parcel } from '../../facilities/types'
import { useFacilities } from '../../facilities/useFacilities'

/** Mark a parcel as picked up, with an optional note. Mount it only while it is open. */
export default function PickupDialog({ parcel, onClose }: { parcel: Parcel; onClose(): void }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { markPickedUp, reload } = useFacilities()
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

  const confirm = async () => {
    if (inFlight.current) return
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
      await markPickedUp(parcel.id, note, user?.fullName ?? '')
      onClose()
    } catch (err) {
      if (err instanceof FacilitiesError && (err.code === 'invalid_transition' || err.code === 'not_found')) {
        setMessage(t('facilities.juristic.parcels.pickupStale'))
        void reload()
      } else if (err instanceof FacilitiesError && err.code === 'storage_failed') {
        setMessage(t('facilities.errors.storageFailed'))
      } else {
        setMessage(t('facilities.juristic.failed'))
      }
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return (
    <ConfirmDialog
      open
      title={t('facilities.juristic.parcels.pickupTitle', { code: parcel.code })}
      confirmLabel={t('facilities.juristic.parcels.pickupDo')}
      pending={pending}
      onConfirm={() => void confirm()}
      onCancel={onClose}
    >
      <div ref={boxRef} className="mt-3">
        <FormField label={t('facilities.juristic.parcels.pickupNote')} error={noteError ? t(noteError) : undefined}>
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

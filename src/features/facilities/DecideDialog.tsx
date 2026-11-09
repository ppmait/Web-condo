import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/useAuth'
import ConfirmDialog from '../../components/ConfirmDialog'
import FormField from '../../components/FormField'
import { validateReason } from '../../facilities/rules'
import { FacilitiesError, type Booking } from '../../facilities/types'
import { useFacilities } from '../../facilities/useFacilities'
import { formatDate } from '../../lib/format'

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`

interface Props {
  booking: Booking
  decision: 'confirmed' | 'rejected'
  onClose(): void
}

/** Confirm a booking (after asking) or reject it (with a reason). Mount it only while it is open. */
export default function DecideDialog({ booking, decision, onClose }: Props) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'th'
  const { user } = useAuth()
  const { data, decideBooking, reload } = useFacilities()
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const [focusTick, setFocusTick] = useState(0)

  useEffect(() => {
    if (focusTick > 0) boxRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [focusTick])

  const facility = data.facilities.find((f) => f.id === booking.facilityId)
  const rejecting = decision === 'rejected'

  const confirm = async () => {
    if (inFlight.current) return
    setMessage(null)
    if (rejecting) {
      const problem = validateReason(reason)
      setReasonError(problem)
      if (problem) {
        setFocusTick((n) => n + 1)
        return
      }
    }
    inFlight.current = true
    setPending(true)
    try {
      await decideBooking(booking.id, decision, rejecting ? reason : '', user?.fullName ?? '')
      onClose()
    } catch (err) {
      if (err instanceof FacilitiesError && err.code === 'invalid_input' && err.fieldErrors?.reason) {
        setReasonError(err.fieldErrors.reason)
        setFocusTick((n) => n + 1)
      } else if (err instanceof FacilitiesError && (err.code === 'invalid_transition' || err.code === 'not_found')) {
        setMessage(t('facilities.juristic.stale'))
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
      title={t(rejecting ? 'facilities.juristic.rejectTitle' : 'facilities.juristic.confirmTitle', { code: booking.code })}
      message={
        rejecting
          ? undefined
          : t('facilities.juristic.confirmMessage', {
              facility: facility ? t(`facilities.names.${facility.key}`) : '',
              unit: booking.unitCode,
              date: formatDate(booking.date, lang),
              time: `${hh(booking.startHour)}–${hh(booking.endHour)}`,
            })
      }
      confirmLabel={t(rejecting ? 'facilities.juristic.rejectDo' : 'facilities.juristic.confirmDo')}
      danger={rejecting}
      pending={pending}
      onConfirm={() => void confirm()}
      onCancel={onClose}
    >
      {rejecting && (
        <div ref={boxRef} className="mt-3">
          <FormField label={t('facilities.juristic.reason')} error={reasonError ? t(reasonError) : undefined}>
            {(a) => (
              <textarea
                {...a}
                rows={3}
                value={reason}
                className={`${a.className} h-auto py-2`}
                onChange={(e) => {
                  setReason(e.target.value)
                  setReasonError(null)
                }}
              />
            )}
          </FormField>
        </div>
      )}
      {message && (
        <p role="alert" className="mt-2 text-sm text-error">
          {message}
        </p>
      )}
    </ConfirmDialog>
  )
}

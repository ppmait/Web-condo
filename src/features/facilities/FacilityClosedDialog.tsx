import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ConfirmDialog from '../../components/ConfirmDialog'
import FormField from '../../components/FormField'
import { validateNote } from '../../facilities/rules'
import { FacilitiesError, type Facility } from '../../facilities/types'
import { useFacilities } from '../../facilities/useFacilities'

/** Close a facility for a while (with an optional note) or open it again. Mount it only while it is open. */
export default function FacilityClosedDialog({ facility, onClose }: { facility: Facility; onClose(): void }) {
  const { t } = useTranslation()
  const { setFacilityClosed } = useFacilities()
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

  const closing = !facility.closed
  const name = t(`facilities.names.${facility.key}`)

  const confirm = async () => {
    if (inFlight.current) return
    setMessage(null)
    const problem = closing ? validateNote(note) : null
    setNoteError(problem)
    if (problem) {
      setFocusTick((n) => n + 1)
      return
    }
    inFlight.current = true
    setPending(true)
    try {
      await setFacilityClosed(facility.id, closing, closing ? note : '')
      onClose()
    } catch (err) {
      setMessage(err instanceof FacilitiesError && err.code === 'storage_failed' ? t('facilities.errors.storageFailed') : t('facilities.juristic.failed'))
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return (
    <ConfirmDialog
      open
      title={t(closing ? 'facilities.juristic.panel.closeTitle' : 'facilities.juristic.panel.openTitle', { name })}
      message={closing ? t('facilities.juristic.panel.keep') : undefined}
      confirmLabel={t(closing ? 'facilities.juristic.panel.closeDo' : 'facilities.juristic.panel.openDo')}
      pending={pending}
      onConfirm={() => void confirm()}
      onCancel={onClose}
    >
      {closing && (
        <div ref={boxRef} className="mt-3">
          <FormField label={t('facilities.juristic.panel.note')} error={noteError ? t(noteError) : undefined}>
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
      )}
      {message && (
        <p role="alert" className="mt-2 text-sm text-error">
          {message}
        </p>
      )}
    </ConfirmDialog>
  )
}

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/useAuth'
import Button from '../../components/Button'
import FormField from '../../components/FormField'
import Modal from '../../components/Modal'
import { processPhoto, type PhotoProcessor } from '../../maintenance/photos'
import { CATEGORIES, MAX_PHOTOS, validatePhotoFile, validateRequest, type FieldErrors } from '../../maintenance/rules'
import { MaintenanceError, type Category, type Photo } from '../../maintenance/types'
import { useMaintenance } from '../../maintenance/useMaintenance'

interface Props {
  /** turns a chosen file into the stored photo; tests pass a fake one */
  processor?: PhotoProcessor
  onClose(): void
}

type Problem = 'noLease' | 'storageFailed' | 'failed'

/** Mount it only while it is open, so the form starts fresh every time. */
export default function RequestFormModal({ processor = processPhoto, onClose }: Props) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { createRequest } = useMaintenance()

  const [category, setCategory] = useState<Category | ''>('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState<Photo[]>([])
  const [errors, setErrors] = useState<FieldErrors>({})
  const [photoMessage, setPhotoMessage] = useState<string | null>(null)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [incomplete, setIncomplete] = useState(false)
  const [processing, setProcessing] = useState(0)
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)
  const processingCount = useRef(0)
  const formRef = useRef<HTMLFormElement>(null)
  const [focusTick, setFocusTick] = useState(0)

  useEffect(() => {
    if (focusTick > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [focusTick])

  const clearError = (name: string) =>
    setErrors((e) => {
      if (!e[name]) return e
      const rest = { ...e }
      delete rest[name]
      return rest
    })

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? [])
    e.target.value = '' // so the same file can be chosen again after it was removed
    clearError('photos')
    const room = Math.max(0, MAX_PHOTOS - photos.length - processingCount.current)
    const usable = picked.slice(0, room)
    let message: string | null = picked.length > usable.length ? t('maintenance.form.tooMany') : null
    processingCount.current += usable.length
    setProcessing((n) => n + usable.length)
    for (const file of usable) {
      const bad = validatePhotoFile(file)
      if (bad) {
        message = t(bad)
        continue
      }
      try {
        const photo = await processor(file)
        setPhotos((list) => [...list, photo])
      } catch {
        message = t('maintenance.form.photoUnsupported', { name: file.name })
      }
    }
    processingCount.current -= usable.length
    setProcessing((n) => n - usable.length)
    setPhotoMessage(message)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (inFlight.current || processingCount.current > 0) return
    setProblem(null)
    const input = { category: category as Category, title, description, photos }
    const found = validateRequest(input)
    setErrors(found)
    setIncomplete(Object.keys(found).length > 0)
    if (Object.keys(found).length > 0) {
      setFocusTick((n) => n + 1)
      return
    }
    inFlight.current = true
    setPending(true)
    try {
      await createRequest({ ...input, tenantPhone: user?.phone ?? '', tenantName: user?.fullName ?? '' })
      onClose()
    } catch (err) {
      if (err instanceof MaintenanceError && err.code === 'invalid_input' && err.fieldErrors) {
        setErrors(err.fieldErrors)
        setIncomplete(true)
        setFocusTick((n) => n + 1)
      } else if (err instanceof MaintenanceError && err.code === 'no_lease') {
        setProblem('noLease')
      } else if (err instanceof MaintenanceError && err.code === 'storage_failed') {
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
    <Modal open title={t('maintenance.form.title')} onClose={onClose}>
      <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
        {incomplete && (
          <p role="alert" className="text-sm text-error">
            {t('maintenance.errors.incomplete')}
          </p>
        )}

        <FormField label={t('maintenance.form.category')} error={err('category')}>
          {(a) => (
            <select
              {...a}
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as Category | '')
                clearError('category')
              }}
            >
              <option value="">{t('maintenance.form.choose')}</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`maintenance.category.${c}`)}
                </option>
              ))}
            </select>
          )}
        </FormField>

        <FormField label={t('maintenance.form.subject')} error={err('title')}>
          {(a) => (
            <input
              {...a}
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                clearError('title')
              }}
            />
          )}
        </FormField>

        <FormField label={t('maintenance.form.description')} error={err('description')}>
          {(a) => (
            <textarea
              {...a}
              rows={4}
              value={description}
              className={`${a.className} h-auto py-2`}
              onChange={(e) => {
                setDescription(e.target.value)
                clearError('description')
              }}
            />
          )}
        </FormField>

        <FormField label={t('maintenance.form.photos')} error={err('photos') ?? photoMessage ?? undefined}>
          {(a) => <input {...a} type="file" multiple accept="image/jpeg,image/png,image/webp" className={`${a.className} h-auto py-2`} onChange={pick} />}
        </FormField>

        {photos.length > 0 && (
          <ul className="flex flex-wrap gap-3">
            {photos.map((p, i) => (
              <li key={`${p.name}-${i}`} className="relative">
                <img src={p.dataUrl} alt={p.name} className="h-20 w-24 rounded border border-[#cbd5e1] object-cover" />
                <button
                  type="button"
                  aria-label={t('maintenance.form.removePhoto', { name: p.name })}
                  onClick={() => setPhotos((list) => list.filter((_, j) => j !== i))}
                  className="absolute -right-2 -top-2 rounded-full bg-error p-0.5 text-on-error"
                >
                  <span className="material-symbols-outlined text-base" aria-hidden="true">
                    close
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {problem && (
          <p role="alert" className="text-sm text-error">
            {t(`maintenance.form.${problem}`)}
          </p>
        )}

        <Button type="submit" disabled={pending || processing > 0}>
          {t('maintenance.form.submit')}
        </Button>
      </form>
    </Modal>
  )
}

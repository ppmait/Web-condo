import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CATEGORIES, validateAnnouncement, type FieldErrors } from '../../announcements/rules'
import { useAnnouncements } from '../../announcements/useAnnouncements'
import { AnnouncementsError, type Announcement, type AnnouncementInput, type Category } from '../../announcements/types'
import { useAuth } from '../../auth/useAuth'
import Button from '../../components/Button'
import FormField from '../../components/FormField'
import Modal from '../../components/Modal'

interface Props {
  announcement?: Announcement
  onClose: () => void
}

interface FormState {
  title: string
  body: string
  category: Category
  pinned: boolean
  expiresOn: string
}

function initialState(announcement?: Announcement): FormState {
  return announcement
    ? {
        title: announcement.title,
        body: announcement.body,
        category: announcement.category,
        pinned: announcement.pinned,
        expiresOn: announcement.expiresOn ?? '',
      }
    : {
        title: '',
        body: '',
        category: 'general',
        pinned: false,
        expiresOn: '',
      }
}

export default function AnnouncementFormModal({ announcement, onClose }: Props) {
  const { t } = useTranslation()
  const { today, create, update } = useAnnouncements()
  const { user } = useAuth()
  const authorName = user?.fullName || user?.username || 'นิติบุคคล'

  const [form, setForm] = useState<FormState>(() => initialState(announcement))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const [focusTick, setFocusTick] = useState(0)

  useEffect(() => {
    if (focusTick > 0) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    }
  }, [focusTick])

  const change = <K extends keyof FormState>(name: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [name]: value }))
    setErrors((e) => {
      if (!e[name]) return e
      const rest = { ...e }
      delete rest[name]
      return rest
    })
    setFormError(null)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (inFlight.current) return
    setFormError(null)

    const input: AnnouncementInput = {
      title: form.title,
      body: form.body,
      category: form.category,
      pinned: form.pinned,
      expiresOn: form.expiresOn,
    }

    // If editing and nothing changed, just close without writing
    if (announcement) {
      const same =
        announcement.title === input.title.trim() &&
        announcement.body === input.body.trim() &&
        announcement.category === input.category &&
        announcement.pinned === input.pinned &&
        (announcement.expiresOn ?? '') === input.expiresOn.trim()

      if (same) {
        onClose()
        return
      }
    }

    const found = validateAnnouncement(input, today)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      setFormError(t('announcements.errors.incomplete'))
      setFocusTick((n) => n + 1)
      return
    }

    inFlight.current = true
    setPending(true)
    try {
      if (announcement) {
        await update(announcement.id, input)
      } else {
        await create(input, authorName)
      }
      onClose()
    } catch (err) {
      inFlight.current = false
      setPending(false)
      if (err instanceof AnnouncementsError) {
        if (err.code === 'invalid_input' && err.fieldErrors) {
          setErrors(err.fieldErrors)
          setFormError(t('announcements.errors.incomplete'))
          setFocusTick((n) => n + 1)
          return
        }
        if (err.code === 'storage_failed') {
          setFormError(t('announcements.errors.storageFailed'))
          return
        }
        if (err.code === 'not_found') {
          setFormError(t('announcements.dialog.notFound'))
          return
        }
      }
      setFormError(t('announcements.errors.failed'))
    }
  }

  const title = announcement
    ? t('announcements.dialog.editTitle', { code: announcement.code })
    : t('announcements.dialog.createTitle')

  return (
    <Modal open title={title} onClose={onClose}>
      <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
        {formError && (
          <div role="alert" className="rounded-lg bg-error-container p-3 text-sm text-on-error-container">
            {formError}
          </div>
        )}

        <FormField label={t('announcements.fields.title')} error={errors.title ? t(errors.title) : undefined}>
          {(ctrl) => (
            <input
              {...ctrl}
              type="text"
              value={form.title}
              maxLength={101}
              onChange={(e) => change('title', e.target.value)}
            />
          )}
        </FormField>

        <FormField label={t('announcements.fields.body')} error={errors.body ? t(errors.body) : undefined}>
          {(ctrl) => (
            <div className="flex flex-col gap-1">
              <textarea
                {...ctrl}
                rows={5}
                className={`${ctrl.className} h-auto py-2`}
                value={form.body}
                onChange={(e) => change('body', e.target.value)}
              />
              <span className="text-right text-xs tabular-nums text-on-surface-variant">
                {form.body.length}/2000
              </span>
            </div>
          )}
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label={t('announcements.fields.category')} error={errors.category ? t(errors.category) : undefined}>
            {(ctrl) => (
              <select
                {...ctrl}
                value={form.category}
                onChange={(e) => change('category', e.target.value as Category)}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {t(`announcements.category.${cat}`)}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          <FormField
            label={t('announcements.fields.expiresOn')}
            error={errors.expiresOn ? t(errors.expiresOn) : undefined}
          >
            {(ctrl) => (
              <input
                {...ctrl}
                type="date"
                value={form.expiresOn}
                onChange={(e) => change('expiresOn', e.target.value)}
              />
            )}
          </FormField>
        </div>

        <div className="mt-1 flex items-center gap-2">
          <input
            id="pinned-checkbox"
            type="checkbox"
            checked={form.pinned}
            onChange={(e) => change('pinned', e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <label htmlFor="pinned-checkbox" className="text-sm font-medium text-on-surface">
            {t('announcements.fields.pinned')}
          </label>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {t('announcements.dialog.cancel')}
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? t('announcements.dialog.saving') : t('announcements.dialog.save')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

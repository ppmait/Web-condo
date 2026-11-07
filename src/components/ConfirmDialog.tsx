import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import Button from './Button'
import Modal from './Modal'

interface Props {
  open: boolean
  title: string
  message?: string
  confirmLabel: string
  cancelLabel?: string
  /** styles the confirm button as a destructive action */
  danger?: boolean
  /** true while the action runs: the confirm button is disabled so it cannot be pressed twice */
  pending?: boolean
  onConfirm(): void
  onCancel(): void
  /** extra content between the message and the buttons, e.g. a reason field or an error alert */
  children?: ReactNode
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  pending = false,
  onConfirm,
  onCancel,
  children,
}: Props) {
  const { t } = useTranslation()
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      {message && <p className="text-sm text-on-surface">{message}</p>}
      {children}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {cancelLabel ?? t('common.cancel')}
        </Button>
        <Button
          disabled={pending}
          onClick={onConfirm}
          className={danger ? 'bg-error text-on-error hover:bg-[#93000a]' : ''}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}

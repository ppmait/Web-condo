import { useId, type ReactNode } from 'react'

interface ControlProps {
  id: string
  'aria-invalid': boolean
  'aria-describedby'?: string
}

interface Props {
  label: string
  error?: string
  children: (control: ControlProps) => ReactNode
}

export default function FormField({ label, error, children }: Props) {
  const id = useId()
  const errorId = `${id}-error`
  const control: ControlProps = {
    id,
    'aria-invalid': Boolean(error),
    ...(error ? { 'aria-describedby': errorId } : {}),
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-on-surface">
        {label}
      </label>
      {children(control)}
      {error && (
        <p id={errorId} className="text-xs text-error">
          {error}
        </p>
      )}
    </div>
  )
}

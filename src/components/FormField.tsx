import { useId, type ReactNode } from 'react'

const CONTROL_BASE =
  'h-10 w-full rounded border bg-surface-container-lowest px-3 text-sm text-primary-container outline-none focus:border-primary-container focus:ring-2 focus:ring-primary-container/10'

interface ControlProps {
  id: string
  className: string
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
    className: `${CONTROL_BASE} ${error ? 'border-error' : 'border-[#cbd5e1]'}`,
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

import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'success'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary-container text-on-primary hover:bg-[#1e3a8a]',
  secondary:
    'bg-surface-container-lowest text-primary-container border border-[#cbd5e1] hover:bg-[#f1f5f9]',
  success: 'bg-[#0d9488] text-white hover:bg-[#0f766e]',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

export default function Button({ variant = 'primary', type = 'button', className = '', ...rest }: Props) {
  return (
    <button
      type={type}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0d9488] disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  )
}

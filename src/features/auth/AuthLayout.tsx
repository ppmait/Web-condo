import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import LanguageToggle from '../../components/LanguageToggle'

interface Props {
  title: string
  children: ReactNode
}

/** Standalone page frame for login / register (no sidebar). */
export default function AuthLayout({ title, children }: Props) {
  const { t } = useTranslation()
  return (
    <div className="min-h-screen bg-surface">
      <div className="flex items-center justify-between gap-3 p-4">
        <span className="min-w-0 truncate font-semibold text-primary-container">{t('common.appName')}</span>
        <LanguageToggle />
      </div>
      <main className="mx-auto w-full max-w-md px-4 pb-12">
        <div className="rounded-xl border border-[#e2e8f0] bg-surface-container-lowest p-6 shadow-[0_1px_3px_0_rgba(15,41,66,0.04)]">
          <h1 className="mb-6 text-[28px] font-semibold leading-9 text-primary-container">{title}</h1>
          {children}
        </div>
      </main>
    </div>
  )
}

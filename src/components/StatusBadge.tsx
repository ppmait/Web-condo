import { useTranslation } from 'react-i18next'

export type Status = 'settled' | 'pending' | 'critical' | 'inactive'

const STYLES: Record<Status, string> = {
  settled: 'bg-[#ccfbf1] text-[#0f766e]',
  pending: 'bg-[#fef3c7] text-[#b45309]',
  critical: 'bg-[#ffe4e6] text-[#be123c]',
  inactive: 'bg-[#f1f5f9] text-[#475569]',
}

interface Props {
  status: Status
  label?: string
}

export default function StatusBadge({ status, label }: Props) {
  const { t } = useTranslation()
  return (
    <span
      data-status={status}
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${STYLES[status]}`}
    >
      {label ?? t(`status.${status}`)}
    </span>
  )
}

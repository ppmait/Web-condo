import { useTranslation } from 'react-i18next'
import Button from './Button'

interface Props {
  /** 1-based */
  page: number
  pageCount: number
  onChange(page: number): void
}

export default function Pager({ page, pageCount, onChange }: Props) {
  const { t } = useTranslation()
  if (pageCount <= 1) return null

  return (
    <div className="flex items-center justify-end gap-3 pt-3">
      <span className="text-sm text-on-surface-variant tabular-nums">{t('property.pager.label', { page, count: pageCount })}</span>
      <Button variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        {t('property.pager.prev')}
      </Button>
      <Button variant="secondary" disabled={page >= pageCount} onClick={() => onChange(page + 1)}>
        {t('property.pager.next')}
      </Button>
    </div>
  )
}

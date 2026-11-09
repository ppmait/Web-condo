import { useTranslation } from 'react-i18next'
import StatusBadge from '../../components/StatusBadge'
import { formatDate } from '../../lib/format'
import type { HistoryEntry } from '../../maintenance/types'
import { requestBadge } from './statusBadges'

/** Every step of a request, in the order it happened. */
export default function Timeline({ history }: { history: HistoryEntry[] }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'th'
  return (
    <ol aria-label={t('maintenance.detail.timeline')} className="flex flex-col gap-3 border-l-2 border-[#e2e8f0] pl-4">
      {history.map((h, i) => (
        <li key={i} className="text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={requestBadge(h.status)} label={t(`maintenance.status.${h.status}`)} />
            <span className="tabular-nums text-on-surface-variant">{formatDate(h.at, lang)}</span>
            <span className="text-on-surface-variant">{t('maintenance.detail.by', { name: h.byName })}</span>
          </div>
          {h.note && <p className="mt-1">{h.note}</p>}
        </li>
      ))}
    </ol>
  )
}

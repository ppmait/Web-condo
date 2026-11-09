import { useTranslation } from 'react-i18next'
import StatusBadge from '../../components/StatusBadge'
import type { Status } from '../../components/StatusBadge'
import { formatDate } from '../../lib/format'
import type { HistoryEntry } from '../../facilities/types'

interface Props<S extends string> {
  history: HistoryEntry<S>[]
  /** the text and the badge style of a status */
  label(status: S): string
  badge(status: S): Status
}

/** Every step of a booking or a parcel, in the order it happened. */
export default function HistoryTimeline<S extends string>({ history, label, badge }: Props<S>) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'th'
  return (
    <ol aria-label={t('facilities.detail.timeline')} className="flex flex-col gap-3 border-l-2 border-[#e2e8f0] pl-4">
      {history.map((h, i) => (
        <li key={i} className="text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={badge(h.status)} label={label(h.status)} />
            <span className="tabular-nums text-on-surface-variant">{formatDate(h.at, lang)}</span>
            <span className="text-on-surface-variant">{t('facilities.detail.by', { name: h.byName })}</span>
          </div>
          {h.note && <p className="mt-1">{h.note}</p>}
        </li>
      ))}
    </ol>
  )
}

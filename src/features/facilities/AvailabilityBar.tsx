import { useTranslation } from 'react-i18next'
import { freeAt } from '../../facilities/rules'
import type { Booking, Facility } from '../../facilities/types'

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`

/** The free places of every opening hour of one facility on one day; numbers and text, not colour alone. */
export default function AvailabilityBar({ facility, bookings, date }: { facility: Facility; bookings: Booking[]; date: string }) {
  const { t } = useTranslation()
  const hours = Array.from({ length: facility.closeHour - facility.openHour }, (_, i) => facility.openHour + i)
  return (
    <ol aria-label={t('facilities.availability.label', { name: t(`facilities.names.${facility.key}`) })} className="grid grid-cols-2 gap-1 text-xs sm:grid-cols-4">
      {hours.map((h) => {
        const free = freeAt(facility, bookings, date, h)
        const share = free / facility.capacity
        const tone = free === 0 ? 'bg-[#ffe4e6] text-[#be123c]' : share < 0.35 ? 'bg-[#fef3c7] text-[#b45309]' : 'bg-[#ccfbf1] text-[#0f766e]'
        return (
          <li key={h} className={`rounded px-2 py-1 tabular-nums ${tone}`}>
            {t('facilities.availability.slot', { hour: hh(h), free, capacity: facility.capacity })}
          </li>
        )
      })}
    </ol>
  )
}

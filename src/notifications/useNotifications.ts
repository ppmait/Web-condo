import { useTranslation } from 'react-i18next'
import { isUnreadBy } from '../announcements/rules'
import { useAnnouncements } from '../announcements/useAnnouncements'
import { useAuth } from '../auth/useAuth'
import { useBilling } from '../billing/useBilling'
import { useFacilities } from '../facilities/useFacilities'
import { formatDate } from '../lib/format'
import { useMaintenance } from '../maintenance/useMaintenance'

/** One notice of the bell, whichever module it came from. */
export interface AppNotice {
  /** unique across sources */
  key: string
  source: 'billing' | 'maintenance' | 'facilities' | 'announcements'
  text: string
  /** for a rejected slip: why */
  reason?: string
  /** YYYY-MM-DD */
  createdAt: string
  read: boolean
  /** where pressing it goes */
  to: string
  markRead(): Promise<void>
}

const JURISTIC = 'role:juristic'
const REQUEST_PAGE = { tenant: '/tenant/maintenance', juristic: '/juristic/maintenance', technician: '/technician/jobs' } as const

/** Which kinds of notice each role is meant to get from the repair and facility modules (a phone number alone is not enough). */
const MAINTENANCE_KINDS = { tenant: ['statusChanged'], technician: ['assigned'], juristic: ['requestCreated'] } as const
const FACILITY_KINDS = { tenant: ['bookingDecided', 'parcelArrived'], technician: [], juristic: ['bookingCreated', 'bookingCancelled'] } as const

/** The signed-in user's notices from billing, maintenance and facilities, newest first, with the unread count. */
export function useNotifications(): { notices: AppNotice[]; unread: number; markAllRead(): Promise<void> } {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'th'
  const user = useAuth().user
  const billing = useBilling()
  const maintenance = useMaintenance()
  const facilities = useFacilities()
  const announcements = useAnnouncements()

  if (!user) return { notices: [], unread: 0, markAllRead: async () => {} }

  const notices: AppNotice[] = []

  // invoices are the tenant's
  if (user.role === 'tenant') {
    for (const a of announcements.data.announcements) {
      if (!isUnreadBy(a, user.phone, announcements.today)) continue
      notices.push({
        key: `announcements:${a.id}`,
        source: 'announcements',
        text: t('announcements.notifications.newAnnouncement', { title: a.title }),
        createdAt: a.updatedAt || a.createdAt,
        read: false,
        to: `/tenant/announcements?announcement=${a.id}`,
        markRead: () => announcements.markRead(a.id, user.phone),
      })
    }
    for (const n of billing.data.notifications) {
      if (n.recipientPhone !== user.phone) continue
      const invoice = billing.data.invoices.find((i) => i.id === n.invoiceId)
      notices.push({
        key: `billing:${n.id}`,
        source: 'billing',
        text: t(`billing.notifications.${n.type}`, { number: invoice?.number ?? '' }),
        // older notifications (stored before the reason was kept on them) fall back to the invoice's latest rejection
        reason: n.type === 'slipRejected' ? (n.reason ?? invoice?.slips.filter((s) => s.status === 'rejected').at(-1)?.rejectReason) : undefined,
        createdAt: n.createdAt,
        read: n.read,
        to: `/tenant/billing?invoice=${n.invoiceId}`,
        markRead: () => billing.markRead(n.id),
      })
    }
  }

  for (const n of maintenance.data.notifications) {
    if (n.recipient !== user.phone && !(user.role === 'juristic' && n.recipient === JURISTIC)) continue
    if (!(MAINTENANCE_KINDS[user.role] as readonly string[]).includes(n.type)) continue
    const request = maintenance.data.requests.find((r) => r.id === n.requestId)
    notices.push({
      key: `maintenance:${n.id}`,
      source: 'maintenance',
      text: t(`maintenance.notifications.${n.type}`, {
        code: request?.code ?? '',
        unit: request?.unitCode ?? '',
        status: n.status ? t(`maintenance.status.${n.status}`) : '',
      }),
      createdAt: n.createdAt,
      read: n.read,
      to: `${REQUEST_PAGE[user.role]}?request=${n.requestId}`,
      markRead: () => maintenance.markRead(n.id),
    })
  }

  for (const n of facilities.data.notifications) {
    if (n.recipient !== user.phone && !(user.role === 'juristic' && n.recipient === JURISTIC)) continue
    if (!(FACILITY_KINDS[user.role] as readonly string[]).includes(n.type)) continue
    const parcel = n.type === 'parcelArrived' ? facilities.data.parcels.find((p) => p.id === n.refId) : undefined
    const booking = n.type === 'parcelArrived' ? undefined : facilities.data.bookings.find((b) => b.id === n.refId)
    const facility = booking && facilities.data.facilities.find((f) => f.id === booking.facilityId)
    const status = n.status ? t(`facilities.status.booking.${n.status}`) : ''
    notices.push({
      key: `facilities:${n.id}`,
      source: 'facilities',
      text: t(`facilities.notifications.${n.type}`, {
        code: booking?.code ?? '',
        facility: facility ? t(`facilities.names.${facility.key}`) : '',
        date: booking ? formatDate(booking.date, lang) : '',
        status,
        unit: parcel?.unitCode ?? '',
        carrier: parcel?.carrier ?? '',
      }),
      // why a request was turned down
      reason: n.status === 'rejected' ? booking?.history.at(-1)?.note || undefined : undefined,
      createdAt: n.createdAt,
      read: n.read,
      to:
        n.type === 'parcelArrived'
          ? `/tenant/parcels?parcel=${n.refId}`
          : user.role === 'tenant'
            ? `/tenant/facilities?booking=${n.refId}`
            : `/juristic/parcels-bookings?booking=${n.refId}`,
      markRead: () => facilities.markRead(n.id),
    })
  }

  notices.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.key.localeCompare(a.key))

  const markAllRead = async () => {
    const jobs: Promise<void>[] = []
    if (user.role === 'tenant') {
      jobs.push(billing.markAllRead(user.phone))
      jobs.push(announcements.markAllRead(user.phone))
    }
    jobs.push(maintenance.markAllRead(user.phone))
    jobs.push(facilities.markAllRead(user.phone))
    if (user.role === 'juristic') {
      jobs.push(maintenance.markAllRead(JURISTIC))
      jobs.push(facilities.markAllRead(JURISTIC))
    }
    await Promise.all(jobs)
  }

  return { notices, unread: notices.filter((n) => !n.read).length, markAllRead }
}

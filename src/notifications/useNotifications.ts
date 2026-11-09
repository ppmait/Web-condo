import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/useAuth'
import { useBilling } from '../billing/useBilling'
import { useMaintenance } from '../maintenance/useMaintenance'

/** One notice of the bell, whichever module it came from. */
export interface AppNotice {
  /** unique across sources */
  key: string
  source: 'billing' | 'maintenance'
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

/** The signed-in user's notices from billing and maintenance, newest first, with the unread count. */
export function useNotifications(): { notices: AppNotice[]; unread: number; markAllRead(): Promise<void> } {
  const { t } = useTranslation()
  const { user } = useAuth()
  const billing = useBilling()
  const maintenance = useMaintenance()

  if (!user) return { notices: [], unread: 0, markAllRead: async () => {} }

  const notices: AppNotice[] = []

  // invoices are the tenant's
  if (user.role === 'tenant') {
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

  notices.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.key.localeCompare(a.key))

  const markAllRead = async () => {
    const jobs: Promise<void>[] = []
    if (user.role === 'tenant') jobs.push(billing.markAllRead(user.phone))
    jobs.push(maintenance.markAllRead(user.phone))
    if (user.role === 'juristic') jobs.push(maintenance.markAllRead(JURISTIC))
    await Promise.all(jobs)
  }

  return { notices, unread: notices.filter((n) => !n.read).length, markAllRead }
}

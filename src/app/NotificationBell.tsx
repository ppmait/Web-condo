import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { useAuth } from '../auth/useAuth'
import Button from '../components/Button'
import Modal from '../components/Modal'
import { formatDate } from '../lib/format'
import { useBilling } from '../billing/useBilling'
import type { AppNotification } from '../billing/types'

/** The tenant's bell: unread count of the signed-in phone number and the list of notifications. */
export default function NotificationBell() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'th'
  const { user } = useAuth()
  const { data, markRead, markAllRead } = useBilling()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  if (user?.role !== 'tenant') return null

  const mine = data.notifications
    .filter((n) => n.recipientPhone === user.phone)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
  const unread = mine.filter((n) => !n.read).length
  const label = unread > 0 ? t('billing.notifications.bellUnread', { count: unread }) : t('billing.notifications.bell')

  const wording = (n: AppNotification): { text: string; reason?: string } => {
    const invoice = data.invoices.find((i) => i.id === n.invoiceId)
    const number = invoice?.number ?? ''
    const text = t(`billing.notifications.${n.type}`, { number })
    if (n.type !== 'slipRejected') return { text }
    // older notifications (stored before the reason was kept on them) fall back to the invoice's latest rejection
    const reason = n.reason ?? invoice?.slips.filter((s) => s.status === 'rejected').at(-1)?.rejectReason
    return { text, reason }
  }

  const go = (n: AppNotification) => {
    setOpen(false)
    navigate(`/tenant/billing?invoice=${n.invoiceId}`)
    if (!n.read) markRead(n.id).catch(() => {})
  }

  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={() => setOpen(true)}
        className="relative shrink-0 rounded p-1 text-primary-container hover:bg-surface-container-low"
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          notifications
        </span>
        {unread > 0 && (
          <span
            data-testid="bell-count"
            className="absolute -right-1 -top-1 min-w-4 rounded-full bg-error px-1 text-center text-[10px] font-semibold leading-4 text-on-error"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <Modal open title={t('billing.notifications.title')} onClose={() => setOpen(false)}>
          {mine.length === 0 ? (
            <p className="py-6 text-center text-sm text-on-surface-variant">{t('billing.notifications.empty')}</p>
          ) : (
            <>
              <div className="mb-3 flex justify-end">
                <Button variant="secondary" className="h-8 px-3" disabled={unread === 0} onClick={() => markAllRead(user.phone).catch(() => {})}>
                  {t('billing.notifications.markAll')}
                </Button>
              </div>
              <ul className="flex flex-col gap-1">
                {mine.map((n) => {
                  const { text, reason } = wording(n)
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => go(n)}
                        className={`flex w-full flex-col items-start gap-0.5 rounded px-3 py-2 text-left text-sm hover:bg-surface-container-low ${n.read ? 'text-on-surface-variant' : 'bg-[#f0f9ff] font-semibold text-on-surface'}`}
                      >
                        <span>
                          {!n.read && (
                            <span className="mr-2 rounded-full bg-[#0d9488] px-2 py-0.5 text-[10px] font-medium text-white">{t('billing.notifications.unread')}</span>
                          )}
                          {text}
                        </span>
                        {reason && <span className="text-xs font-normal text-error">{t('billing.notifications.reason', { reason })}</span>}
                        <span className="text-xs font-normal text-on-surface-variant">{formatDate(n.createdAt, lang)}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </Modal>
      )}
    </>
  )
}

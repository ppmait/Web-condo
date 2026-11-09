import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { DEMO_TENANT_PHONE } from '../auth/demoAccounts'
import i18n from '../i18n'
import { BILLING_KEY, createLocalBillingApi } from '../billing/localBillingApi'
import { invoiceStatus, tenantInvoices } from '../billing/rules'
import { makeBillingSeed } from '../billing/seed'
import type { AppNotification, BillingData } from '../billing/types'
import { PROPERTY_KEY } from '../property/localPropertyApi'
import { todayISO } from '../property/dates'
import { makeSeed } from '../property/seed'
import { renderApp } from '../test/renderApp'

afterEach(async () => {
  await i18n.changeLanguage('th')
})

const today = todayISO()

function LocationProbe() {
  const { pathname, search } = useLocation()
  return <span data-testid="location">{pathname + search}</span>
}

/** Puts sample property data and billing data (changed by `edit`) into localStorage, as another tab or an earlier visit would. */
function seedStorage(edit: (data: BillingData) => void = () => {}) {
  const property = makeSeed(today)
  const data = makeBillingSeed(property, today)
  edit(data)
  localStorage.setItem(PROPERTY_KEY, JSON.stringify(property))
  localStorage.setItem(BILLING_KEY, JSON.stringify(data))
  return data
}

const mine = (data: BillingData) => data.notifications.filter((n) => n.recipientPhone === DEMO_TENANT_PHONE)
const demoInvoices = (data: BillingData) => tenantInvoices(data.invoices, DEMO_TENANT_PHONE)
const note = (id: string, type: AppNotification['type'], invoiceId: string, createdAt: string, read = false, recipientPhone = DEMO_TENANT_PHONE): AppNotification => ({
  id,
  type,
  invoiceId,
  recipientPhone,
  createdAt,
  read,
})

const open = (as: 'tenant' | 'juristic' | 'technician' = 'tenant', path = '/tenant/billing') => renderApp(path, { as, extra: <LocationProbe /> })
const bell = () => screen.getByRole('button', { name: /การแจ้งเตือน/ })

/** every notification of the demo tenant replaced by `list`; other tenants keep theirs */
const withMine = (list: AppNotification[]) => (data: BillingData) => {
  data.notifications = [...data.notifications.filter((n) => n.recipientPhone !== DEMO_TENANT_PHONE), ...list]
}

describe('NotificationBell: who sees it and the count', () => {
  it('shows the number of unread notifications of the signed-in tenant only', async () => {
    const data = seedStorage((d) => {
      const other = d.invoices.find((i) => i.tenantPhone !== DEMO_TENANT_PHONE)!
      d.notifications.push(note('n-other-1', 'slipRejected', other.id, today, false, other.tenantPhone))
    })
    const unread = mine(data).filter((n) => !n.read).length
    expect(unread).toBeGreaterThan(0)
    expect(data.notifications.filter((n) => !n.read).length).toBeGreaterThan(unread)
    await open()
    expect(await screen.findByRole('button', { name: /การแจ้งเตือน/ })).toBeInTheDocument()
    expect(within(bell()).getByText(String(unread))).toBeInTheDocument()
    expect(bell()).toHaveAccessibleName(`การแจ้งเตือน ยังไม่อ่าน ${unread} รายการ`)
  })

  it.each([
    ['juristic', '/juristic/billing'],
    ['technician', '/technician/jobs'],
  ] as const)('is not shown to the %s', async (role, path) => {
    seedStorage()
    await open(role, path)
    await screen.findByRole('button', { name: 'ออกจากระบบ' })
    expect(screen.queryByRole('button', { name: /การแจ้งเตือน/ })).not.toBeInTheDocument()
  })

  it('shows no number when nothing is unread, and says there are no notifications in the list', async () => {
    seedStorage(withMine([]))
    await open()
    const button = await screen.findByRole('button', { name: 'การแจ้งเตือน' })
    expect(button.querySelector('[data-testid="bell-count"]')).toBeNull()
    await userEvent.click(button)
    expect(within(screen.getByRole('dialog')).getByText('ไม่มีการแจ้งเตือน')).toBeInTheDocument()
  })

  it('shows 99+ when more than 99 are unread, and the exact number at 99', async () => {
    const make = (n: number) => (d: BillingData) =>
      withMine(Array.from({ length: n }, (_, i) => note(`n-bulk-${i}`, 'invoiceIssued', demoInvoices(d)[0].id, today)))(d)
    seedStorage(make(100))
    await open()
    expect(within(await screen.findByRole('button', { name: /การแจ้งเตือน/ })).getByText('99+')).toBeInTheDocument()
  })

  it('shows exactly 99 as 99', async () => {
    seedStorage((d) => withMine(Array.from({ length: 99 }, (_, i) => note(`n-bulk-${i}`, 'invoiceIssued', demoInvoices(d)[0].id, today)))(d))
    await open()
    expect(within(await screen.findByRole('button', { name: /การแจ้งเตือน/ })).getByText('99')).toBeInTheDocument()
  })

  it('does not let the button shrink in the header', async () => {
    seedStorage()
    await open()
    expect(await screen.findByRole('button', { name: /การแจ้งเตือน/ })).toHaveClass('shrink-0')
  })
})

describe('NotificationBell: the list', () => {
  it('words each kind of notification with the invoice number and date, newest first, unread ones marked', async () => {
    let numbers: string[] = []
    seedStorage((d) => {
      const [a, b, c] = demoInvoices(d).filter((i) => invoiceStatus(i, today) !== 'paid')
      const rejected = d.invoices.find((i) => i.id === (b ?? a).id)!
      rejected.slips = [{ id: 's-reject-1', submittedAt: today, fileName: 'x.png', fileSize: 100, status: 'rejected', reviewedAt: today, rejectReason: 'ยอดไม่ตรง' }]
      numbers = [a.number, rejected.number, (c ?? a).number]
      withMine([
        note('n-1', 'invoiceIssued', a.id, '2026-01-10', true),
        note('n-2', 'slipRejected', rejected.id, '2026-01-12'),
        note('n-3', 'receiptIssued', (c ?? a).id, '2026-01-15'),
      ])(d)
    })
    await open()
    await userEvent.click(await screen.findByRole('button', { name: /การแจ้งเตือน/ }))
    const items = within(screen.getByRole('dialog')).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent(`ออกใบเสร็จของใบแจ้งหนี้ ${numbers[2]} แล้ว`)
    expect(items[0]).toHaveTextContent('15 ม.ค. 2569')
    expect(items[1]).toHaveTextContent(`สลิปของใบแจ้งหนี้ ${numbers[1]} ถูกปฏิเสธ`)
    expect(items[1]).toHaveTextContent('เหตุผล: ยอดไม่ตรง')
    expect(items[2]).toHaveTextContent(`ออกใบแจ้งหนี้ ${numbers[0]} แล้ว`)
    expect(items[0]).toHaveTextContent('ใหม่')
    expect(items[2]).not.toHaveTextContent('ใหม่')
  })

  it('shows only my notifications, never those of another phone number', async () => {
    seedStorage((d) => {
      const other = d.invoices.find((i) => i.tenantPhone !== DEMO_TENANT_PHONE)!
      d.notifications.push(note('n-other-2', 'receiptIssued', other.id, today, false, other.tenantPhone))
    })
    await open()
    await userEvent.click(await screen.findByRole('button', { name: /การแจ้งเตือน/ }))
    const other = (await createLocalBillingApi({ storage: localStorage, today: () => today }).load()).invoices.find((i) => i.tenantPhone !== DEMO_TENANT_PHONE)!
    expect(within(screen.getByRole('dialog')).queryByText(new RegExp(other.number))).not.toBeInTheDocument()
  })

  it('opens the invoice from a notification: marks it read, goes to ?invoice= and closes the list', async () => {
    const data = seedStorage()
    const unread = mine(data).filter((n) => !n.read)
    const target = unread[0]
    const invoice = data.invoices.find((i) => i.id === target.invoiceId)!
    await open()
    await userEvent.click(await screen.findByRole('button', { name: /การแจ้งเตือน/ }))
    await userEvent.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: new RegExp(invoice.number) })[0])
    expect(await screen.findByRole('dialog', { name: `ใบแจ้งหนี้ ${invoice.number}` })).toBeInTheDocument()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    const left = unread.length - 1
    const button = screen.getByRole('button', { name: /การแจ้งเตือน/ })
    if (left === 0) expect(button.querySelector('[data-testid="bell-count"]')).toBeNull()
    else expect(within(button).getByText(String(left))).toBeInTheDocument()
    const stored = await createLocalBillingApi({ storage: localStorage, today: () => today }).load()
    expect(stored.notifications.find((n) => n.id === target.id)!.read).toBe(true)
  })

  it('goes to the invoice through the address ?invoice=<id>', async () => {
    const data = seedStorage()
    const target = mine(data).find((n) => !n.read)!
    await open('tenant', '/tenant/overview')
    await userEvent.click(await screen.findByRole('button', { name: /การแจ้งเตือน/ }))
    await userEvent.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: /ใบแจ้งหนี้/ })[0])
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/tenant\/billing\?invoice=/))
    expect(screen.getByTestId('location').textContent).toContain(target.invoiceId)
  })

  it('marks everything of mine as read, and leaves other tenants alone', async () => {
    const data = seedStorage((d) => {
      const other = d.invoices.find((i) => i.tenantPhone !== DEMO_TENANT_PHONE)!
      d.notifications.push(note('n-other-3', 'slipRejected', other.id, today, false, other.tenantPhone))
    })
    const othersUnread = data.notifications.filter((n) => n.recipientPhone !== DEMO_TENANT_PHONE && !n.read).length
    await open()
    await userEvent.click(await screen.findByRole('button', { name: /การแจ้งเตือน/ }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'อ่านทั้งหมด' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'การแจ้งเตือน' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'การแจ้งเตือน' }).querySelector('[data-testid="bell-count"]')).toBeNull()
    const stored = await createLocalBillingApi({ storage: localStorage, today: () => today }).load()
    expect(stored.notifications.filter((n) => n.recipientPhone === DEMO_TENANT_PHONE).every((n) => n.read)).toBe(true)
    expect(stored.notifications.filter((n) => n.recipientPhone !== DEMO_TENANT_PHONE && !n.read)).toHaveLength(othersUnread)
  })
})

describe('NotificationBell: live updates, keyboard and language', () => {
  it('shows a notification created in another tab without a refresh (storage event)', async () => {
    const data = seedStorage()
    const before = mine(data).filter((n) => !n.read).length
    await open()
    await screen.findByRole('button', { name: /การแจ้งเตือน/ })
    const api = createLocalBillingApi({ storage: localStorage, today: () => today })
    const pendingInvoice = (await api.load()).invoices.find((i) => i.tenantPhone === DEMO_TENANT_PHONE && i.slips.some((s) => s.status === 'pending'))
    const target = pendingInvoice ?? demoInvoices(data).find((i) => invoiceStatus(i, today) !== 'paid')!
    const slip = pendingInvoice ? pendingInvoice.slips.find((s) => s.status === 'pending')! : (await api.submitSlip(target.id, { name: 's.png', type: 'image/png', size: 100 })).slips.at(-1)!
    await api.rejectSlip(target.id, slip.id, 'ไม่ชัด')
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: BILLING_KEY }))
    })
    await waitFor(() => expect(within(bell()).getByText(String(before + 1))).toBeInTheDocument())
  })

  it('opens with the keyboard, closes with Escape and gives the focus back to the button', async () => {
    seedStorage()
    const user = userEvent.setup()
    await open()
    const button = await screen.findByRole('button', { name: /การแจ้งเตือน/ })
    button.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('dialog', { name: 'การแจ้งเตือน' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(button).toHaveFocus()
  })

  it('shows the wording in English', async () => {
    await i18n.changeLanguage('en')
    seedStorage()
    await open()
    await userEvent.click(await screen.findByRole('button', { name: /Notifications/ }))
    const dialog = screen.getByRole('dialog', { name: 'Notifications' })
    expect(within(dialog).getByRole('button', { name: 'Mark all as read' })).toBeInTheDocument()
    expect(within(dialog).getAllByRole('listitem')[0]).toHaveTextContent(/Invoice .* issued/)
  })
})

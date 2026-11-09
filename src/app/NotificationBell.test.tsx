import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { DEMO_TECH_PHONE, DEMO_TENANT_PHONE } from '../auth/demoAccounts'
import i18n from '../i18n'
import { BILLING_KEY, createLocalBillingApi } from '../billing/localBillingApi'
import { createLocalFacilitiesApi, FACILITIES_KEY } from '../facilities/localFacilitiesApi'
import { makeFacilitiesSeed } from '../facilities/seed'
import type { FacilitiesData } from '../facilities/types'
import { createLocalMaintenanceApi, MAINTENANCE_KEY } from '../maintenance/localMaintenanceApi'
import { makeMaintenanceSeed } from '../maintenance/seed'
import type { MaintenanceData } from '../maintenance/types'
import { invoiceStatus, tenantInvoices } from '../billing/rules'
import { makeBillingSeed } from '../billing/seed'
import type { AppNotification, BillingData } from '../billing/types'
import { PROPERTY_KEY } from '../property/localPropertyApi'
import { addDays, todayISO } from '../property/dates'
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

/**
 * Puts sample property, billing and maintenance data into localStorage, as another tab or an earlier visit would.
 * `edit` changes the billing data; the maintenance notifications start empty so the billing tests count only billing.
 */
function seedStorage(
  edit: (data: BillingData) => void = () => {},
  editMaintenance: (data: MaintenanceData) => void = (d) => void (d.notifications = []),
  editFacilities: (data: FacilitiesData) => void = (d) => void (d.notifications = []),
) {
  const property = makeSeed(today)
  const data = makeBillingSeed(property, today)
  edit(data)
  const repairs = makeMaintenanceSeed(property, today)
  editMaintenance(repairs)
  const places = makeFacilitiesSeed(property, today)
  editFacilities(places)
  localStorage.setItem(PROPERTY_KEY, JSON.stringify(property))
  localStorage.setItem(BILLING_KEY, JSON.stringify(data))
  localStorage.setItem(MAINTENANCE_KEY, JSON.stringify(repairs))
  localStorage.setItem(FACILITIES_KEY, JSON.stringify(places))
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
  ] as const)('is shown to the %s too', async (role, path) => {
    seedStorage()
    await open(role, path)
    expect(await screen.findByRole('button', { name: /การแจ้งเตือน/ })).toBeInTheDocument()
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
      rejected.slips = [{ id: 's-reject-1', submittedAt: today, fileName: 'x.png', fileSize: 100, status: 'rejected', reviewedAt: today, rejectReason: 'เหตุผลของสลิปใหม่' }]
      numbers = [a.number, rejected.number, (c ?? a).number]
      withMine([
        note('n-1', 'invoiceIssued', a.id, '2026-01-10', true),
        { ...note('n-2', 'slipRejected', rejected.id, '2026-01-12'), reason: 'ยอดไม่ตรง' },
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
    expect(items[1]).toHaveTextContent('เหตุผล: ยอดไม่ตรง') // the reason given at the time, not that of a newer rejection
    expect(items[1]).not.toHaveTextContent('เหตุผลของสลิปใหม่')
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

describe('NotificationBell: repair notices', () => {
  const property = makeSeed(today)
  const repairs = makeMaintenanceSeed(property, today)
  const codeOf = (id: string) => repairs.requests.find((r) => r.id === id)!
  const newest = (recipient: string) =>
    repairs.notifications.filter((n) => n.recipient === recipient && !n.read).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))

  it('adds the tenant’s repair notices to the billing ones in one count and one list', async () => {
    const data = seedStorage(undefined, () => {})
    const unread = mine(data).filter((n) => !n.read).length + repairs.notifications.filter((n) => n.recipient === DEMO_TENANT_PHONE && !n.read).length
    await open()
    expect(within(await screen.findByRole('button', { name: /การแจ้งเตือน/ })).getByText(String(unread))).toBeInTheDocument()
  })

  it('opens the request from a tenant’s repair notice: goes to ?request=, shows the request, marks it read', async () => {
    seedStorage(undefined, () => {})
    const target = newest(DEMO_TENANT_PHONE).find((n) => n.type === 'statusChanged')!
    const request = codeOf(target.requestId)
    await open()
    await userEvent.click(await screen.findByRole('button', { name: /การแจ้งเตือน/ }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: new RegExp(`งานซ่อม ${request.code} เปลี่ยนเป็น “${{ waiting: 'รอการมอบหมาย', assigned: 'มอบหมายแล้ว', inProgress: 'กำลังซ่อม', done: 'เสร็จสิ้น' }[target.status!]}”`) }))
    expect(await screen.findByRole('dialog', { name: `แจ้งซ่อม ${request.code}` })).toBeInTheDocument()
    expect(screen.getByTestId('location').textContent).toBe(`/tenant/maintenance?request=${request.id}`)
    const stored = JSON.parse(localStorage.getItem(MAINTENANCE_KEY) as string) as MaintenanceData
    expect(stored.notifications.find((n) => n.id === target.id)!.read).toBe(true)
  })

  it('shows the juristic office the new requests, and opens the one they press', async () => {
    seedStorage(undefined, () => {})
    const unread = newest('role:juristic')
    expect(unread.length).toBeGreaterThan(0)
    const request = codeOf(unread[0].requestId)
    await open('juristic', '/juristic/billing')
    const button = await screen.findByRole('button', { name: /การแจ้งเตือน/ })
    expect(within(button).getByText(String(unread.length))).toBeInTheDocument()
    await userEvent.click(button)
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: new RegExp(`มีแจ้งซ่อมใหม่ ${request.code} ห้อง ${request.unitCode}`) }))
    expect(await screen.findByRole('dialog', { name: `แจ้งซ่อม ${request.code}` })).toBeInTheDocument()
    expect(screen.getByTestId('location').textContent).toBe(`/juristic/maintenance?request=${request.id}`)
  })

  it('shows a technician the jobs given to them, and opens the one they press', async () => {
    seedStorage(undefined, () => {})
    const unread = newest(DEMO_TECH_PHONE)
    expect(unread.length).toBeGreaterThan(0)
    const request = codeOf(unread[0].requestId)
    await open('technician', '/technician/jobs')
    await userEvent.click(await screen.findByRole('button', { name: /การแจ้งเตือน/ }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: new RegExp(`ได้รับมอบหมายงาน ${request.code}`) }))
    expect(await screen.findByRole('dialog', { name: `แจ้งซ่อม ${request.code}` })).toBeInTheDocument()
    expect(screen.getByTestId('location').textContent).toBe(`/technician/jobs?request=${request.id}`)
  })

  it('marks the juristic office’s notices read with "mark all", leaving the rest', async () => {
    seedStorage(undefined, () => {})
    await open('juristic', '/juristic/billing')
    await userEvent.click(await screen.findByRole('button', { name: /การแจ้งเตือน/ }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'อ่านทั้งหมด' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'การแจ้งเตือน' })).toBeInTheDocument())
    const stored = JSON.parse(localStorage.getItem(MAINTENANCE_KEY) as string) as MaintenanceData
    expect(stored.notifications.filter((n) => n.recipient === 'role:juristic').every((n) => n.read)).toBe(true)
    expect(stored.notifications.filter((n) => n.recipient !== 'role:juristic' && !n.read)).toHaveLength(repairs.notifications.filter((n) => n.recipient !== 'role:juristic' && !n.read).length)
  })

  it('shows a request made in another tab without a refresh (storage event)', async () => {
    seedStorage(undefined, () => {})
    const before = newest('role:juristic').length
    await open('juristic', '/juristic/billing')
    await screen.findByRole('button', { name: /การแจ้งเตือน/ })
    const api = createLocalMaintenanceApi({ storage: localStorage, today: () => today })
    await api.createRequest({ category: 'plumbing', title: 'ท่อรั่ว', description: 'น้ำรั่ว', photos: [{ name: 'a.jpg', dataUrl: 'data:image/jpeg;base64,QUJD' }], tenantPhone: DEMO_TENANT_PHONE, tenantName: 'สมชาย ผู้เช่า' })
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: MAINTENANCE_KEY }))
    })
    await waitFor(() => expect(within(screen.getByRole('button', { name: /การแจ้งเตือน/ })).getByText(String(before + 1))).toBeInTheDocument())
  })
})

describe('NotificationBell: bookings and parcels', () => {
  const places = makeFacilitiesSeed(makeSeed(today), today)
  const keep = () => {}
  const unreadFor = (recipient: string, types: string[]) =>
    places.notifications.filter((n) => n.recipient === recipient && !n.read && types.includes(n.type)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))

  it('adds a tenant’s booking and parcel notices to the one count', async () => {
    const data = seedStorage(undefined, undefined, keep) // repair notices start empty so these tests count bookings and parcels only
    const unread = mine(data).filter((n) => !n.read).length + unreadFor(DEMO_TENANT_PHONE, ['bookingDecided', 'parcelArrived']).length
    await open()
    expect(within(await screen.findByRole('button', { name: /การแจ้งเตือน/ })).getByText(String(unread))).toBeInTheDocument()
  })

  it('opens the parcel from a tenant’s notice: goes to ?parcel=, shows it, marks it read', async () => {
    seedStorage(undefined, undefined, keep) // repair notices start empty so these tests count bookings and parcels only
    const target = unreadFor(DEMO_TENANT_PHONE, ['parcelArrived'])[0]
    const parcel = places.parcels.find((p) => p.id === target.refId)!
    await open()
    await userEvent.click(await screen.findByRole('button', { name: /การแจ้งเตือน/ }))
    await userEvent.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: new RegExp(`มีพัสดุมาส่งถึงห้อง ${parcel.unitCode} \\(${parcel.carrier}\\)`) })[0])
    expect(await screen.findByRole('dialog', { name: `พัสดุ ${parcel.code}` })).toBeInTheDocument()
    expect(screen.getByTestId('location').textContent).toBe(`/tenant/parcels?parcel=${parcel.id}`)
    const stored = JSON.parse(localStorage.getItem(FACILITIES_KEY) as string) as FacilitiesData
    expect(stored.notifications.find((n) => n.id === target.id)!.read).toBe(true)
  })

  it('opens the booking from the decision a tenant was told', async () => {
    seedStorage(undefined, undefined, keep) // repair notices start empty so these tests count bookings and parcels only
    const target = unreadFor(DEMO_TENANT_PHONE, ['bookingDecided'])[0]
    const booking = places.bookings.find((b) => b.id === target.refId)!
    await open()
    await userEvent.click(await screen.findByRole('button', { name: /การแจ้งเตือน/ }))
    await userEvent.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: new RegExp(`การจอง ${booking.code} `) })[0])
    expect(await screen.findByRole('dialog', { name: `การจอง ${booking.code}` })).toBeInTheDocument()
    expect(screen.getByTestId('location').textContent).toBe(`/tenant/facilities?booking=${booking.id}`)
  })

  it('shows the juristic office the new booking requests and opens the one they press', async () => {
    seedStorage(undefined, undefined, keep) // repair notices start empty so these tests count bookings and parcels only
    const created = unreadFor('role:juristic', ['bookingCreated', 'bookingCancelled'])
    expect(created.length).toBeGreaterThan(0)
    const booking = places.bookings.find((b) => b.id === created[0].refId)!
    await open('juristic', '/juristic/billing')
    const button = await screen.findByRole('button', { name: /การแจ้งเตือน/ })
    await userEvent.click(button)
    await userEvent.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: new RegExp(`มีคำขอจอง ${booking.code} `) })[0])
    expect(await screen.findByRole('dialog', { name: `การจอง ${booking.code}` })).toBeInTheDocument()
    expect(screen.getByTestId('location').textContent).toBe(`/juristic/parcels-bookings?booking=${booking.id}`)
  })

  it('shows a booking made in another tab without a refresh (storage event)', async () => {
    seedStorage(undefined, undefined, keep) // repair notices start empty so these tests count bookings and parcels only
    const before = places.notifications.filter((n) => n.recipient === 'role:juristic' && !n.read).length
    await open('juristic', '/juristic/billing')
    await screen.findByRole('button', { name: /การแจ้งเตือน/ })
    const api = createLocalFacilitiesApi({ storage: localStorage, today: () => today })
    const data = await api.load()
    const meeting = data.facilities.find((f) => f.key === 'meeting')!
    await api.createBooking({ facilityId: meeting.id, date: addDays(today, 12), startHour: 15, endHour: 16, people: 1, tenantPhone: DEMO_TENANT_PHONE, tenantName: 'สมชาย ผู้เช่า' })
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: FACILITIES_KEY }))
    })
    await waitFor(() => expect(within(screen.getByRole('button', { name: /การแจ้งเตือน/ })).getByText(String(before + 1))).toBeInTheDocument())
  })
})

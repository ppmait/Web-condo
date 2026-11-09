import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { DEMO_TECH_PHONE, DEMO_TENANT_PHONE } from '../auth/demoAccounts'
import { BillingProvider } from '../billing/BillingProvider'
import { BILLING_KEY } from '../billing/localBillingApi'
import { makeBillingSeed } from '../billing/seed'
import { FacilitiesProvider } from '../facilities/FacilitiesProvider'
import { FACILITIES_KEY } from '../facilities/localFacilitiesApi'
import { makeFacilitiesSeed } from '../facilities/seed'
import i18n from '../i18n'
import { MAINTENANCE_KEY } from '../maintenance/localMaintenanceApi'
import { MaintenanceProvider } from '../maintenance/MaintenanceProvider'
import { makeMaintenanceSeed } from '../maintenance/seed'
import { todayISO } from '../property/dates'
import { PROPERTY_KEY } from '../property/localPropertyApi'
import { makeSeed } from '../property/seed'
import { renderApp } from '../test/renderApp'
import { useNotifications } from './useNotifications'

afterEach(async () => {
  await i18n.changeLanguage('th')
})

const today = todayISO()
const property = makeSeed(today)
const billing = makeBillingSeed(property, today)
const maintenance = makeMaintenanceSeed(property, today)
const facilities = makeFacilitiesSeed(property, today)
const TENANT_FACILITY_TYPES = ['bookingDecided', 'parcelArrived']
const OFFICE_FACILITY_TYPES = ['bookingCreated', 'bookingCancelled']

function Probe() {
  const { notices, unread, markAllRead } = useNotifications()
  return (
    <div>
      <span data-testid="unread">{unread}</span>
      <ul>
        {notices.map((n) => (
          <li key={n.key} data-testid="notice" data-read={n.read} data-to={n.to}>
            {n.source}|{n.createdAt}|{n.text}|{n.reason ?? ''}
            <button onClick={() => void n.markRead()}>read {n.key}</button>
          </li>
        ))}
      </ul>
      <button onClick={() => void markAllRead()}>all</button>
    </div>
  )
}

/** the data a visit would have left in storage; `edit` may change the maintenance and the facilities data first */
function seed(edit: { maintenance?: (d: typeof maintenance) => void; facilities?: (d: typeof facilities) => void } = {}) {
  const m = structuredClone(maintenance)
  const f = structuredClone(facilities)
  edit.maintenance?.(m)
  edit.facilities?.(f)
  localStorage.setItem(PROPERTY_KEY, JSON.stringify(property))
  localStorage.setItem(BILLING_KEY, JSON.stringify(billing))
  localStorage.setItem(MAINTENANCE_KEY, JSON.stringify(m))
  localStorage.setItem(FACILITIES_KEY, JSON.stringify(f))
}

const open = async (as: 'tenant' | 'juristic' | 'technician', path: string, edit: Parameters<typeof seed>[0] = {}) => {
  seed(edit)
  await renderApp(path, {
    as,
    // the probe sits next to the app, so it brings its own providers (same storage as the app's)
    extra: (
      <BillingProvider>
        <MaintenanceProvider>
          <FacilitiesProvider>
            <Probe />
          </FacilitiesProvider>
        </MaintenanceProvider>
      </BillingProvider>
    ),
  })
  await screen.findByTestId('unread')
}
const notices = () => screen.queryAllByTestId('notice')
const keys = () => notices().map((n) => n.querySelector('button')!.textContent!.replace('read ', ''))
const stored = <T,>(key: string) => JSON.parse(localStorage.getItem(key) as string) as T

describe('useNotifications', () => {
  it('gives a tenant the billing, repair and facility notices of their own phone number, newest first, and nobody else’s', async () => {
    await open('tenant', '/tenant/overview')
    await waitFor(() => expect(notices().length).toBeGreaterThan(0))
    const expected = [
      ...billing.notifications.filter((n) => n.recipientPhone === DEMO_TENANT_PHONE).map((n) => `billing:${n.id}`),
      ...maintenance.notifications.filter((n) => n.recipient === DEMO_TENANT_PHONE).map((n) => `maintenance:${n.id}`),
      ...facilities.notifications.filter((n) => n.recipient === DEMO_TENANT_PHONE).map((n) => `facilities:${n.id}`),
    ]
    for (const source of ['billing:', 'maintenance:', 'facilities:']) expect(expected.some((e) => e.startsWith(source))).toBe(true)
    expect([...keys()].sort()).toEqual([...expected].sort())
    const dates = notices().map((n) => n.textContent!.split('|')[1])
    expect(dates).toEqual([...dates].sort().reverse())
  })

  it('counts the unread ones of all three sources together', async () => {
    await open('tenant', '/tenant/overview')
    const want =
      billing.notifications.filter((n) => n.recipientPhone === DEMO_TENANT_PHONE && !n.read).length +
      maintenance.notifications.filter((n) => n.recipient === DEMO_TENANT_PHONE && !n.read).length +
      facilities.notifications.filter((n) => n.recipient === DEMO_TENANT_PHONE && !n.read).length
    expect(want).toBeGreaterThan(2)
    await waitFor(() => expect(screen.getByTestId('unread')).toHaveTextContent(String(want)))
  })

  it('gives the juristic office only the notices addressed to the office, repairs and facilities, and no billing notice', async () => {
    await open('juristic', '/juristic/dashboard')
    const want = [...maintenance.notifications, ...facilities.notifications].filter((n) => n.recipient === 'role:juristic')
    await waitFor(() => expect(notices()).toHaveLength(want.length))
    expect(keys().every((k) => !k.startsWith('billing:'))).toBe(true)
    expect(keys().some((k) => k.startsWith('facilities:'))).toBe(true)
    for (const n of notices()) expect(n.getAttribute('data-to')).toMatch(/^\/juristic\/(maintenance\?request=|parcels-bookings\?booking=)/)
  })

  it('gives a technician only the notices addressed to their phone number, and none from facilities', async () => {
    await open('technician', '/technician/jobs')
    const want = maintenance.notifications.filter((n) => n.recipient === DEMO_TECH_PHONE)
    expect(want.length).toBeGreaterThan(0)
    await waitFor(() => expect(notices()).toHaveLength(want.length))
    expect(keys().every((k) => k.startsWith('maintenance:'))).toBe(true)
    expect(notices().every((n) => n.getAttribute('data-to')!.startsWith('/technician/jobs?request='))).toBe(true)
  })

  it('shows each role only the kinds of notice meant for it, even when the phone number matches another role’s', async () => {
    const strayMaintenance = (to: string, type: 'assigned' | 'requestCreated' | 'statusChanged') => (d: typeof maintenance) =>
      void d.notifications.push({ id: `stray-m-${type}-${to}`, type, requestId: d.requests[0].id, recipient: to, createdAt: today, read: false })
    const strayFacilities = (to: string, type: 'bookingCreated' | 'bookingCancelled' | 'bookingDecided' | 'parcelArrived') => (d: typeof facilities) =>
      void d.notifications.push({ id: `stray-f-${type}-${to}`, type, refId: type === 'parcelArrived' ? d.parcels[0].id : d.bookings[0].id, recipient: to, createdAt: today, read: false })
    // a tenant whose phone is also the address of an 'assigned' repair notice and of a 'bookingCreated' notice
    await open('tenant', '/tenant/overview', { maintenance: strayMaintenance(DEMO_TENANT_PHONE, 'assigned'), facilities: strayFacilities(DEMO_TENANT_PHONE, 'bookingCreated') })
    await waitFor(() => expect(notices().length).toBeGreaterThan(0))
    expect(keys()).not.toContain(`maintenance:stray-m-assigned-${DEMO_TENANT_PHONE}`)
    expect(keys()).not.toContain(`facilities:stray-f-bookingCreated-${DEMO_TENANT_PHONE}`)
  })

  it('does not give the office a tenant-addressed kind, nor a technician anything of the office', async () => {
    await open('juristic', '/juristic/dashboard', {
      facilities: (d) => void d.notifications.push({ id: 'stray-f', type: 'bookingDecided', refId: d.bookings[0].id, recipient: 'role:juristic', createdAt: today, read: false, status: 'confirmed' }),
      maintenance: (d) => void d.notifications.push({ id: 'stray-m', type: 'statusChanged', requestId: d.requests[0].id, recipient: 'role:juristic', createdAt: today, read: false, status: 'done' }),
    })
    await waitFor(() => expect(notices().length).toBeGreaterThan(0))
    expect(keys()).not.toContain('facilities:stray-f')
    expect(keys()).not.toContain('maintenance:stray-m')
  })

  it('words repair and facility notices from their type, the code and the details, in either language', async () => {
    await open('juristic', '/juristic/dashboard')
    const created = maintenance.notifications.find((n) => n.recipient === 'role:juristic')!
    const request = maintenance.requests.find((r) => r.id === created.requestId)!
    const booking = facilities.bookings.find((b) => b.id === facilities.notifications.find((n) => n.type === 'bookingCreated')!.refId)!
    await waitFor(() => expect(screen.getAllByTestId('notice').some((n) => n.textContent!.includes(`มีแจ้งซ่อมใหม่ ${request.code} ห้อง ${request.unitCode}`))).toBe(true))
    await waitFor(() => expect(screen.getAllByTestId('notice').some((n) => n.textContent!.includes(`มีคำขอจอง ${booking.code}`))).toBe(true))
    await i18n.changeLanguage('en')
    await waitFor(() => expect(screen.getAllByTestId('notice').some((n) => n.textContent!.includes(`New booking request ${booking.code}`))).toBe(true))
  })

  it('words a tenant’s facility notices: the decision with its status and the reason of a rejection, and a parcel that arrived', async () => {
    await open('tenant', '/tenant/overview')
    const rejected = facilities.bookings.find((b) => b.status === 'rejected' && b.tenantPhone === DEMO_TENANT_PHONE)!
    const parcel = facilities.parcels.find((p) => p.status === 'waiting' && p.tenantPhone === DEMO_TENANT_PHONE)!
    await waitFor(() => expect(screen.getAllByTestId('notice').some((n) => n.textContent!.includes(`การจอง ${rejected.code} ปฏิเสธ`) && n.textContent!.includes(`|${rejected.history.at(-1)!.note}`))).toBe(true))
    expect(screen.getAllByTestId('notice').some((n) => n.textContent!.includes(`มีพัสดุมาส่งถึงห้อง ${parcel.unitCode} (${parcel.carrier})`))).toBe(true)
  })

  it('points a tenant’s notices at the right page: invoices, repairs, bookings or parcels', async () => {
    await open('tenant', '/tenant/overview')
    await waitFor(() => expect(notices().length).toBeGreaterThan(0))
    const seen = new Set<string>()
    for (const n of notices()) {
      const [source, , text] = n.textContent!.split('|')
      const to = n.getAttribute('data-to')!
      if (source === 'billing') expect(to).toMatch(/^\/tenant\/billing\?invoice=/)
      else if (source === 'maintenance') expect(to).toMatch(/^\/tenant\/maintenance\?request=/)
      else expect(to).toMatch(text.includes('พัสดุ') ? /^\/tenant\/parcels\?parcel=/ : /^\/tenant\/facilities\?booking=/)
      seen.add(to.split('?')[0])
    }
    expect([...seen].sort()).toEqual(['/tenant/billing', '/tenant/facilities', '/tenant/maintenance', '/tenant/parcels'])
  })

  it('marks one notice read, in its own source only', async () => {
    await open('tenant', '/tenant/overview')
    await waitFor(() => expect(notices().length).toBeGreaterThan(0))
    const target = facilities.notifications.find((n) => n.recipient === DEMO_TENANT_PHONE && !n.read)!
    await userEvent.click(screen.getByRole('button', { name: `read facilities:${target.id}` }))
    await waitFor(() => expect(stored<typeof facilities>(FACILITIES_KEY).notifications.find((n) => n.id === target.id)!.read).toBe(true))
    expect(stored<typeof billing>(BILLING_KEY).notifications.filter((n) => !n.read)).toHaveLength(billing.notifications.filter((n) => !n.read).length)
    expect(stored<typeof maintenance>(MAINTENANCE_KEY).notifications.filter((n) => !n.read)).toHaveLength(maintenance.notifications.filter((n) => !n.read).length)
  })

  it('marks everything of the user read in all three sources, and leaves other people’s alone', async () => {
    await open('tenant', '/tenant/overview')
    await waitFor(() => expect(notices().length).toBeGreaterThan(0))
    await userEvent.click(screen.getByRole('button', { name: 'all' }))
    await waitFor(() => expect(screen.getByTestId('unread')).toHaveTextContent('0'))
    expect(stored<typeof billing>(BILLING_KEY).notifications.filter((n) => n.recipientPhone === DEMO_TENANT_PHONE).every((n) => n.read)).toBe(true)
    expect(stored<typeof maintenance>(MAINTENANCE_KEY).notifications.filter((n) => n.recipient === DEMO_TENANT_PHONE).every((n) => n.read)).toBe(true)
    const f = stored<typeof facilities>(FACILITIES_KEY).notifications
    expect(f.filter((n) => n.recipient === DEMO_TENANT_PHONE).every((n) => n.read)).toBe(true)
    expect(f.filter((n) => n.recipient !== DEMO_TENANT_PHONE && !n.read)).toHaveLength(facilities.notifications.filter((n) => n.recipient !== DEMO_TENANT_PHONE && !n.read).length)
  })

  it('marks everything of the juristic office read in both sources, without touching tenants’ or technicians’ notices', async () => {
    await open('juristic', '/juristic/dashboard')
    await waitFor(() => expect(notices().length).toBeGreaterThan(0))
    await userEvent.click(screen.getByRole('button', { name: 'all' }))
    await waitFor(() => expect(screen.getByTestId('unread')).toHaveTextContent('0'))
    for (const [key, data] of [[MAINTENANCE_KEY, maintenance], [FACILITIES_KEY, facilities]] as const) {
      const n = stored<typeof data>(key).notifications
      expect(n.filter((x) => x.recipient === 'role:juristic').every((x) => x.read)).toBe(true)
      expect(n.filter((x) => x.recipient !== 'role:juristic' && !x.read)).toHaveLength(data.notifications.filter((x) => x.recipient !== 'role:juristic' && !x.read).length)
    }
  })

  it('has the facility kinds only the roles they are meant for', () => {
    expect(TENANT_FACILITY_TYPES).not.toEqual(OFFICE_FACILITY_TYPES)
  })
})

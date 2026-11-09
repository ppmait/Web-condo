import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { DEMO_TECH_PHONE, DEMO_TENANT_PHONE } from '../auth/demoAccounts'
import { BillingProvider } from '../billing/BillingProvider'
import { BILLING_KEY } from '../billing/localBillingApi'
import { makeBillingSeed } from '../billing/seed'
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

function Probe() {
  const { notices, unread, markAllRead } = useNotifications()
  return (
    <div>
      <span data-testid="unread">{unread}</span>
      <ul>
        {notices.map((n) => (
          <li key={n.key} data-testid="notice" data-read={n.read} data-to={n.to}>
            {n.source}|{n.createdAt}|{n.text}
            <button onClick={() => void n.markRead()}>read {n.key}</button>
          </li>
        ))}
      </ul>
      <button onClick={() => void markAllRead()}>all</button>
    </div>
  )
}

function seed() {
  localStorage.setItem(PROPERTY_KEY, JSON.stringify(property))
  localStorage.setItem(BILLING_KEY, JSON.stringify(billing))
  localStorage.setItem(MAINTENANCE_KEY, JSON.stringify(maintenance))
}

const open = async (as: 'tenant' | 'juristic' | 'technician', path: string) => {
  seed()
  await renderApp(path, {
    as,
    // the probe sits next to the app, so it brings its own providers (same storage as the app's)
    extra: (
      <BillingProvider>
        <MaintenanceProvider>
          <Probe />
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
  it('gives a tenant the billing and the repair notices of their own phone number, newest first, and nobody else’s', async () => {
    await open('tenant', '/tenant/overview')
    await waitFor(() => expect(notices().length).toBeGreaterThan(0))
    const expected = [
      ...billing.notifications.filter((n) => n.recipientPhone === DEMO_TENANT_PHONE).map((n) => ({ key: `billing:${n.id}`, at: n.createdAt })),
      ...maintenance.notifications.filter((n) => n.recipient === DEMO_TENANT_PHONE).map((n) => ({ key: `maintenance:${n.id}`, at: n.createdAt })),
    ]
    expect(expected.some((e) => e.key.startsWith('billing:'))).toBe(true)
    expect(expected.some((e) => e.key.startsWith('maintenance:'))).toBe(true)
    expect([...keys()].sort()).toEqual(expected.map((e) => e.key).sort())
    const dates = notices().map((n) => n.textContent!.split('|')[1])
    expect(dates).toEqual([...dates].sort().reverse())
  })

  it('counts the unread ones of both sources together', async () => {
    await open('tenant', '/tenant/overview')
    const want =
      billing.notifications.filter((n) => n.recipientPhone === DEMO_TENANT_PHONE && !n.read).length +
      maintenance.notifications.filter((n) => n.recipient === DEMO_TENANT_PHONE && !n.read).length
    expect(want).toBeGreaterThan(1)
    await waitFor(() => expect(screen.getByTestId('unread')).toHaveTextContent(String(want)))
  })

  it('gives the juristic office only the notices addressed to the office, and no billing notice', async () => {
    await open('juristic', '/juristic/dashboard')
    const want = maintenance.notifications.filter((n) => n.recipient === 'role:juristic')
    await waitFor(() => expect(notices()).toHaveLength(want.length))
    expect(keys().every((k) => k.startsWith('maintenance:'))).toBe(true)
    expect(notices().every((n) => n.getAttribute('data-to')!.startsWith('/juristic/maintenance?request='))).toBe(true)
  })

  it('gives a technician only the notices addressed to their phone number', async () => {
    await open('technician', '/technician/jobs')
    const want = maintenance.notifications.filter((n) => n.recipient === DEMO_TECH_PHONE)
    expect(want.length).toBeGreaterThan(0)
    await waitFor(() => expect(notices()).toHaveLength(want.length))
    expect(notices().every((n) => n.getAttribute('data-to')!.startsWith('/technician/jobs?request='))).toBe(true)
  })

  it('words repair notices from their type, the code, the unit and the status, in either language', async () => {
    await open('juristic', '/juristic/dashboard')
    const created = maintenance.notifications.find((n) => n.recipient === 'role:juristic')!
    const request = maintenance.requests.find((r) => r.id === created.requestId)!
    await waitFor(() => expect(screen.getAllByTestId('notice').some((n) => n.textContent!.includes(`มีแจ้งซ่อมใหม่ ${request.code} ห้อง ${request.unitCode}`))).toBe(true))
    await i18n.changeLanguage('en')
    await waitFor(() => expect(screen.getAllByTestId('notice').some((n) => n.textContent!.includes(`New repair request ${request.code}, unit ${request.unitCode}`))).toBe(true))
  })

  it('points a tenant’s notices at the right page: invoices for billing, requests for repairs', async () => {
    await open('tenant', '/tenant/overview')
    await waitFor(() => expect(notices().length).toBeGreaterThan(0))
    for (const n of notices()) {
      const source = n.textContent!.split('|')[0]
      expect(n.getAttribute('data-to')).toMatch(source === 'billing' ? /^\/tenant\/billing\?invoice=/ : /^\/tenant\/maintenance\?request=/)
    }
  })

  it('marks one notice read, in its own source only', async () => {
    await open('tenant', '/tenant/overview')
    await waitFor(() => expect(notices().length).toBeGreaterThan(0))
    const target = maintenance.notifications.find((n) => n.recipient === DEMO_TENANT_PHONE && !n.read)!
    await userEvent.click(screen.getByRole('button', { name: `read maintenance:${target.id}` }))
    await waitFor(() => expect(stored<typeof maintenance>(MAINTENANCE_KEY).notifications.find((n) => n.id === target.id)!.read).toBe(true))
    const billingUnread = billing.notifications.filter((n) => !n.read).length
    expect(stored<typeof billing>(BILLING_KEY).notifications.filter((n) => !n.read)).toHaveLength(billingUnread)
  })

  it('marks everything of the user read in both sources, and leaves other people’s alone', async () => {
    await open('tenant', '/tenant/overview')
    await waitFor(() => expect(notices().length).toBeGreaterThan(0))
    await userEvent.click(screen.getByRole('button', { name: 'all' }))
    await waitFor(() => expect(screen.getByTestId('unread')).toHaveTextContent('0'))
    const b = stored<typeof billing>(BILLING_KEY).notifications
    const m = stored<typeof maintenance>(MAINTENANCE_KEY).notifications
    expect(b.filter((n) => n.recipientPhone === DEMO_TENANT_PHONE).every((n) => n.read)).toBe(true)
    expect(m.filter((n) => n.recipient === DEMO_TENANT_PHONE).every((n) => n.read)).toBe(true)
    expect(m.filter((n) => n.recipient !== DEMO_TENANT_PHONE && !n.read)).toHaveLength(maintenance.notifications.filter((n) => n.recipient !== DEMO_TENANT_PHONE && !n.read).length)
  })

  it('marks everything of the juristic office read, without touching technicians’ or tenants’ notices', async () => {
    await open('juristic', '/juristic/dashboard')
    await waitFor(() => expect(notices().length).toBeGreaterThan(0))
    await userEvent.click(screen.getByRole('button', { name: 'all' }))
    await waitFor(() => expect(screen.getByTestId('unread')).toHaveTextContent('0'))
    const m = stored<typeof maintenance>(MAINTENANCE_KEY).notifications
    expect(m.filter((n) => n.recipient === 'role:juristic').every((n) => n.read)).toBe(true)
    expect(m.filter((n) => n.recipient !== 'role:juristic' && !n.read)).toHaveLength(maintenance.notifications.filter((n) => n.recipient !== 'role:juristic' && !n.read).length)
  })
})

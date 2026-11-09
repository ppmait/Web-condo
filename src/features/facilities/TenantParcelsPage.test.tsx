import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEMO_TENANT_PHONE } from '../../auth/demoAccounts'
import { createLocalFacilitiesApi, FACILITIES_KEY } from '../../facilities/localFacilitiesApi'
import { makeFacilitiesSeed } from '../../facilities/seed'
import type { FacilitiesData, Parcel } from '../../facilities/types'
import i18n from '../../i18n'
import { formatDate } from '../../lib/format'
import { MemoryStorage } from '../../test/memoryStorage'
import { renderApp } from '../../test/renderApp'
import { renderFacilities } from '../../test/renderFacilities'
import { TEST_TODAY } from '../../test/renderProperty'
import { makeTestFacilities } from '../../test/testFacilities'
import TenantParcelsPage from './TenantParcelsPage'

function LocationProbe() {
  const { pathname, search } = useLocation()
  return <span data-testid="location">{pathname + search}</span>
}

afterEach(async () => {
  vi.restoreAllMocks()
  await i18n.changeLanguage('th')
})

const PLACE: Record<string, string> = { frontDesk: 'เคาน์เตอร์นิติบุคคล', locker: 'ตู้ล็อกเกอร์' }

async function setup(opts: { route?: string; api?: ReturnType<typeof makeTestFacilities>['facilities'] } = {}) {
  const pair = makeTestFacilities()
  const api = opts.api ?? pair.facilities
  const view = await renderFacilities(
    <>
      <TenantParcelsPage />
      <LocationProbe />
    </>,
    { api, property: pair.property, as: 'tenant', route: opts.route ?? '/tenant/parcels' },
  )
  const data = await api.load()
  const sort = (a: Parcel, b: Parcel) => b.registeredAt.localeCompare(a.registeredAt) || b.code.localeCompare(a.code)
  const mine = data.parcels.filter((p) => p.tenantPhone === DEMO_TENANT_PHONE)
  return { ...view, api, data, waiting: mine.filter((p) => p.status === 'waiting').sort(sort), done: mine.filter((p) => p.status === 'pickedUp').sort(sort) }
}

const card = (p: Parcel) => screen.getByRole('button', { name: `เปิดพัสดุ ${p.code}` })
const codes = (region: HTMLElement) => within(region).getAllByRole('button', { name: /^เปิดพัสดุ / }).map((b) => b.getAttribute('aria-label')!.replace('เปิดพัสดุ ', ''))
const pendingRegion = () => screen.getByRole('region', { name: /^พัสดุรอรับ/ })
const doneRegion = () => screen.getByRole('region', { name: 'รับแล้ว' })

describe('TenantParcelsPage', () => {
  it('shows only my parcels, waiting and picked up apart, newest first, with the number waiting in the heading', async () => {
    const { data, waiting, done } = await setup()
    expect(waiting.length).toBeGreaterThanOrEqual(2)
    expect(done.length).toBeGreaterThanOrEqual(1)
    expect(codes(pendingRegion())).toEqual(waiting.map((p) => p.code))
    expect(codes(doneRegion())).toEqual(done.map((p) => p.code))
    expect(screen.getByRole('region', { name: `พัสดุรอรับ (${waiting.length})` })).toBeInTheDocument()
    for (const other of data.parcels.filter((p) => p.tenantPhone !== DEMO_TENANT_PHONE)) expect(screen.queryByText(other.code)).not.toBeInTheDocument()
  })

  it('shows carrier, tracking number, where it is kept, the day it arrived and a status badge with text', async () => {
    const { waiting } = await setup()
    const p = waiting.find((x) => x.trackingNo)!
    const c = within(card(p))
    expect(c.getByText(p.carrier)).toBeInTheDocument()
    expect(c.getByText(`เลขติดตาม ${p.trackingNo}`)).toBeInTheDocument()
    expect(c.getByText(PLACE[p.location])).toBeInTheDocument()
    expect(c.getByText(`มาถึง ${formatDate(p.registeredAt, 'th')}`)).toBeInTheDocument()
    expect(c.getByText('รอรับ')).toBeInTheDocument()
  })

  it('shows when a picked-up parcel was collected', async () => {
    const { done } = await setup()
    const p = done[0]
    const at = p.history.at(-1)!.at
    expect(within(card(p)).getByText(`รับเมื่อ ${formatDate(at, 'th')}`)).toBeInTheDocument()
    expect(within(card(p)).getByText('รับแล้ว')).toBeInTheDocument()
  })

  it('says so in each group when there is nothing', async () => {
    const p = makeTestFacilities()
    const seed = makeFacilitiesSeed(await p.property.load(), TEST_TODAY)
    const gone = new Set(seed.parcels.filter((x) => x.tenantPhone === DEMO_TENANT_PHONE).map((x) => x.id))
    const data: FacilitiesData = { ...seed, parcels: seed.parcels.filter((x) => !gone.has(x.id)), notifications: seed.notifications.filter((n) => !gone.has(n.refId)) }
    const storage = new MemoryStorage()
    storage.setItem(FACILITIES_KEY, JSON.stringify(data))
    await setup({ api: createLocalFacilitiesApi({ storage, today: () => TEST_TODAY, property: p.property }) })
    expect(screen.getByText('ไม่มีพัสดุที่รอรับ')).toBeInTheDocument()
    expect(screen.getByText('ยังไม่มีพัสดุที่รับแล้ว')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'พัสดุรอรับ (0)' })).toBeInTheDocument()
  })

  it('opens the detail with the facts and the timeline, and closes with Escape', async () => {
    const { done } = await setup()
    const p = done[0]
    await userEvent.click(card(p))
    const dialog = screen.getByRole('dialog', { name: `พัสดุ ${p.code}` })
    expect(within(dialog).getByText(p.carrier)).toBeInTheDocument()
    expect(within(dialog).getByText(p.unitCode)).toBeInTheDocument()
    const steps = within(within(dialog).getByRole('list', { name: 'ความคืบหน้า' })).getAllByRole('listitem')
    expect(steps).toHaveLength(p.history.length)
    expect(steps[0]).toHaveTextContent('รอรับ')
    expect(steps[1]).toHaveTextContent('รับแล้ว')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows a parcel registered meanwhile (another tab) after the stored data changed', async () => {
    const { api, waiting } = await setup()
    const lease = (await api.load()).parcels.find((p) => p.tenantPhone === DEMO_TENANT_PHONE)!
    const created = await api.registerParcel({ unitId: lease.unitId, carrier: 'DHL', trackingNo: '', location: 'locker' }, 'x')
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: FACILITIES_KEY }))
    })
    expect(await screen.findByRole('button', { name: `เปิดพัสดุ ${created.code}` })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: `พัสดุรอรับ (${waiting.length + 1})` })).toBeInTheDocument()
  })

  it('shows the labels and dates in English', async () => {
    await i18n.changeLanguage('en')
    const { waiting } = await setup()
    const p = waiting[0]
    expect(within(screen.getByRole('button', { name: `Open parcel ${p.code}` })).getByText(`Arrived ${formatDate(p.registeredAt, 'en')}`)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: `Parcels waiting (${waiting.length})` })).toBeInTheDocument()
  })
})

describe('?parcel= (from a notification)', () => {
  it('opens one of my parcels and clears the address when it is closed', async () => {
    const t = makeTestFacilities()
    const mine = (await t.facilities.load()).parcels.find((p) => p.tenantPhone === DEMO_TENANT_PHONE)!
    await setup({ route: `/tenant/parcels?parcel=${mine.id}` })
    expect(screen.getByRole('dialog', { name: `พัสดุ ${mine.code}` })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/tenant\/parcels$/)
  })

  it.each([
    ['another unit’s parcel', true],
    ['a parcel that does not exist', false],
  ])('ignores %s without breaking and clears the address', async (_name, real) => {
    const t = makeTestFacilities()
    const other = (await t.facilities.load()).parcels.find((p) => p.tenantPhone !== DEMO_TENANT_PHONE)!
    await setup({ route: `/tenant/parcels?parcel=${real ? other.id : 'ghost'}` })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/tenant\/parcels$/)
  })
})

describe('TenantParcelsPage: through the real routes', () => {
  const open = (as: 'tenant' | 'juristic' | 'technician') => renderApp('/tenant/parcels', { as, extra: <LocationProbe /> })

  it('shows the page to the tenant and marks the menu item', async () => {
    await open('tenant')
    expect(await screen.findByRole('heading', { level: 1, name: 'พัสดุของฉัน' })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'เมนูหลัก' })).getByRole('link', { name: 'พัสดุของฉัน' })).toHaveAttribute('aria-current', 'page')
    expect((await screen.findAllByRole('button', { name: /^เปิดพัสดุ / })).length).toBeGreaterThan(0)
  })

  it.each(['juristic', 'technician'] as const)('does not let the %s in: they are sent back to their own home', async (role) => {
    await open(role)
    await screen.findByRole('button', { name: 'ออกจากระบบ' })
    expect(screen.getByTestId('location')).not.toHaveTextContent('/tenant/parcels')
  })
})

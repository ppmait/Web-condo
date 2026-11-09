import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEMO_TENANT_PHONE } from '../../auth/demoAccounts'
import i18n from '../../i18n'
import { formatDate } from '../../lib/format'
import { createLocalMaintenanceApi, MAINTENANCE_KEY } from '../../maintenance/localMaintenanceApi'
import { makeMaintenanceSeed } from '../../maintenance/seed'
import type { MaintenanceRequest, MaintenanceData } from '../../maintenance/types'
import { MemoryStorage } from '../../test/memoryStorage'
import { renderMaintenance } from '../../test/renderMaintenance'
import { TEST_TODAY } from '../../test/renderProperty'
import { makeTestMaintenance } from '../../test/testMaintenance'
import type { PropertyApi } from '../../property/types'
import TenantMaintenancePage from './TenantMaintenancePage'

function LocationProbe() {
  const { pathname, search } = useLocation()
  return <span data-testid="location">{pathname + search}</span>
}

const today = () => TEST_TODAY

afterEach(async () => {
  vi.restoreAllMocks()
  await i18n.changeLanguage('th')
})

async function setup(opts: { route?: string; property?: PropertyApi; api?: ReturnType<typeof makeTestMaintenance>['maintenance'] } = {}) {
  const pair = makeTestMaintenance()
  const property = opts.property ?? pair.property
  const api = opts.api ?? (opts.property ? createLocalMaintenanceApi({ storage: null, today, property }) : pair.maintenance)
  const view = await renderMaintenance(
    <>
      <TenantMaintenancePage api={property} today={today} />
      <LocationProbe />
    </>,
    { api, property, as: 'tenant', route: opts.route ?? '/tenant/maintenance' },
  )
  const data = await api.load()
  const mine = data.requests.filter((r) => r.tenantPhone === DEMO_TENANT_PHONE).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.code.localeCompare(a.code))
  return { ...view, api, property, data, mine }
}

const card = (r: MaintenanceRequest) => screen.getByRole('button', { name: `เปิดรายการแจ้งซ่อม ${r.code}` })

describe('TenantMaintenancePage: the list', () => {
  it('shows only my requests, newest first, and none of the other tenants', async () => {
    const { data, mine } = await setup()
    expect(mine.length).toBeGreaterThanOrEqual(3)
    const shown = screen.getAllByRole('button', { name: /^เปิดรายการแจ้งซ่อม / }).map((b) => b.getAttribute('aria-label')!.replace('เปิดรายการแจ้งซ่อม ', ''))
    expect(shown).toEqual(mine.map((r) => r.code))
    for (const other of data.requests.filter((r) => r.tenantPhone !== DEMO_TENANT_PHONE)) expect(screen.queryByText(other.code)).not.toBeInTheDocument()
  })

  it('shows code, title, category, a status badge with text, and the date on each card', async () => {
    const { mine } = await setup()
    const r = mine[0]
    const c = within(card(r))
    expect(c.getByText(r.code)).toBeInTheDocument()
    expect(c.getByText(r.title)).toBeInTheDocument()
    expect(c.getByText({ electrical: 'ไฟฟ้า', plumbing: 'ประปา', airConditioning: 'เครื่องปรับอากาศ', furniture: 'เฟอร์นิเจอร์และอุปกรณ์ในห้อง', other: 'อื่น ๆ' }[r.category])).toBeInTheDocument()
    expect(c.getByText({ waiting: 'รอการมอบหมาย', assigned: 'มอบหมายแล้ว', inProgress: 'กำลังซ่อม', done: 'เสร็จสิ้น' }[r.status])).toBeInTheDocument()
    expect(c.getByText(formatDate(r.createdAt, 'th'))).toBeInTheDocument()
  })

  it('says so when I have no request yet', async () => {
    const p = makeTestMaintenance()
    const seed = makeMaintenanceSeed(await p.property.load(), TEST_TODAY)
    const gone = new Set(seed.requests.filter((r) => r.tenantPhone === DEMO_TENANT_PHONE).map((r) => r.id))
    const data: MaintenanceData = { ...seed, requests: seed.requests.filter((r) => !gone.has(r.id)), notifications: seed.notifications.filter((n) => !gone.has(n.requestId)) }
    const storage = new MemoryStorage()
    storage.setItem(MAINTENANCE_KEY, JSON.stringify(data))
    const api = createLocalMaintenanceApi({ storage, today, property: p.property })
    await setup({ api, property: p.property })
    expect(screen.getByText('ยังไม่มีรายการแจ้งซ่อม')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'แจ้งซ่อมใหม่' })).toBeInTheDocument()
  })

  it('explains instead of offering a new request when the account has no active lease', async () => {
    const p = makeTestMaintenance()
    const full = await p.property.load()
    const stub: PropertyApi = { ...p.property, load: async () => ({ ...full, leases: full.leases.filter((l) => l.tenantPhone !== DEMO_TENANT_PHONE) }) }
    await setup({ property: stub })
    expect(screen.getByText(/บัญชีนี้ยังไม่มีสัญญาเช่าที่ใช้งานอยู่ จึงแจ้งซ่อมไม่ได้/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'แจ้งซ่อมใหม่' })).not.toBeInTheDocument()
  })

  it('shows the dates in English', async () => {
    await i18n.changeLanguage('en')
    const { mine } = await setup()
    expect(within(screen.getByRole('button', { name: `Open repair request ${mine[0].code}` })).getByText(formatDate(mine[0].createdAt, 'en'))).toBeInTheDocument()
  })
})

describe('TenantMaintenancePage: a new request and the detail', () => {
  it('opens the form from the button', async () => {
    await setup()
    await userEvent.click(screen.getByRole('button', { name: 'แจ้งซ่อมใหม่' }))
    expect(screen.getByRole('dialog', { name: 'แจ้งซ่อมใหม่' })).toBeInTheDocument()
  })

  it('opens the detail of a request: facts, photos with alt text, the technician, and the timeline in order', async () => {
    const { mine, data } = await setup()
    const r = mine.find((x) => x.history.length >= 3)!
    await userEvent.click(card(r))
    const dialog = screen.getByRole('dialog', { name: `แจ้งซ่อม ${r.code}` })
    expect(within(dialog).getByText(r.description)).toBeInTheDocument()
    expect(within(dialog).getByText(r.unitCode)).toBeInTheDocument()
    expect(within(dialog).getByText(data.technicians.find((t) => t.id === r.assigneeId)!.name)).toBeInTheDocument()
    for (const p of r.photos) expect(within(dialog).getByRole('img', { name: p.name })).toBeInTheDocument()
    const steps = within(within(dialog).getByRole('list', { name: 'ความคืบหน้า' })).getAllByRole('listitem')
    expect(steps).toHaveLength(r.history.length)
    r.history.forEach((h, i) => {
      expect(steps[i]).toHaveTextContent({ waiting: 'รอการมอบหมาย', assigned: 'มอบหมายแล้ว', inProgress: 'กำลังซ่อม', done: 'เสร็จสิ้น' }[h.status])
      expect(steps[i]).toHaveTextContent(formatDate(h.at, 'th'))
      if (h.note) expect(steps[i]).toHaveTextContent(h.note)
    })
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('says nobody has been assigned yet for a waiting request', async () => {
    const { mine } = await setup()
    const r = mine.find((x) => x.status === 'waiting')!
    await userEvent.click(card(r))
    expect(within(screen.getByRole('dialog')).getByText('ยังไม่มอบหมาย')).toBeInTheDocument()
  })

  it('lets a photo be enlarged', async () => {
    const { mine } = await setup()
    await userEvent.click(card(mine[0]))
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: `ดูรูปขนาดใหญ่: ${mine[0].photos[0].name}` }))
    expect(within(dialog).getByRole('img', { name: `${mine[0].photos[0].name} (ขนาดใหญ่)` })).toBeInTheDocument()
  })
})

describe('?request= (from a notification)', () => {
  it('opens the detail of one of my requests, and clears the address when it is closed', async () => {
    const p = await (async () => {
      const t = makeTestMaintenance()
      return { ...t, mine: (await t.maintenance.load()).requests.filter((r) => r.tenantPhone === DEMO_TENANT_PHONE) }
    })()
    const target = p.mine[0]
    await setup({ route: `/tenant/maintenance?request=${target.id}` })
    expect(screen.getByRole('dialog', { name: `แจ้งซ่อม ${target.code}` })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/tenant\/maintenance$/)
  })

  it.each([
    ['somebody else', true],
    ['a request that does not exist', false],
  ])('ignores %s without breaking and clears the address', async (_name, real) => {
    const t = makeTestMaintenance()
    const other = (await t.maintenance.load()).requests.find((r) => r.tenantPhone !== DEMO_TENANT_PHONE)!
    await setup({ route: `/tenant/maintenance?request=${real ? other.id : 'ghost'}` })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/tenant\/maintenance$/)
  })
})

import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n'
import { formatDate } from '../../lib/format'
import { createLocalMaintenanceApi, MAINTENANCE_KEY } from '../../maintenance/localMaintenanceApi'
import { makeMaintenanceSeed } from '../../maintenance/seed'
import { MaintenanceError, type MaintenanceApi, type MaintenanceData, type MaintenanceRequest, type RequestStatus } from '../../maintenance/types'
import { todayISO } from '../../property/dates'
import { makeSeed } from '../../property/seed'
import { MemoryStorage } from '../../test/memoryStorage'
import { renderApp } from '../../test/renderApp'
import { renderMaintenance } from '../../test/renderMaintenance'
import { TEST_TODAY } from '../../test/renderProperty'
import { makeTestMaintenance } from '../../test/testMaintenance'
import JuristicMaintenancePage from './JuristicMaintenancePage'

function LocationProbe() {
  const { pathname, search } = useLocation()
  return <span data-testid="location">{pathname + search}</span>
}

afterEach(async () => {
  vi.restoreAllMocks()
  await i18n.changeLanguage('th')
})

const STATUS_TEXT: Record<RequestStatus, string> = { waiting: 'รอการมอบหมาย', assigned: 'มอบหมายแล้ว', inProgress: 'กำลังซ่อม', done: 'เสร็จสิ้น' }
const CARD_TEXT: Record<RequestStatus, string> = { waiting: 'รายการที่รอการมอบหมาย', assigned: 'รายการที่มอบหมายแล้ว', inProgress: 'รายการที่กำลังซ่อม', done: 'รายการที่เสร็จสิ้น' }
const STATUSES: RequestStatus[] = ['waiting', 'assigned', 'inProgress', 'done']

async function setup(opts: { api?: MaintenanceApi; route?: string } = {}) {
  const pair = makeTestMaintenance()
  const api = opts.api ?? pair.maintenance
  const view = await renderMaintenance(
    <>
      <JuristicMaintenancePage />
      <LocationProbe />
    </>,
    { api, property: pair.property, as: 'juristic', route: opts.route ?? '/juristic/maintenance' },
  )
  const data = await api.load()
  return { ...view, api, data }
}

const rowOf = (code: string) => screen.getByText(code).closest('tr') as HTMLElement
const dataRows = () => screen.getAllByRole('row').slice(1)
const byStatus = (data: MaintenanceData, status: RequestStatus) => data.requests.find((r) => r.status === status)!

async function openDetail(r: MaintenanceRequest) {
  await userEvent.click(within(rowOf(r.code)).getByRole('button', { name: `ดูรายละเอียด ${r.code}` }))
  return screen.getByRole('dialog', { name: `แจ้งซ่อม ${r.code}` })
}

describe('JuristicMaintenancePage: the overview', () => {
  it('counts the requests of each status on four cards', async () => {
    const { data } = await setup()
    for (const s of STATUSES) {
      const card = screen.getByText(CARD_TEXT[s]).closest('div') as HTMLElement
      expect(within(card).getByText(String(data.requests.filter((r) => r.status === s).length))).toBeInTheDocument()
    }
  })

  it('lists every request with unit, tenant, category, title, technician, a status badge and the date', async () => {
    const { data } = await setup()
    expect(dataRows()).toHaveLength(data.requests.length)
    for (const r of data.requests) {
      const row = within(rowOf(r.code))
      expect(row.getByText(r.unitCode)).toBeInTheDocument()
      expect(row.getByText(r.tenantName)).toBeInTheDocument()
      expect(row.getByText(r.title)).toBeInTheDocument()
      expect(row.getByText(STATUS_TEXT[r.status])).toBeInTheDocument()
      expect(row.getByText(formatDate(r.createdAt, 'th'))).toBeInTheDocument()
      const tech = data.technicians.find((t) => t.id === r.assigneeId)
      if (tech) expect(row.getByText(tech.name)).toBeInTheDocument()
    }
    const box = screen.getAllByRole('table')[0].parentElement
    expect(box).toHaveClass('overflow-x-auto', 'relative')
  })

  it.each(STATUSES)('filters by %s', async (s) => {
    const { data } = await setup()
    await userEvent.selectOptions(screen.getByLabelText('สถานะ'), STATUS_TEXT[s])
    const want = data.requests.filter((r) => r.status === s)
    expect(want.length).toBeGreaterThan(0)
    expect(dataRows()).toHaveLength(want.length)
    for (const r of want) expect(rowOf(r.code)).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('สถานะ'), 'ทั้งหมด')
    expect(dataRows()).toHaveLength(data.requests.length)
  })

  it('says nothing matches when the filter leaves no request, and when there is no request at all', async () => {
    const p = makeTestMaintenance()
    const seed = makeMaintenanceSeed(await p.property.load(), TEST_TODAY)
    const gone = new Set(seed.requests.filter((r) => r.status === 'done').map((r) => r.id))
    const cut: MaintenanceData = { ...seed, requests: seed.requests.filter((r) => !gone.has(r.id)), notifications: seed.notifications.filter((n) => !gone.has(n.requestId)) }
    const storage = new MemoryStorage()
    storage.setItem(MAINTENANCE_KEY, JSON.stringify(cut))
    await setup({ api: createLocalMaintenanceApi({ storage, today: () => TEST_TODAY, property: p.property }) })
    await userEvent.selectOptions(screen.getByLabelText('สถานะ'), STATUS_TEXT.done)
    expect(screen.getByText('ไม่มีรายการตามตัวกรองนี้')).toBeInTheDocument()
  })

  it('shows the labels and dates in English', async () => {
    await i18n.changeLanguage('en')
    const { data } = await setup()
    expect(screen.getByLabelText('Status')).toBeInTheDocument()
    expect(within(rowOf(data.requests[0].code)).getByText(formatDate(data.requests[0].createdAt, 'en'))).toBeInTheDocument()
  })

  it('opens the detail with photos and the timeline', async () => {
    const { data } = await setup()
    const r = data.requests.find((x) => x.history.length >= 3)!
    const dialog = await openDetail(r)
    for (const p of r.photos) expect(within(dialog).getByRole('img', { name: p.name })).toBeInTheDocument()
    expect(within(within(dialog).getByRole('list', { name: 'ความคืบหน้า' })).getAllByRole('listitem')).toHaveLength(r.history.length)
  })
})

describe('JuristicMaintenancePage: assigning a technician', () => {
  const assignDialog = (code: string) => screen.getByRole('dialog', { name: `มอบหมายงาน ${code}` })

  it('assigns a waiting request after asking, and the table, the technician and the tenant all hear about it', async () => {
    const user = userEvent.setup()
    const { api, data } = await setup()
    const r = byStatus(data, 'waiting')
    const t = data.technicians[1]
    const assign = vi.spyOn(api, 'assign')
    const detail = await openDetail(r)
    await user.click(within(detail).getByRole('button', { name: 'มอบหมายช่าง' }))
    const dialog = assignDialog(r.code)
    expect(assign).not.toHaveBeenCalled()
    await user.selectOptions(within(dialog).getByLabelText('ช่างที่รับงาน'), t.name)
    await user.click(within(dialog).getByRole('button', { name: 'มอบหมาย' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: `มอบหมายงาน ${r.code}` })).not.toBeInTheDocument())
    expect(assign).toHaveBeenCalledTimes(1)
    expect(assign).toHaveBeenCalledWith(r.id, t.id, 'สมหญิง นิติบุคคล')
    await user.keyboard('{Escape}')
    expect(within(rowOf(r.code)).getByText(STATUS_TEXT.assigned)).toBeInTheDocument()
    expect(within(rowOf(r.code)).getByText(t.name)).toBeInTheDocument()
    const added = (await api.load()).notifications.slice(data.notifications.length)
    expect(added.map((n) => [n.type, n.recipient])).toEqual([['assigned', t.phone], ['statusChanged', r.tenantPhone]])
  })

  it('needs a technician chosen: message, focus, no api call', async () => {
    const user = userEvent.setup()
    const { api, data } = await setup()
    const r = byStatus(data, 'waiting')
    const assign = vi.spyOn(api, 'assign')
    await user.click(within(await openDetail(r)).getByRole('button', { name: 'มอบหมายช่าง' }))
    await user.click(within(assignDialog(r.code)).getByRole('button', { name: 'มอบหมาย' }))
    expect(assign).not.toHaveBeenCalled()
    const field = within(assignDialog(r.code)).getByLabelText('ช่างที่รับงาน')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveFocus()
    expect(within(assignDialog(r.code)).getByText('กรุณาเลือกช่าง')).toBeInTheDocument()
  })

  it('lets the technician of an assigned request be changed', async () => {
    const user = userEvent.setup()
    const { api, data } = await setup()
    const r = data.requests.find((x) => x.status === 'assigned')!
    const other = data.technicians.find((t) => t.id !== r.assigneeId)!
    await user.click(within(await openDetail(r)).getByRole('button', { name: 'เปลี่ยนช่าง' }))
    await user.selectOptions(within(assignDialog(r.code)).getByLabelText('ช่างที่รับงาน'), other.name)
    await user.click(within(assignDialog(r.code)).getByRole('button', { name: 'มอบหมาย' }))
    await waitFor(async () => expect((await api.load()).requests.find((x) => x.id === r.id)!.assigneeId).toBe(other.id))
  })

  it('opens the detail and the assignment dialog of the same request without React warning about duplicate keys', async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { data } = await setup()
    const r = byStatus(data, 'waiting')
    await user.click(within(await openDetail(r)).getByRole('button', { name: 'มอบหมายช่าง' }))
    expect(assignDialog(r.code)).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })

  it.each(['inProgress', 'done'] as const)('offers no assignment for a %s request', async (status) => {
    const { data } = await setup()
    const detail = await openDetail(byStatus(data, status))
    expect(within(detail).queryByRole('button', { name: /มอบหมายช่าง|เปลี่ยนช่าง/ })).not.toBeInTheDocument()
  })

  it('calls the api once when the confirmation is pressed twice, and disables the button meanwhile', async () => {
    const user = userEvent.setup()
    const { api, data } = await setup()
    const r = byStatus(data, 'waiting')
    const original = api.assign.bind(api)
    let release!: () => void
    const assign = vi.spyOn(api, 'assign').mockImplementation((a, b, c) => new Promise((resolve) => (release = () => resolve(original(a, b, c)))))
    await user.click(within(await openDetail(r)).getByRole('button', { name: 'มอบหมายช่าง' }))
    await user.selectOptions(within(assignDialog(r.code)).getByLabelText('ช่างที่รับงาน'), data.technicians[0].name)
    const confirm = within(assignDialog(r.code)).getByRole('button', { name: 'มอบหมาย' })
    await user.click(confirm)
    await user.click(confirm)
    expect(assign).toHaveBeenCalledTimes(1)
    expect(confirm).toBeDisabled()
    release()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: `มอบหมายงาน ${r.code}` })).not.toBeInTheDocument())
  })

  it('says so and shows the new state when the request moved on in another tab', async () => {
    const user = userEvent.setup()
    const { api, data } = await setup()
    const r = byStatus(data, 'waiting')
    const t = data.technicians[0]
    await user.click(within(await openDetail(r)).getByRole('button', { name: 'มอบหมายช่าง' }))
    await user.selectOptions(within(assignDialog(r.code)).getByLabelText('ช่างที่รับงาน'), data.technicians[1].name)
    await api.assign(r.id, t.id, 'อีกแท็บ') // another tab
    await api.updateStatus(r.id, 'inProgress', '', { phone: t.phone, name: t.name })
    await user.click(within(assignDialog(r.code)).getByRole('button', { name: 'มอบหมาย' }))
    expect(await within(assignDialog(r.code)).findByText(/สถานะของรายการนี้เปลี่ยนไปแล้ว/)).toBeInTheDocument()
    await waitFor(() => expect(within(rowOf(r.code)).getByText(STATUS_TEXT.inProgress)).toBeInTheDocument())
    expect((await api.load()).requests.find((x) => x.id === r.id)!.assigneeId).toBe(t.id)
  })

  it('shows a general message for an unexpected failure', async () => {
    const user = userEvent.setup()
    const { api, data } = await setup()
    const r = byStatus(data, 'waiting')
    vi.spyOn(api, 'assign').mockRejectedValueOnce(new MaintenanceError('storage_failed'))
    await user.click(within(await openDetail(r)).getByRole('button', { name: 'มอบหมายช่าง' }))
    await user.selectOptions(within(assignDialog(r.code)).getByLabelText('ช่างที่รับงาน'), data.technicians[0].name)
    await user.click(within(assignDialog(r.code)).getByRole('button', { name: 'มอบหมาย' }))
    expect(await within(assignDialog(r.code)).findByText('ดำเนินการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')).toBeInTheDocument()
  })
})

describe('JuristicMaintenancePage: the address', () => {
  it('opens a request from ?request= and clears the address when it is closed', async () => {
    const { data } = await setup({ route: '/juristic/maintenance?request=mr-3' })
    expect(screen.getByRole('dialog', { name: `แจ้งซ่อม ${data.requests.find((r) => r.id === 'mr-3')!.code}` })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/juristic\/maintenance$/)
  })

  it('ignores a request that does not exist without breaking, and clears the address', async () => {
    await setup({ route: '/juristic/maintenance?request=ghost' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/juristic\/maintenance$/)
  })
})

describe('JuristicMaintenancePage: through the real routes', () => {
  const today = todayISO()
  const open = (as: 'juristic' | 'tenant' | 'technician') => renderApp('/juristic/maintenance', { as, extra: <LocationProbe /> })

  it('shows the page to the juristic office with the counts of the sample data, and marks the menu item', async () => {
    await open('juristic')
    const expected = makeMaintenanceSeed(makeSeed(today), today)
    expect(await screen.findByRole('heading', { level: 1, name: 'แจ้งซ่อมและติดตาม' })).toBeInTheDocument()
    const card = screen.getByText(CARD_TEXT.waiting).closest('div') as HTMLElement
    expect(within(card).getByText(String(expected.requests.filter((r) => r.status === 'waiting').length))).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'เมนูหลัก' })).getByRole('link', { name: 'แจ้งซ่อมและติดตาม' })).toHaveAttribute('aria-current', 'page')
  })

  it.each(['tenant', 'technician'] as const)('does not let the %s in: they are sent back to their own home', async (role) => {
    await open(role)
    await screen.findByRole('button', { name: 'ออกจากระบบ' })
    expect(screen.getByTestId('location')).not.toHaveTextContent('/juristic/maintenance')
  })
})


import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEMO_TECH_PHONE } from '../../auth/demoAccounts'
import i18n from '../../i18n'
import type { MaintenanceApi, MaintenanceData, MaintenanceRequest, RequestStatus } from '../../maintenance/types'
import { renderApp } from '../../test/renderApp'
import { renderMaintenance } from '../../test/renderMaintenance'
import { makeTestMaintenance } from '../../test/testMaintenance'
import TechnicianJobsPage from './TechnicianJobsPage'

function LocationProbe() {
  const { pathname, search } = useLocation()
  return <span data-testid="location">{pathname + search}</span>
}

afterEach(async () => {
  vi.restoreAllMocks()
  await i18n.changeLanguage('th')
})

const STATUS_TEXT: Record<RequestStatus, string> = { waiting: 'รอการมอบหมาย', assigned: 'มอบหมายแล้ว', inProgress: 'กำลังซ่อม', done: 'เสร็จสิ้น' }
const ACTOR = { phone: DEMO_TECH_PHONE, name: 'สมศักดิ์ ช่างซ่อม' }

async function setup(opts: { api?: MaintenanceApi; route?: string } = {}) {
  const pair = makeTestMaintenance()
  const api = opts.api ?? pair.maintenance
  const view = await renderMaintenance(
    <>
      <TechnicianJobsPage />
      <LocationProbe />
    </>,
    { api, property: pair.property, as: 'technician', route: opts.route ?? '/technician/jobs' },
  )
  const data = await api.load()
  const me = data.technicians.find((t) => t.phone === DEMO_TECH_PHONE)!
  const mine = data.requests.filter((r) => r.assigneeId === me?.id)
  return { ...view, api, data, me, mine }
}

const card = (r: MaintenanceRequest) => screen.getByRole('button', { name: `เปิดงาน ${r.code}` })
const jobCards = () => screen.getAllByRole('button', { name: /^เปิดงาน / })
const first = (mine: MaintenanceRequest[], status: RequestStatus) => mine.find((r) => r.status === status)!
const updateDialog = (r: MaintenanceRequest) => screen.getByRole('dialog', { name: `อัปเดตงาน ${r.code}` })

async function openJob(r: MaintenanceRequest) {
  await userEvent.click(card(r))
  return screen.getByRole('dialog', { name: `แจ้งซ่อม ${r.code}` })
}

describe('TechnicianJobsPage: the list', () => {
  it('shows only the jobs assigned to me, unfinished ones first, then the newest first', async () => {
    const { mine, data } = await setup()
    expect(mine.length).toBeGreaterThanOrEqual(3)
    expect(data.requests.length).toBeGreaterThan(mine.length)
    const expected = [...mine].sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || b.createdAt.localeCompare(a.createdAt) || b.code.localeCompare(a.code)).map((r) => r.code)
    expect(jobCards().map((b) => b.getAttribute('aria-label')!.replace('เปิดงาน ', ''))).toEqual(expected)
    for (const other of data.requests.filter((r) => !mine.includes(r))) expect(screen.queryByText(other.code)).not.toBeInTheDocument()
  })

  it('shows code, title, unit, category and a status badge with text on each card', async () => {
    const { mine } = await setup()
    const r = mine[0]
    const c = within(card(r))
    expect(c.getByText(r.code)).toBeInTheDocument()
    expect(c.getByText(r.title)).toBeInTheDocument()
    expect(c.getByText(r.unitCode)).toBeInTheDocument()
    expect(c.getByText(STATUS_TEXT[r.status])).toBeInTheDocument()
  })

  it('says there are no jobs when this user matches no technician', async () => {
    const pair = makeTestMaintenance()
    const data = await pair.maintenance.load()
    const api: MaintenanceApi = { ...pair.maintenance, load: async () => ({ ...data, technicians: data.technicians.map((t) => ({ ...t, phone: '0899999999' })) }) as MaintenanceData }
    await setup({ api })
    expect(screen.getByText('ยังไม่มีงานที่ได้รับมอบหมาย')).toBeInTheDocument()
  })

  it('shows the labels in English', async () => {
    await i18n.changeLanguage('en')
    const { mine } = await setup()
    expect(screen.getByRole('button', { name: `Open job ${mine[0].code}` })).toBeInTheDocument()
  })
})

describe('TechnicianJobsPage: updating a job', () => {
  it('lets an assigned job be started: one button, a note, history and a notice to the tenant', async () => {
    const user = userEvent.setup()
    const { api, mine, data } = await setup()
    const r = first(mine, 'assigned')
    const update = vi.spyOn(api, 'updateStatus')
    const detail = await openJob(r)
    expect(within(detail).queryByRole('button', { name: 'ซ่อมเสร็จ' })).not.toBeInTheDocument()
    await user.click(within(detail).getByRole('button', { name: 'เริ่มซ่อม' }))
    const dialog = updateDialog(r)
    expect(update).not.toHaveBeenCalled()
    await user.type(within(dialog).getByLabelText(/หมายเหตุ/), '  ไปดูหน้างานแล้ว  ')
    await user.click(within(dialog).getByRole('button', { name: 'เริ่มซ่อม' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: `อัปเดตงาน ${r.code}` })).not.toBeInTheDocument())
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith(r.id, 'inProgress', '  ไปดูหน้างานแล้ว  ', ACTOR)
    const after = (await api.load()).requests.find((x) => x.id === r.id)!
    expect(after.status).toBe('inProgress')
    expect(after.history.at(-1)).toMatchObject({ status: 'inProgress', note: 'ไปดูหน้างานแล้ว', byName: ACTOR.name })
    const added = (await api.load()).notifications.slice(data.notifications.length)
    expect(added).toEqual([expect.objectContaining({ type: 'statusChanged', recipient: r.tenantPhone, status: 'inProgress' })])
    await user.keyboard('{Escape}')
    expect(within(card(r)).getByText(STATUS_TEXT.inProgress)).toBeInTheDocument()
  })

  it('lets an in-progress job be finished, with no note needed', async () => {
    const user = userEvent.setup()
    const { api, mine } = await setup()
    const r = first(mine, 'inProgress')
    const detail = await openJob(r)
    expect(within(detail).queryByRole('button', { name: 'เริ่มซ่อม' })).not.toBeInTheDocument()
    await user.click(within(detail).getByRole('button', { name: 'ซ่อมเสร็จ' }))
    await user.click(within(updateDialog(r)).getByRole('button', { name: 'ซ่อมเสร็จ' }))
    await waitFor(async () => expect((await api.load()).requests.find((x) => x.id === r.id)!.status).toBe('done'))
  })

  it('offers no button for a finished job', async () => {
    const { mine } = await setup()
    const detail = await openJob(first(mine, 'done'))
    expect(within(detail).queryByRole('button', { name: /เริ่มซ่อม|ซ่อมเสร็จ/ })).not.toBeInTheDocument()
  })

  it('takes a note of exactly 300 characters and refuses 301: message, focus, no api call', async () => {
    const user = userEvent.setup()
    const { api, mine } = await setup()
    const r = first(mine, 'assigned')
    const update = vi.spyOn(api, 'updateStatus')
    await user.click(within(await openJob(r)).getByRole('button', { name: 'เริ่มซ่อม' }))
    const dialog = updateDialog(r)
    const note = within(dialog).getByLabelText(/หมายเหตุ/)
    await user.click(note)
    await user.paste('x'.repeat(301))
    await user.click(within(dialog).getByRole('button', { name: 'เริ่มซ่อม' }))
    expect(update).not.toHaveBeenCalled()
    expect(note).toHaveAttribute('aria-invalid', 'true')
    expect(note).toHaveFocus()
    expect(within(dialog).getByText('หมายเหตุต้องไม่เกิน 300 ตัวอักษร')).toBeInTheDocument()
    await user.clear(note)
    await user.click(note)
    await user.paste('x'.repeat(300))
    await user.click(within(dialog).getByRole('button', { name: 'เริ่มซ่อม' }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
  })

  it('calls the api once when the confirmation is pressed twice, and disables the button meanwhile', async () => {
    const user = userEvent.setup()
    const { api, mine } = await setup()
    const r = first(mine, 'assigned')
    const original = api.updateStatus.bind(api)
    let release!: () => void
    const update = vi.spyOn(api, 'updateStatus').mockImplementation((a, b, c, d) => new Promise((resolve) => (release = () => resolve(original(a, b, c, d)))))
    await user.click(within(await openJob(r)).getByRole('button', { name: 'เริ่มซ่อม' }))
    const confirm = within(updateDialog(r)).getByRole('button', { name: 'เริ่มซ่อม' })
    await user.click(confirm)
    await user.click(confirm)
    expect(update).toHaveBeenCalledTimes(1)
    expect(confirm).toBeDisabled()
    release()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: `อัปเดตงาน ${r.code}` })).not.toBeInTheDocument())
  })

  it('says so and shows the new state when the job was updated in another tab', async () => {
    const user = userEvent.setup()
    const { api, mine } = await setup()
    const r = first(mine, 'assigned')
    await user.click(within(await openJob(r)).getByRole('button', { name: 'เริ่มซ่อม' }))
    await api.updateStatus(r.id, 'inProgress', '', ACTOR) // another tab
    await user.click(within(updateDialog(r)).getByRole('button', { name: 'เริ่มซ่อม' }))
    expect(await within(updateDialog(r)).findByText(/งานนี้ถูกอัปเดตไปแล้ว/)).toBeInTheDocument()
    await waitFor(() => expect(within(card(r)).getByText(STATUS_TEXT.inProgress)).toBeInTheDocument())
    expect((await api.load()).requests.find((x) => x.id === r.id)!.history.filter((h) => h.status === 'inProgress')).toHaveLength(1)
  })

  it('shows a general message for an unexpected failure and stays open', async () => {
    const user = userEvent.setup()
    const { api, mine } = await setup()
    const r = first(mine, 'assigned')
    vi.spyOn(api, 'updateStatus').mockRejectedValueOnce(new Error('boom'))
    await user.click(within(await openJob(r)).getByRole('button', { name: 'เริ่มซ่อม' }))
    await user.click(within(updateDialog(r)).getByRole('button', { name: 'เริ่มซ่อม' }))
    expect(await within(updateDialog(r)).findByText('ดำเนินการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')).toBeInTheDocument()
  })
})

describe('TechnicianJobsPage: the address', () => {
  it('opens one of my jobs from ?request= and clears the address when it is closed', async () => {
    const pair = makeTestMaintenance()
    const data = await pair.maintenance.load()
    const me = data.technicians.find((t) => t.phone === DEMO_TECH_PHONE)!
    const mine = data.requests.find((r) => r.assigneeId === me.id)!
    await setup({ route: `/technician/jobs?request=${mine.id}` })
    expect(screen.getByRole('dialog', { name: `แจ้งซ่อม ${mine.code}` })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/technician\/jobs$/)
  })

  it.each([
    ['another technician’s job', true],
    ['a request that does not exist', false],
  ])('ignores %s without breaking and clears the address', async (_name, real) => {
    const pair = makeTestMaintenance()
    const data = await pair.maintenance.load()
    const me = data.technicians.find((t) => t.phone === DEMO_TECH_PHONE)!
    const other = data.requests.find((r) => r.assigneeId && r.assigneeId !== me.id)!
    await setup({ route: `/technician/jobs?request=${real ? other.id : 'ghost'}` })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/technician\/jobs$/)
  })
})

describe('TechnicianJobsPage: through the real routes', () => {
  const open = (as: 'technician' | 'tenant' | 'juristic') => renderApp('/technician/jobs', { as, extra: <LocationProbe /> })

  it('shows the page to the technician and marks the menu item', async () => {
    await open('technician')
    expect(await screen.findByRole('heading', { level: 1, name: 'งานของฉัน' })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'เมนูหลัก' })).getByRole('link', { name: 'งานของฉัน' })).toHaveAttribute('aria-current', 'page')
    expect((await screen.findAllByRole('button', { name: /^เปิดงาน / })).length).toBeGreaterThan(0)
  })

  it.each(['tenant', 'juristic'] as const)('does not let the %s in: they are sent back to their own home', async (role) => {
    await open(role)
    await screen.findByRole('button', { name: 'ออกจากระบบ' })
    expect(screen.getByTestId('location')).not.toHaveTextContent('/technician/jobs')
  })
})

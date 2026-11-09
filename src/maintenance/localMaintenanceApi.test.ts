import { describe, expect, it } from 'vitest'
import { DEMO_TECH_PHONE, DEMO_TENANT_PHONE } from '../auth/demoAccounts'
import { createLocalPropertyApi } from '../property/localPropertyApi'
import { makeSeed as makePropertySeed } from '../property/seed'
import type { PropertyApi, PropertyData } from '../property/types'
import { MemoryStorage, UnreadableStorage, UnwritableStorage } from '../test/memoryStorage'
import { MAINTENANCE_KEY, createLocalMaintenanceApi } from './localMaintenanceApi'
import { makeMaintenanceSeed } from './seed'
import { MaintenanceError, type Actor, type CreateRequestInput, type MaintenanceApi, type MaintenanceData, type MaintenanceRequest } from './types'

const TODAY = '2026-11-08'
const photo = (name = 'a.jpg') => ({ name, dataUrl: 'data:image/jpeg;base64,AAAA' })

const makeProperty = (): PropertyApi => createLocalPropertyApi({ storage: null, today: () => TODAY })
const make = (storage: Storage | null = new MemoryStorage(), property: PropertyApi = makeProperty()): MaintenanceApi =>
  createLocalMaintenanceApi({ storage, today: () => TODAY, property })

const failure = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e as MaintenanceError
  }
  return null
}

const propertyData = (): PropertyData => makePropertySeed(TODAY)
const seeded = (): MaintenanceData => makeMaintenanceSeed(propertyData(), TODAY)
const tech = (data: MaintenanceData, phone = DEMO_TECH_PHONE) => data.technicians.find((t) => t.phone === phone)!
const actor = (name = 'สมศักดิ์ ช่างซ่อม', phone = DEMO_TECH_PHONE): Actor => ({ phone, name })
const input = (over: Partial<CreateRequestInput> = {}): CreateRequestInput => ({
  category: 'plumbing',
  title: 'ก๊อกน้ำรั่ว',
  description: 'น้ำหยดตลอดเวลา',
  photos: [photo()],
  tenantPhone: DEMO_TENANT_PHONE,
  tenantName: 'สมชาย ผู้เช่า',
  ...over,
})
const byStatus = (data: MaintenanceData, status: string, phone?: string) =>
  data.requests.find((r) => r.status === status && (!phone || data.technicians.find((t) => t.id === r.assigneeId)?.phone === phone))!

class FullStorage extends MemoryStorage {
  full = false
  setItem(key: string, value: string) {
    if (this.full) throw new Error('QuotaExceededError')
    super.setItem(key, value)
  }
}

describe('seeding and persistence', () => {
  it('seeds sample data into an empty storage', async () => {
    const storage = new MemoryStorage()
    expect(await make(storage).load()).toEqual(seeded())
    expect(JSON.parse(storage.getItem(MAINTENANCE_KEY) as string)).toEqual(seeded())
  })

  it('returns a copy: changing the result does not change the stored data', async () => {
    const api = make()
    const first = await api.load()
    first.requests.length = 0
    expect((await api.load()).requests.length).toBeGreaterThan(0)
  })

  it('sees what another tab wrote, because it reads storage on every call', async () => {
    const storage = new MemoryStorage()
    const property = makeProperty()
    const [a, b] = [make(storage, property), make(storage, property)]
    await a.load()
    const created = await b.createRequest(input())
    expect((await a.load()).requests.some((r) => r.id === created.id)).toBe(true)
  })
})

describe('createRequest', () => {
  it('creates a waiting request with the next code, a snapshot of the unit and tenant, and one history entry', async () => {
    const api = make()
    const before = await api.load()
    const created = await api.createRequest(input({ title: '  ก๊อกน้ำรั่ว  ' }))
    expect(created.code).toBe(`MR-${String(before.requests.length + 1).padStart(4, '0')}`)
    expect(created).toMatchObject({ status: 'waiting', title: 'ก๊อกน้ำรั่ว', unitCode: 'A-1204', tenantPhone: DEMO_TENANT_PHONE, tenantName: 'คุณอลิสา ชัยวงศ์', createdAt: TODAY })
    expect(created.assigneeId).toBeUndefined()
    expect(created.history).toEqual([{ status: 'waiting', at: TODAY, note: '', byName: 'สมชาย ผู้เช่า' }])
    expect((await api.load()).requests.find((r) => r.id === created.id)).toEqual(created)
  })

  it('tells the juristic office, and only once', async () => {
    const api = make()
    const before = await api.load()
    const created = await api.createRequest(input())
    const added = (await api.load()).notifications.slice(before.notifications.length)
    expect(added).toEqual([expect.objectContaining({ type: 'requestCreated', requestId: created.id, recipient: 'role:juristic', read: false })])
  })

  it('refuses incomplete input with the field messages and creates nothing', async () => {
    const api = make()
    const before = await api.load()
    const e = await failure(api.createRequest(input({ title: '', photos: [] })))
    expect(e?.code).toBe('invalid_input')
    expect(e?.fieldErrors).toMatchObject({ title: 'maintenance.errors.title', photos: 'maintenance.errors.photos' })
    expect(await api.load()).toEqual(before)
  })

  it('refuses a tenant without an active lease: none at all, expired, cancelled or not started yet', async () => {
    const api = make()
    const p = propertyData()
    const activePhones = new Set(p.leases.filter((l) => !l.cancelledAt && l.startDate <= TODAY && TODAY <= l.endDate).map((l) => l.tenantPhone))
    const cases = [
      '0899999999',
      p.leases.find((l) => !l.cancelledAt && l.endDate < TODAY)?.tenantPhone,
      p.leases.find((l) => l.cancelledAt)?.tenantPhone,
      p.leases.find((l) => !l.cancelledAt && l.startDate > TODAY)?.tenantPhone,
    ]
    const without = cases.filter((phone): phone is string => phone !== undefined && !activePhones.has(phone))
    expect(without.length).toBeGreaterThanOrEqual(2)
    for (const phone of without) expect((await failure(api.createRequest(input({ tenantPhone: phone }))))?.code).toBe('no_lease')
  })

  it('gives two tabs pressing the button at the same moment different codes', async () => {
    const storage = new MemoryStorage()
    const property = makeProperty()
    const [a, b] = [make(storage, property), make(storage, property)]
    await a.load()
    const [x, y] = await Promise.all([a.createRequest(input({ title: 'จากแท็บ A' })), b.createRequest(input({ title: 'จากแท็บ B' }))])
    expect(x.code).not.toBe(y.code)
    const data = await a.load()
    expect(new Set(data.requests.map((r) => r.code)).size).toBe(data.requests.length)
    expect(data.requests.filter((r) => r.id === x.id || r.id === y.id)).toHaveLength(2)
  })
})

describe('a full storage', () => {
  it('refuses to create a request, says so, and keeps all the data it had', async () => {
    const storage = new FullStorage()
    const api = make(storage)
    const before = await api.load()
    storage.full = true
    expect((await failure(api.createRequest(input())))?.code).toBe('storage_failed')
    storage.full = false
    expect(await api.load()).toEqual(before)
    expect((await api.createRequest(input())).code).toBe(`MR-${String(before.requests.length + 1).padStart(4, '0')}`)
  })

  it('refuses too when the storage could not be written from the start (nothing is kept only in memory)', async () => {
    const api = make(new UnwritableStorage())
    const before = await api.load()
    expect((await failure(api.createRequest(input())))?.code).toBe('storage_failed')
    expect(await api.load()).toEqual(before)
  })
})

describe('assign', () => {
  it('assigns a waiting request: assigned status, history, a notice to the technician and one to the tenant', async () => {
    const api = make()
    const data = await api.load()
    const target = byStatus(data, 'waiting')
    const t = tech(data)
    const updated = await api.assign(target.id, t.id, 'สมหญิง นิติบุคคล')
    expect(updated).toMatchObject({ status: 'assigned', assigneeId: t.id })
    expect(updated.history.at(-1)).toEqual({ status: 'assigned', at: TODAY, note: '', byName: 'สมหญิง นิติบุคคล' })
    const added = (await api.load()).notifications.slice(data.notifications.length)
    expect(added).toEqual([
      expect.objectContaining({ type: 'assigned', requestId: target.id, recipient: t.phone, read: false }),
      expect.objectContaining({ type: 'statusChanged', requestId: target.id, recipient: target.tenantPhone, status: 'assigned', read: false }),
    ])
  })

  it('lets the technician be changed while assigned, telling only the new technician', async () => {
    const api = make()
    const data = await api.load()
    const target = byStatus(data, 'assigned', DEMO_TECH_PHONE)
    const other = data.technicians.find((t) => t.phone !== DEMO_TECH_PHONE)!
    const updated = await api.assign(target.id, other.id, 'สมหญิง นิติบุคคล')
    expect(updated.assigneeId).toBe(other.id)
    expect(updated.status).toBe('assigned')
    const added = (await api.load()).notifications.slice(data.notifications.length)
    expect(added).toEqual([expect.objectContaining({ type: 'assigned', recipient: other.phone })])
  })

  it('does nothing, and does not notify again, when the same technician is assigned again', async () => {
    const api = make()
    const data = await api.load()
    const target = byStatus(data, 'assigned', DEMO_TECH_PHONE)
    await api.assign(target.id, target.assigneeId!, 'สมหญิง นิติบุคคล')
    expect(await api.load()).toEqual(data)
  })

  it.each(['inProgress', 'done'])('refuses to change the technician of a %s job', async (status) => {
    const api = make()
    const data = await api.load()
    const target = byStatus(data, status)
    const other = data.technicians.find((t) => t.id !== target.assigneeId)!
    expect((await failure(api.assign(target.id, other.id, 'x')))?.code).toBe('invalid_transition')
    expect(await api.load()).toEqual(data)
  })

  it('refuses a request or technician that does not exist', async () => {
    const api = make()
    const data = await api.load()
    expect((await failure(api.assign('ghost', data.technicians[0].id, 'x')))?.code).toBe('not_found')
    expect((await failure(api.assign(byStatus(data, 'waiting').id, 'ghost', 'x')))?.code).toBe('not_found')
  })
})

describe('updateStatus', () => {
  it('moves an assigned job to inProgress, then to done, with trimmed notes, history and notices to the tenant', async () => {
    const api = make()
    const data = await api.load()
    const target = byStatus(data, 'assigned', DEMO_TECH_PHONE)
    const started = await api.updateStatus(target.id, 'inProgress', '  เริ่มงานแล้ว  ', actor())
    expect(started.status).toBe('inProgress')
    expect(started.history.at(-1)).toEqual({ status: 'inProgress', at: TODAY, note: 'เริ่มงานแล้ว', byName: 'สมศักดิ์ ช่างซ่อม' })
    const done = await api.updateStatus(target.id, 'done', '', actor())
    expect(done.status).toBe('done')
    const added = (await api.load()).notifications.slice(data.notifications.length)
    expect(added).toEqual([
      expect.objectContaining({ type: 'statusChanged', recipient: target.tenantPhone, status: 'inProgress' }),
      expect.objectContaining({ type: 'statusChanged', recipient: target.tenantPhone, status: 'done' }),
    ])
  })

  it('refuses a technician who is not the one assigned', async () => {
    const api = make()
    const data = await api.load()
    const target = byStatus(data, 'assigned', DEMO_TECH_PHONE)
    const other = data.technicians.find((t) => t.phone !== DEMO_TECH_PHONE)!
    expect((await failure(api.updateStatus(target.id, 'inProgress', '', actor(other.name, other.phone))))?.code).toBe('not_assigned')
    expect((await failure(api.updateStatus(target.id, 'inProgress', '', actor('ใครสักคน', '0899999999'))))?.code).toBe('not_assigned')
    expect((await failure(api.updateStatus(byStatus(data, 'waiting').id, 'assigned', '', actor())))?.code).toBe('not_assigned')
    expect(await api.load()).toEqual(data)
  })

  it('refuses skipping a step, going back, repeating or going past the end', async () => {
    const api = make()
    const data = await api.load()
    const assigned = byStatus(data, 'assigned', DEMO_TECH_PHONE)
    const inProgress = byStatus(data, 'inProgress', DEMO_TECH_PHONE)
    expect((await failure(api.updateStatus(assigned.id, 'done', '', actor())))?.code).toBe('invalid_transition')
    expect((await failure(api.updateStatus(assigned.id, 'waiting', '', actor())))?.code).toBe('invalid_transition')
    expect((await failure(api.updateStatus(inProgress.id, 'assigned', '', actor())))?.code).toBe('invalid_transition')
    expect((await failure(api.updateStatus(inProgress.id, 'inProgress', '', actor())))?.code).toBe('invalid_transition')
    const finished = data.requests.find((r) => r.status === 'done' && tech(data).id === r.assigneeId)!
    expect((await failure(api.updateStatus(finished.id, 'done', '', actor())))?.code).toBe('invalid_transition')
    expect(await api.load()).toEqual(data)
  })

  it('refuses a note over 300 characters, but takes exactly 300', async () => {
    const api = make()
    const data = await api.load()
    const target = byStatus(data, 'assigned', DEMO_TECH_PHONE)
    const e = await failure(api.updateStatus(target.id, 'inProgress', 'x'.repeat(301), actor()))
    expect(e?.code).toBe('invalid_input')
    expect(e?.fieldErrors?.note).toBe('maintenance.errors.note')
    expect((await api.updateStatus(target.id, 'inProgress', 'x'.repeat(300), actor())).status).toBe('inProgress')
  })

  it('does not apply one status change twice when two tabs press at once', async () => {
    const storage = new MemoryStorage()
    const property = makeProperty()
    const [a, b] = [make(storage, property), make(storage, property)]
    const data = await a.load()
    const target = byStatus(data, 'assigned', DEMO_TECH_PHONE)
    const results = await Promise.allSettled([a.updateStatus(target.id, 'inProgress', '', actor()), b.updateStatus(target.id, 'inProgress', '', actor())])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const after = (await a.load()).requests.find((r) => r.id === target.id) as MaintenanceRequest
    expect(after.history.filter((h) => h.status === 'inProgress')).toHaveLength(1)
  })

  it('refuses a request that does not exist', async () => {
    expect((await failure(make().updateStatus('ghost', 'inProgress', '', actor())))?.code).toBe('not_found')
  })
})

describe('markRead and markAllRead', () => {
  it('marks one notification read, and ignores one that does not exist', async () => {
    const api = make()
    const data = await api.load()
    const unread = data.notifications.find((n) => !n.read)!
    await api.markRead(unread.id)
    expect((await api.load()).notifications.find((n) => n.id === unread.id)!.read).toBe(true)
    await expect(api.markRead('ghost')).resolves.toBeUndefined()
  })

  it('marks everything of one recipient read and leaves the others alone', async () => {
    const api = make()
    const data = await api.load()
    const others = data.notifications.filter((n) => n.recipient !== DEMO_TENANT_PHONE && !n.read).length
    await api.markAllRead(DEMO_TENANT_PHONE)
    const after = await api.load()
    expect(after.notifications.filter((n) => n.recipient === DEMO_TENANT_PHONE).every((n) => n.read)).toBe(true)
    expect(after.notifications.filter((n) => n.recipient !== DEMO_TENANT_PHONE && !n.read)).toHaveLength(others)
  })
})

describe('data that cannot be trusted', () => {
  type Edit = (d: MaintenanceData) => unknown
  const first = (d: MaintenanceData) => d.requests[0]
  const withFirst = (d: MaintenanceData, over: Partial<MaintenanceRequest>) => ({ ...d, requests: [{ ...first(d), ...over }, ...d.requests.slice(1)] })
  const corrupt: [string, Edit][] = [
    ['not json', () => 'not json{'],
    ['an empty object', () => ({})],
    ['null', () => null],
    ['an array', () => []],
    ['another version', (d) => ({ ...d, version: 2 })],
    ['requests that is not an array', (d) => ({ ...d, requests: {} })],
    ['two requests with the same id', (d) => ({ ...d, requests: [d.requests[0], { ...d.requests[1], id: d.requests[0].id }, ...d.requests.slice(2)] })],
    ['two requests with the same code', (d) => ({ ...d, requests: [d.requests[0], { ...d.requests[1], code: d.requests[0].code }, ...d.requests.slice(2)] })],
    ['a code of the wrong shape', (d) => withFirst(d, { code: 'REQ-1' })],
    ['an unknown category', (d) => withFirst(d, { category: 'magic' as never })],
    ['an empty title', (d) => withFirst(d, { title: '  ' })],
    ['no photos', (d) => withFirst(d, { photos: [] })],
    ['four photos', (d) => withFirst(d, { photos: [photo('1'), photo('2'), photo('3'), photo('4')] })],
    ['a photo that is not an image', (d) => withFirst(d, { photos: [{ name: 'x', dataUrl: 'javascript:alert(1)' }] })],
    ['an unknown status', (d) => withFirst(d, { status: 'lost' as never })],
    ['an empty history', (d) => withFirst(d, { history: [] })],
    ['a history that does not start with waiting', (d) => withFirst(d, { history: [{ status: 'done', at: TODAY, note: '', byName: 'x' }], status: 'done' })],
    ['a history that does not end in the current status', (d) => withFirst(d, { status: d.requests[0].status === 'done' ? 'waiting' : 'done' })],
    ['a history that skips a step', (d) => withFirst(d, { status: 'inProgress', assigneeId: d.technicians[0].id, history: [d.requests[0].history[0], { status: 'inProgress', at: TODAY, note: '', byName: 'x' }] })],
    ['a waiting request that has a technician', (d) => withFirst(d, { status: 'waiting', assigneeId: d.technicians[0].id, history: [d.requests[0].history[0]] })],
    ['an assigned request without a technician', (d) => {
      const r = d.requests.find((x) => x.status === 'assigned')!
      return { ...d, requests: d.requests.map((x) => (x.id === r.id ? { ...x, assigneeId: undefined } : x)) }
    }],
    ['an assigned request whose technician does not exist', (d) => {
      const r = d.requests.find((x) => x.status === 'assigned')!
      return { ...d, requests: d.requests.map((x) => (x.id === r.id ? { ...x, assigneeId: 'ghost' } : x)) }
    }],
    ['a notification for a request that does not exist', (d) => ({ ...d, notifications: [{ ...d.notifications[0], requestId: 'ghost' }, ...d.notifications.slice(1)] })],
    ['a notification of an unknown type', (d) => ({ ...d, notifications: [{ ...d.notifications[0], type: 'ping' as never }, ...d.notifications.slice(1)] })],
    ['requests that all refer to units that do not exist', (d) => ({ ...d, requests: d.requests.map((r) => ({ ...r, unitId: 'ghost-' + r.unitId })) })],
  ]

  it.each(corrupt)('starts again from sample data when storage holds %s', async (_name, build) => {
    const storage = new MemoryStorage()
    const raw = build(seeded())
    storage.setItem(MAINTENANCE_KEY, typeof raw === 'string' ? raw : JSON.stringify(raw))
    const data = await make(storage).load()
    expect(data).toEqual(seeded()) // exactly the sample data again: untrusted data must not be kept, even partly
    expect(JSON.parse(storage.getItem(MAINTENANCE_KEY) as string)).toEqual(seeded())
  })

  it('accepts stored data that is valid', async () => {
    const storage = new MemoryStorage()
    const d = seeded()
    d.requests[0].title = 'หัวข้อที่แก้แล้ว'
    storage.setItem(MAINTENANCE_KEY, JSON.stringify(d))
    expect((await make(storage).load()).requests[0].title).toBe('หัวข้อที่แก้แล้ว')
  })

  it('keeps the data when a property edit leaves some references dangling (a lease moved to another unit, a unit deleted)', async () => {
    const storage = new MemoryStorage()
    const before = seeded()
    storage.setItem(MAINTENANCE_KEY, JSON.stringify(before))
    const full = propertyData()
    const unit = before.requests[0].unitId
    const moved: PropertyData = { ...full, leases: full.leases.map((l) => (l.unitId === unit ? { ...l, unitId: full.units.find((u) => u.id !== unit)!.id } : l)), inspections: [] }
    const deleted: PropertyData = { ...full, units: full.units.filter((u) => u.id !== unit), leases: full.leases.filter((l) => l.unitId !== unit), inspections: [] }
    const property = makeProperty()
    for (const edited of [moved, deleted]) {
      const stubbed: PropertyApi = { ...property, load: async () => edited }
      expect(await createLocalMaintenanceApi({ storage, today: () => TODAY, property: stubbed }).load()).toEqual(before)
    }
  })

  it('starts again from sample data when none of the units it refers to exist (the property data was replaced)', async () => {
    const storage = new MemoryStorage()
    storage.setItem(MAINTENANCE_KEY, JSON.stringify(seeded()))
    const full = propertyData()
    const renamed: PropertyData = { ...full, units: full.units.map((u) => ({ ...u, id: 'x-' + u.id })), leases: full.leases.map((l) => ({ ...l, unitId: 'x-' + l.unitId })), inspections: [] }
    const stubbed: PropertyApi = { ...makeProperty(), load: async () => renamed }
    expect(await createLocalMaintenanceApi({ storage, today: () => TODAY, property: stubbed }).load()).toEqual(makeMaintenanceSeed(renamed, TODAY))
  })
})

describe('storage that fails', () => {
  const works = async (api: MaintenanceApi) => {
    const data = await api.load()
    expect(data.requests.length).toBeGreaterThan(0)
    const target = byStatus(data, 'waiting')
    await api.assign(target.id, tech(data).id, 'x')
    expect((await api.load()).requests.find((r) => r.id === target.id)!.status).toBe('assigned')
  }

  it('works when reading throws', async () => works(make(new UnreadableStorage())))
  it('works with no storage at all', async () => works(make(null)))

  it.each([
    ['assigning', (api: MaintenanceApi, d: MaintenanceData) => api.assign(byStatus(d, 'waiting').id, tech(d).id, 'x')],
    ['updating a status', (api: MaintenanceApi, d: MaintenanceData) => api.updateStatus(byStatus(d, 'assigned', DEMO_TECH_PHONE).id, 'inProgress', '', actor())],
  ])('refuses %s when the storage cannot be written, instead of keeping the change only in memory', async (_name, run) => {
    const api = make(new UnwritableStorage())
    const before = await api.load()
    expect((await failure(run(api, before)))?.code).toBe('storage_failed')
    expect(await api.load()).toEqual(before)
  })

  it('refuses assigning when the storage became full, and works again once there is room', async () => {
    const storage = new FullStorage()
    const api = make(storage)
    const before = await api.load()
    storage.full = true
    expect((await failure(api.assign(byStatus(before, 'waiting').id, tech(before).id, 'x')))?.code).toBe('storage_failed')
    storage.full = false
    expect(await api.load()).toEqual(before)
    expect((await api.assign(byStatus(before, 'waiting').id, tech(before).id, 'x')).status).toBe('assigned')
  })
})

describe('a failure is not cached', () => {
  it('retries after a temporary failure of the property data', async () => {
    const property = makeProperty()
    let calls = 0
    const flaky: PropertyApi = { ...property, load: () => (calls++ === 0 ? Promise.reject(new Error('property down')) : property.load()) }
    const api = createLocalMaintenanceApi({ storage: new MemoryStorage(), today: () => TODAY, property: flaky })
    await expect(api.load()).rejects.toThrow('property down')
    expect((await api.load()).requests.length).toBeGreaterThan(0)
  })
})

describe('a tab that could not save once must not hide what other tabs save later', () => {
  it('sees the request another tab made after space was freed, and does not overwrite it with its own', async () => {
    const storage = new FullStorage()
    const property = makeProperty()
    const a = make(storage, property)
    storage.full = true
    await a.load() // the first load cannot save its sample data: it lives in this tab's memory for now
    storage.full = false
    const b = make(storage, property)
    const fromB = await b.createRequest(input({ title: 'จากแท็บ B' }))
    expect((await a.load()).requests.some((r) => r.id === fromB.id)).toBe(true)
    const data = await a.load()
    const waiting = byStatus(data, 'waiting')
    await a.assign(waiting.id, tech(data).id, 'x')
    const stored = await b.load()
    expect(stored.requests.some((r) => r.id === fromB.id)).toBe(true)
    expect(stored.requests.find((r) => r.id === waiting.id)!.status).toBe('assigned')
  })
})

describe('a clock that moves back must not make the stored data invalid', () => {
  const at = (date: string, storage: Storage, property: PropertyApi) => createLocalMaintenanceApi({ storage, today: () => date, property })

  it('keeps every request when an assignment or a status change is made on an earlier day than the last entry', async () => {
    const storage = new MemoryStorage()
    const property = makeProperty()
    const later = at('2026-11-10', storage, property)
    const data = await later.load()
    const made = await later.createRequest(input())
    const earlier = at('2026-11-09', storage, property) // the clock went back one day
    const t = tech(data)
    const assigned = await earlier.assign(made.id, t.id, 'สมหญิง นิติบุคคล')
    expect(assigned.history.at(-1)!.at).toBe('2026-11-10')
    const started = await earlier.updateStatus(made.id, 'inProgress', '', actor(t.name, t.phone))
    expect(started.history.at(-1)!.at).toBe('2026-11-10')
    const after = await earlier.load()
    expect(after.requests.some((r) => r.id === made.id)).toBe(true)
    expect(after.requests.length).toBe(data.requests.length + 1) // nothing was reseeded
  })
})

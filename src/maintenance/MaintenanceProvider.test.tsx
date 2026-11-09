import { act, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEMO_TENANT_PHONE } from '../auth/demoAccounts'
import { TEST_TODAY } from '../test/renderProperty'
import { fakePhoto, makeTestMaintenance } from '../test/testMaintenance'
import { MaintenanceProvider } from './MaintenanceProvider'
import { MAINTENANCE_KEY } from './localMaintenanceApi'
import { MaintenanceError, type CreateRequestInput, type MaintenanceApi, type MaintenanceData } from './types'
import { useMaintenance } from './useMaintenance'

const holder: { value?: ReturnType<typeof useMaintenance> } = {}
const maintenance = () => holder.value as ReturnType<typeof useMaintenance>

function Probe() {
  const current = useMaintenance()
  useEffect(() => {
    holder.value = current
  })
  return (
    <div>
      <span data-testid="status">{current.status}</span>
      <span data-testid="requests">{current.data.requests.length}</span>
      <span data-testid="today">{current.today}</span>
    </div>
  )
}

const mount = (api: MaintenanceApi, today: () => string = () => TEST_TODAY) =>
  render(
    <MaintenanceProvider api={api} today={today}>
      <Probe />
    </MaintenanceProvider>,
  )

const request = (over: Partial<CreateRequestInput> = {}): CreateRequestInput => ({
  category: 'plumbing',
  title: 'ก๊อกน้ำรั่ว',
  description: 'น้ำหยด',
  photos: [fakePhoto('a.jpg')],
  tenantPhone: DEMO_TENANT_PHONE,
  tenantName: 'สมชาย ผู้เช่า',
  ...over,
})

afterEach(() => vi.restoreAllMocks())

describe('MaintenanceProvider', () => {
  it('starts loading, then is ready with the data and today', async () => {
    const { maintenance: api } = makeTestMaintenance()
    const expected = await api.load()
    mount(api)
    expect(screen.getByTestId('status')).toHaveTextContent('loading')
    await screen.findByText('ready')
    expect(screen.getByTestId('requests')).toHaveTextContent(String(expected.requests.length))
    expect(screen.getByTestId('today')).toHaveTextContent(TEST_TODAY)
  })

  it('reloads after a change, so every screen sees it', async () => {
    mount(makeTestMaintenance().maintenance)
    await screen.findByText('ready')
    const before = maintenance().data.requests.length
    await act(async () => {
      await maintenance().createRequest(request())
    })
    expect(maintenance().data.requests.length).toBe(before + 1)
  })

  it('throws the MaintenanceError on to the caller and leaves the data unchanged', async () => {
    mount(makeTestMaintenance().maintenance)
    await screen.findByText('ready')
    const before = maintenance().data.requests.length
    let error: unknown
    await act(async () => {
      error = await maintenance().createRequest(request({ title: '' })).catch((e: unknown) => e)
    })
    expect(error).toBeInstanceOf(MaintenanceError)
    expect((error as MaintenanceError).code).toBe('invalid_input')
    expect(maintenance().data.requests.length).toBe(before)
  })

  it('reflects assignments and notifications', async () => {
    mount(makeTestMaintenance().maintenance)
    await screen.findByText('ready')
    const waiting = maintenance().data.requests.find((r) => r.status === 'waiting')!
    await act(async () => {
      await maintenance().assign(waiting.id, maintenance().data.technicians[0].id, 'สมหญิง นิติบุคคล')
    })
    expect(maintenance().data.requests.find((r) => r.id === waiting.id)?.status).toBe('assigned')
    const unread = maintenance().data.notifications.find((n) => !n.read)!
    await act(async () => {
      await maintenance().markRead(unread.id)
    })
    expect(maintenance().data.notifications.find((n) => n.id === unread.id)?.read).toBe(true)
    await act(async () => {
      await maintenance().markAllRead('role:juristic')
    })
    expect(maintenance().data.notifications.filter((n) => n.recipient === 'role:juristic').every((n) => n.read)).toBe(true)
  })

  it('ends in the error state when loading fails (never stuck loading)', async () => {
    const api: MaintenanceApi = { ...makeTestMaintenance().maintenance, load: () => Promise.reject(new Error('boom')) }
    mount(api)
    expect(await screen.findByText('error')).toBeInTheDocument()
  })

  it('ends in the error state when reloading after a change fails', async () => {
    const base = makeTestMaintenance().maintenance
    let loads = 0
    const api: MaintenanceApi = { ...base, load: () => (loads++ === 0 ? base.load() : Promise.reject(new Error('boom'))) }
    mount(api)
    await screen.findByText('ready')
    await act(async () => {
      await maintenance().markAllRead('role:juristic')
    })
    expect(screen.getByTestId('status')).toHaveTextContent('error')
  })

  it('does not set state after unmount', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const base = makeTestMaintenance().maintenance
    let resolve!: (d: MaintenanceData) => void
    const api: MaintenanceApi = { ...base, load: () => new Promise<MaintenanceData>((r) => (resolve = r)) }
    const { unmount } = mount(api)
    unmount()
    resolve(await makeTestMaintenance().maintenance.load())
    await act(async () => {})
    expect(spy).not.toHaveBeenCalled()
  })

  it('reloads when another tab changes the stored maintenance data, and ignores other keys', async () => {
    const api = makeTestMaintenance().maintenance
    const load = vi.spyOn(api, 'load')
    mount(api)
    await screen.findByText('ready')
    const before = load.mock.calls.length
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'condo:billing' }))
    })
    expect(load.mock.calls.length).toBe(before)
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: MAINTENANCE_KEY }))
    })
    expect(load.mock.calls.length).toBeGreaterThan(before)
  })

  it('throws a clear error when useMaintenance is used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/MaintenanceProvider/)
  })
})

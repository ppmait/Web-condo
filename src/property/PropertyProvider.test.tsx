import { act, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTestApi, TEST_TODAY } from '../test/renderProperty'
import { PropertyProvider } from './PropertyProvider'
import { summarize } from './rules'
import { CHECK_ITEMS, PropertyError, type PropertyApi, type PropertyData, type UnitInput } from './types'
import { useProperty } from './useProperty'

const holder: { value?: ReturnType<typeof useProperty> } = {}
const prop = () => holder.value as ReturnType<typeof useProperty>

function Probe() {
  const current = useProperty()
  useEffect(() => {
    holder.value = current
  })
  return (
    <div>
      <span data-testid="status">{current.status}</span>
      <span data-testid="units">{current.data.units.length}</span>
      <span data-testid="today">{current.today}</span>
    </div>
  )
}

const mount = (api: PropertyApi, today: () => string = () => TEST_TODAY) =>
  render(
    <PropertyProvider api={api} today={today}>
      <Probe />
    </PropertyProvider>,
  )

async function ready() {
  await screen.findByText('ready')
  await vi.waitFor(() => expect(holder.value?.status).toBe('ready'))
}

const newUnit = (over: Partial<UnitInput> = {}): UnitInput => ({
  code: 'C-0101',
  floor: 1,
  areaSqm: 30,
  type: 'studio',
  ownerName: 'คุณสมมติ',
  ownership: 'forRent',
  listRent: 10000,
  closed: false,
  ...over,
})

afterEach(() => vi.restoreAllMocks())

describe('PropertyProvider', () => {
  it('starts loading, then is ready with the data, today and a matching summary', async () => {
    mount(makeTestApi())
    expect(screen.getByTestId('status')).toHaveTextContent('loading')
    await ready()
    expect(screen.getByTestId('units')).toHaveTextContent('24')
    expect(screen.getByTestId('today')).toHaveTextContent(TEST_TODAY)
    expect(prop().summary).toEqual(summarize(prop().data, TEST_TODAY))
  })

  it('reloads after a change: units and summary update, and the created unit is returned', async () => {
    mount(makeTestApi())
    await ready()
    let id = ''
    await act(async () => {
      id = (await prop().createUnit(newUnit())).id
    })
    expect(screen.getByTestId('units')).toHaveTextContent('25')
    expect(prop().summary.totalUnits).toBe(25)
    expect(prop().data.units.some((u) => u.id === id)).toBe(true)
  })

  it('throws the PropertyError on to the caller and leaves the data unchanged', async () => {
    mount(makeTestApi())
    await ready()
    let error: unknown
    await act(async () => {
      error = await prop().createUnit(newUnit({ code: 'bad' })).catch((e: unknown) => e)
    })
    expect(error).toBeInstanceOf(PropertyError)
    expect((error as PropertyError).code).toBe('invalid_input')
    expect(screen.getByTestId('units')).toHaveTextContent('24')
  })

  it('reflects deleting a unit, cancelling a lease and saving an inspection', async () => {
    mount(makeTestApi())
    await ready()
    const free = prop().data.units.find((u) => !prop().data.leases.some((l) => l.unitId === u.id))!
    await act(async () => {
      await prop().deleteUnit(free.id)
    })
    expect(prop().data.units).toHaveLength(23)

    const active = prop().data.leases.find((l) => !l.cancelledAt && l.endDate >= TEST_TODAY && l.startDate <= TEST_TODAY)!
    await act(async () => {
      await prop().cancelLease(active.id, 'ทดสอบ')
    })
    expect(prop().data.leases.find((l) => l.id === active.id)?.cancelledAt).toBe(TEST_TODAY)

    const lease = prop().data.leases.find((l) => !l.cancelledAt && !prop().data.inspections.some((i) => i.leaseId === l.id && i.type === 'moveIn') && l.startDate <= TEST_TODAY)!
    await act(async () => {
      await prop().saveInspection({
        leaseId: lease.id,
        type: 'moveIn',
        date: TEST_TODAY,
        inspector: 'สมหญิง',
        items: CHECK_ITEMS.map((key) => ({ key, condition: 'ok' as const, note: '' })),
        note: '',
      })
    })
    expect(prop().data.inspections).toHaveLength(7)
  })

  it('ends in the error state when loading fails (never stuck loading)', async () => {
    const api: PropertyApi = { ...makeTestApi(), load: () => Promise.reject(new Error('boom')) }
    mount(api)
    expect(await screen.findByText('error')).toBeInTheDocument()
  })

  it('ends in the error state when reloading after a change fails', async () => {
    const base = makeTestApi()
    let loads = 0
    const api: PropertyApi = {
      ...base,
      load: () => (loads++ === 0 ? base.load() : Promise.reject(new Error('boom'))),
    }
    mount(api)
    await ready()
    await act(async () => {
      await prop().createUnit(newUnit())
    })
    expect(screen.getByTestId('status')).toHaveTextContent('error')
  })

  it('does not set state after unmount', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let resolve!: (d: PropertyData) => void
    const base = makeTestApi()
    const api: PropertyApi = { ...base, load: () => new Promise<PropertyData>((r) => (resolve = r)) }
    const { unmount } = mount(api)
    unmount()
    resolve(await base.load())
    await act(async () => {})
    expect(spy).not.toHaveBeenCalled()
  })

  it('reloads when another tab changes the stored data, and ignores other keys', async () => {
    const api = makeTestApi()
    const load = vi.spyOn(api, 'load')
    mount(api)
    await ready()
    const before = load.mock.calls.length
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'something-else' }))
    })
    expect(load.mock.calls.length).toBe(before)
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'condo:property' }))
    })
    expect(load.mock.calls.length).toBeGreaterThan(before)
  })

  it('throws a clear error when useProperty is used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/PropertyProvider/)
  })
})

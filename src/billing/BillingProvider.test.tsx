import { act, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TEST_TODAY } from '../test/renderProperty'
import { makeTestBilling } from '../test/testBilling'
import { BillingProvider } from './BillingProvider'
import { BILLING_KEY } from './localBillingApi'
import { BillingError, type BillingApi, type BillingData } from './types'
import { useBilling } from './useBilling'

const holder: { value?: ReturnType<typeof useBilling> } = {}
const billing = () => holder.value as ReturnType<typeof useBilling>

function Probe() {
  const current = useBilling()
  useEffect(() => {
    holder.value = current
  })
  return (
    <div>
      <span data-testid="status">{current.status}</span>
      <span data-testid="invoices">{current.data.invoices.length}</span>
      <span data-testid="rate">{current.data.rates.water}</span>
      <span data-testid="today">{current.today}</span>
    </div>
  )
}

const mount = (api: BillingApi, today: () => string = () => TEST_TODAY) =>
  render(
    <BillingProvider api={api} today={today}>
      <Probe />
    </BillingProvider>,
  )

afterEach(() => vi.restoreAllMocks())

describe('BillingProvider', () => {
  it('starts loading, then is ready with the data and today', async () => {
    const { billing: api } = makeTestBilling()
    const expected = await api.load()
    mount(api)
    expect(screen.getByTestId('status')).toHaveTextContent('loading')
    await screen.findByText('ready')
    expect(screen.getByTestId('invoices')).toHaveTextContent(String(expected.invoices.length))
    expect(screen.getByTestId('today')).toHaveTextContent(TEST_TODAY)
  })

  it('reloads after a change, so every screen sees it', async () => {
    mount(makeTestBilling().billing)
    await screen.findByText('ready')
    await act(async () => {
      await billing().saveRates({ water: 25, electric: 9, common: 70 })
    })
    expect(screen.getByTestId('rate')).toHaveTextContent('25')
  })

  it('issues invoices and shows them', async () => {
    mount(makeTestBilling().billing)
    await screen.findByText('ready')
    const before = billing().data.invoices.length
    let issued = 0
    await act(async () => {
      issued = (await billing().issueInvoices('2026-11')).issued.length
    })
    expect(issued).toBeGreaterThan(0)
    expect(billing().data.invoices.length).toBe(before + issued)
  })

  it('throws the BillingError on to the caller and leaves the data unchanged', async () => {
    mount(makeTestBilling().billing)
    await screen.findByText('ready')
    let error: unknown
    await act(async () => {
      error = await billing().saveRates({ water: 0, electric: 7, common: 60 }).catch((e: unknown) => e)
    })
    expect(error).toBeInstanceOf(BillingError)
    expect((error as BillingError).code).toBe('invalid_input')
    expect(screen.getByTestId('rate')).toHaveTextContent('18')
  })

  it('reflects slips, receipts and notifications', async () => {
    mount(makeTestBilling().billing)
    await screen.findByText('ready')
    const unread = billing().data.notifications.find((n) => !n.read)!
    await act(async () => {
      await billing().markRead(unread.id)
    })
    expect(billing().data.notifications.find((n) => n.id === unread.id)?.read).toBe(true)
    const phone = billing().data.notifications.find((n) => !n.read)?.recipientPhone
    if (phone) {
      await act(async () => {
        await billing().markAllRead(phone)
      })
      expect(billing().data.notifications.filter((n) => n.recipientPhone === phone).every((n) => n.read)).toBe(true)
    }
  })

  it('ends in the error state when loading fails (never stuck loading)', async () => {
    const api: BillingApi = { ...makeTestBilling().billing, load: () => Promise.reject(new Error('boom')) }
    mount(api)
    expect(await screen.findByText('error')).toBeInTheDocument()
  })

  it('ends in the error state when reloading after a change fails', async () => {
    const base = makeTestBilling().billing
    let loads = 0
    const api: BillingApi = { ...base, load: () => (loads++ === 0 ? base.load() : Promise.reject(new Error('boom'))) }
    mount(api)
    await screen.findByText('ready')
    await act(async () => {
      await billing().saveRates({ water: 25, electric: 9, common: 70 })
    })
    expect(screen.getByTestId('status')).toHaveTextContent('error')
  })

  it('does not set state after unmount', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const base = makeTestBilling().billing
    let resolve!: (d: BillingData) => void
    const api: BillingApi = { ...base, load: () => new Promise<BillingData>((r) => (resolve = r)) }
    const { unmount } = mount(api)
    unmount()
    resolve(await makeTestBilling().billing.load())
    await act(async () => {})
    expect(spy).not.toHaveBeenCalled()
  })

  it('reloads when another tab changes the stored billing data, and ignores other keys', async () => {
    const api = makeTestBilling().billing
    const load = vi.spyOn(api, 'load')
    mount(api)
    await screen.findByText('ready')
    const before = load.mock.calls.length
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'condo:property' }))
    })
    expect(load.mock.calls.length).toBe(before)
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: BILLING_KEY }))
    })
    expect(load.mock.calls.length).toBeGreaterThan(before)
  })

  it('throws a clear error when useBilling is used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/BillingProvider/)
  })
})

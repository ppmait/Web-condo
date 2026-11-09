import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { todayISO } from '../property/dates'
import { BillingContext, type BillingContextValue } from './BillingContext'
import { BILLING_KEY, localBillingApi } from './localBillingApi'
import { DEFAULT_RATES } from './rules'
import type { BillingApi, BillingData } from './types'

const EMPTY: BillingData = { version: 1, rates: DEFAULT_RATES, readings: [], invoices: [], notifications: [] }

interface Props {
  api?: BillingApi
  /** must be a stable function (module-level or memoised) — it is a dependency of the loading effect */
  today?: () => string
  children: ReactNode
}

type State = { status: 'loading' | 'ready' | 'error'; data: BillingData; today: string }

export function BillingProvider({ api = localBillingApi, today = todayISO, children }: Props) {
  const [state, setState] = useState<State>({ status: 'loading', data: EMPTY, today: '' })

  const reload = useCallback(async () => {
    try {
      const data = await api.load()
      setState({ status: 'ready', data, today: today() })
    } catch {
      setState((s) => ({ ...s, status: 'error' }))
    }
  }, [api, today])

  useEffect(() => {
    let alive = true
    api
      .load()
      .then((data) => alive && setState({ status: 'ready', data, today: today() }))
      .catch(() => alive && setState((s) => ({ ...s, status: 'error' })))
    return () => {
      alive = false
    }
  }, [api, today])

  // another browser tab changed the stored billing data: show it here too
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === BILLING_KEY) void reload()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [reload])

  const value = useMemo<BillingContextValue>(() => {
    // run a change on the api, then reload so every screen sees it; errors go to the caller
    const mutate = async <T,>(run: () => Promise<T>): Promise<T> => {
      const result = await run()
      await reload()
      return result
    }
    return {
      ...state,
      saveRates: (rates) => mutate(() => api.saveRates(rates)),
      saveReading: (input) => mutate(() => api.saveReading(input)),
      issueInvoices: (period) => mutate(() => api.issueInvoices(period)),
      submitSlip: (invoiceId, file) => mutate(() => api.submitSlip(invoiceId, file)),
      approveSlip: (invoiceId, slipId) => mutate(() => api.approveSlip(invoiceId, slipId)),
      rejectSlip: (invoiceId, slipId, reason) => mutate(() => api.rejectSlip(invoiceId, slipId, reason)),
      issueReceipt: (invoiceId) => mutate(() => api.issueReceipt(invoiceId)),
      markRead: (notificationId) => mutate(() => api.markRead(notificationId)),
      markAllRead: (phone) => mutate(() => api.markAllRead(phone)),
      reload,
    }
  }, [api, state, reload])

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>
}

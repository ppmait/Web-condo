import { describe, expect, it } from 'vitest'
import en from '../../i18n/en.json'
import th from '../../i18n/th.json'
import type { InvoiceStatus } from '../../billing/rules'
import { invoiceBadge } from './statusBadges'

const STATUSES: InvoiceStatus[] = ['paid', 'verifying', 'overdue', 'unpaid']

describe('invoiceBadge', () => {
  it('maps every invoice status to a badge style', () => {
    expect(STATUSES.map(invoiceBadge)).toEqual(['settled', 'pending', 'critical', 'inactive'])
  })

  it.each(STATUSES)('has a Thai and an English text for %s (a badge never relies on colour alone)', (status) => {
    const texts = [th, en].map((file) => (file as { billing: { invoiceStatus: Record<string, string> } }).billing.invoiceStatus[status])
    for (const text of texts) expect(text?.trim()).toBeTruthy()
    expect(texts[0]).not.toBe(texts[1])
  })
})

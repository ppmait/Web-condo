import type { Status } from '../../components/StatusBadge'
import type { InvoiceStatus } from '../../billing/rules'

const BADGES: Record<InvoiceStatus, Status> = {
  paid: 'settled',
  verifying: 'pending',
  overdue: 'critical',
  unpaid: 'inactive',
}

/** The badge style of an invoice status. Its text is `billing.invoiceStatus.<status>`. */
export const invoiceBadge = (status: InvoiceStatus): Status => BADGES[status]

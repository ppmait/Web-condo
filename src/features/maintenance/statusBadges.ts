import type { Status } from '../../components/StatusBadge'
import { statusBadge } from '../../maintenance/rules'
import type { RequestStatus } from '../../maintenance/types'

/** The badge style of a request status. Its text is `maintenance.status.<status>`. */
export const requestBadge = (status: RequestStatus): Status => statusBadge(status)

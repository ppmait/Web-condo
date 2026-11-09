import { describe, expect, it } from 'vitest'
import en from '../../i18n/en.json'
import th from '../../i18n/th.json'
import type { RequestStatus } from '../../maintenance/types'
import { requestBadge } from './statusBadges'

const STATUSES: RequestStatus[] = ['waiting', 'assigned', 'inProgress', 'done']

describe('requestBadge', () => {
  it('gives every status its own badge style', () => {
    expect(STATUSES.map(requestBadge)).toEqual(['critical', 'inactive', 'pending', 'settled'])
  })

  it.each(STATUSES)('has a Thai and an English text for %s (a badge never relies on colour alone)', (status) => {
    const [a, b] = [th, en].map((file) => (file as { maintenance: { status: Record<string, string> } }).maintenance.status[status])
    expect(a?.trim()).toBeTruthy()
    expect(b?.trim()).toBeTruthy()
    expect(a).not.toBe(b)
  })
})

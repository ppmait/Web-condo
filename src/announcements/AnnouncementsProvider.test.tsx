import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import { createLocalAnnouncementsApi } from './localAnnouncementsApi'
import { AnnouncementsProvider } from './AnnouncementsProvider'
import type { AnnouncementsContextValue } from './AnnouncementsContext'
import type { AnnouncementsApi, AnnouncementsData } from './types'
import { useAnnouncements } from './useAnnouncements'
import { ANNOUNCEMENTS_KEY } from './seed'

const TEST_TODAY = '2026-11-10'

const holder: { value: AnnouncementsContextValue | null } = { value: null }
const ann = () => holder.value!

function Probe() {
  const current = useAnnouncements()
  useEffect(() => {
    holder.value = current
  })
  return (
    <div>
      <span data-testid="status">{current.status}</span>
      <span data-testid="announcements-count">{current.data.announcements.length}</span>
      <span data-testid="today">{current.today}</span>
    </div>
  )
}

const mount = (api: AnnouncementsApi, today: () => string = () => TEST_TODAY) =>
  render(
    <AnnouncementsProvider api={api} today={today}>
      <Probe />
    </AnnouncementsProvider>,
  )

async function ready() {
  await screen.findByText('ready')
  await vi.waitFor(() => expect(holder.value?.status).toBe('ready'))
}

afterEach(() => {
  holder.value = null
  vi.restoreAllMocks()
})

describe('AnnouncementsProvider', () => {
  it('starts loading, then is ready with data and today', async () => {
    const api = createLocalAnnouncementsApi({ storage: null, today: () => TEST_TODAY })
    mount(api)
    expect(screen.getByTestId('status')).toHaveTextContent('loading')
    await ready()
    expect(screen.getByTestId('announcements-count')).toHaveTextContent('5')
    expect(screen.getByTestId('today')).toHaveTextContent(TEST_TODAY)
  })

  it('reloads after a create mutation, updating count and returning the announcement', async () => {
    const api = createLocalAnnouncementsApi({ storage: null, today: () => TEST_TODAY })
    mount(api)
    await ready()

    let createdId = ''
    await act(async () => {
      const created = await ann().create(
        {
          title: 'ประกาศสด',
          body: 'เนื้อหา',
          category: 'urgent',
          pinned: true,
          expiresOn: '',
        },
        'นิติ',
      )
      createdId = created.id
    })

    expect(screen.getByTestId('announcements-count')).toHaveTextContent('6')
    expect(ann().data.announcements.some((a) => a.id === createdId)).toBe(true)
  })

  it('reflects update, remove, markRead, and markAllRead', async () => {
    const api = createLocalAnnouncementsApi({ storage: null, today: () => TEST_TODAY })
    mount(api)
    await ready()

    // update
    await act(async () => {
      await ann().update('ann-1', {
        title: 'หัวข้อใหม่สำหรับทดสอบ',
        body: 'เนื้อหาใหม่',
        category: 'event',
        pinned: false,
        expiresOn: '',
      })
    })
    expect(ann().data.announcements.find((a) => a.id === 'ann-1')?.title).toBe('หัวข้อใหม่สำหรับทดสอบ')

    // markRead
    await act(async () => {
      await ann().markRead('ann-1', '0891234567')
    })
    expect(ann().data.announcements.find((a) => a.id === 'ann-1')?.readBy).toContain('0891234567')

    // markAllRead
    await act(async () => {
      await ann().markAllRead('0888888888')
    })
    expect(ann().data.announcements.find((a) => a.id === 'ann-2')?.readBy).toContain('0888888888')

    // remove
    await act(async () => {
      await ann().remove('ann-1')
    })
    expect(ann().data.announcements.some((a) => a.id === 'ann-1')).toBe(false)
    expect(screen.getByTestId('announcements-count')).toHaveTextContent('4')
  })

  it('ends in the error state when load fails', async () => {
    const api: AnnouncementsApi = {
      ...createLocalAnnouncementsApi({ storage: null, today: () => TEST_TODAY }),
      load: () => Promise.reject(new Error('fail')),
    }
    mount(api)
    expect(await screen.findByText('error')).toBeInTheDocument()
  })

  it('ends in error state when reload after mutation fails', async () => {
    const base = createLocalAnnouncementsApi({ storage: null, today: () => TEST_TODAY })
    let loads = 0
    const api: AnnouncementsApi = {
      ...base,
      load: () => (loads++ === 0 ? base.load() : Promise.reject(new Error('reload failed'))),
    }
    mount(api)
    await ready()
    await act(async () => {
      await ann().remove('ann-1')
    })
    expect(screen.getByTestId('status')).toHaveTextContent('error')
  })

  it('does not set state after unmount', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let resolve!: (d: AnnouncementsData) => void
    const base = createLocalAnnouncementsApi({ storage: null, today: () => TEST_TODAY })
    const api: AnnouncementsApi = {
      ...base,
      load: () => new Promise<AnnouncementsData>((r) => (resolve = r)),
    }
    const { unmount } = mount(api)
    unmount()
    resolve(await base.load())
    await act(async () => {})
    expect(spy).not.toHaveBeenCalled()
  })

  it('reloads when another tab dispatches storage event for its key, and ignores other keys', async () => {
    const api = createLocalAnnouncementsApi({ storage: null, today: () => TEST_TODAY })
    const loadSpy = vi.spyOn(api, 'load')
    mount(api)
    await ready()

    const before = loadSpy.mock.calls.length
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'condo:other' }))
    })
    expect(loadSpy.mock.calls.length).toBe(before)

    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: ANNOUNCEMENTS_KEY }))
    })
    expect(loadSpy.mock.calls.length).toBeGreaterThan(before)
  })

  it('throws clear error when useAnnouncements is used outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow('useAnnouncements must be used inside <AnnouncementsProvider>')
    spy.mockRestore()
  })
})

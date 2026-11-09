import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEMO_TENANT_PHONE } from '../../auth/demoAccounts'
import { createLocalFacilitiesApi, FACILITIES_KEY } from '../../facilities/localFacilitiesApi'
import { canCancel, freeAt, quotaUsed } from '../../facilities/rules'
import { makeFacilitiesSeed } from '../../facilities/seed'
import { FacilitiesError, type Booking, type FacilitiesApi, type FacilitiesData } from '../../facilities/types'
import i18n from '../../i18n'
import { formatDate } from '../../lib/format'
import { addDays } from '../../property/dates'
import type { PropertyApi } from '../../property/types'
import { MemoryStorage } from '../../test/memoryStorage'
import { renderFacilities } from '../../test/renderFacilities'
import { TEST_TODAY } from '../../test/renderProperty'
import { makeTestFacilities } from '../../test/testFacilities'
import TenantFacilitiesPage from './TenantFacilitiesPage'

function LocationProbe() {
  const { pathname, search } = useLocation()
  return <span data-testid="location">{pathname + search}</span>
}

const today = () => TEST_TODAY
const day = (n: number) => addDays(TEST_TODAY, n)

afterEach(async () => {
  vi.restoreAllMocks()
  await i18n.changeLanguage('th')
})

const STATUS_TEXT = { pending: 'รอยืนยันการจองส่วนกลาง', confirmed: 'ยืนยันแล้ว', rejected: 'ปฏิเสธ', cancelled: 'ยกเลิกแล้ว' }
const NAMES: Record<string, string> = { pool: 'สระว่ายน้ำ', fitness: 'ฟิตเนส', meeting: 'ห้องประชุม', bbq: 'ลานบาร์บีคิว' }

async function setup(opts: { route?: string; property?: PropertyApi; api?: FacilitiesApi } = {}) {
  const pair = makeTestFacilities()
  const property = opts.property ?? pair.property
  const api = opts.api ?? (opts.property ? createLocalFacilitiesApi({ storage: null, today, property }) : pair.facilities)
  const view = await renderFacilities(
    <>
      <TenantFacilitiesPage api={property} today={today} />
      <LocationProbe />
    </>,
    { api, property, as: 'tenant', route: opts.route ?? '/tenant/facilities' },
  )
  const data = await api.load()
  const mine = data.bookings.filter((b) => b.tenantPhone === DEMO_TENANT_PHONE).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.code.localeCompare(a.code))
  return { ...view, api, property, data, mine }
}

const card = (b: Booking) => screen.getByRole('button', { name: `เปิดการจอง ${b.code}` })
const facilityCard = (key: string) => screen.getByRole('heading', { level: 3, name: NAMES[key] }).closest('article') as HTMLElement
const hourOf = (list: HTMLElement) => within(list).getAllByRole('listitem')

describe('TenantFacilitiesPage: the facilities', () => {
  it('shows the four facilities with their opening hours and capacity, and the closed one with its note and no booking button', async () => {
    const { data } = await setup()
    for (const f of data.facilities) {
      const c = within(facilityCard(f.key))
      expect(c.getByText(`เปิด ${String(f.openHour).padStart(2, '0')}:00–${String(f.closeHour).padStart(2, '0')}:00 น.`)).toBeInTheDocument()
      expect(c.getByText(`รองรับ ${f.capacity} คนต่อชั่วโมง`)).toBeInTheDocument()
    }
    const bbq = within(facilityCard('bbq'))
    expect(bbq.getByText('ปิดปรับปรุง')).toBeInTheDocument()
    expect(bbq.getByText(data.facilities.find((f) => f.key === 'bbq')!.closedNote!)).toBeInTheDocument()
    expect(bbq.queryByRole('button')).not.toBeInTheDocument()
    expect(within(facilityCard('pool')).getByText('เปิดให้จอง')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'จอง สระว่ายน้ำ' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'จอง ลานบาร์บีคิว' })).not.toBeInTheDocument()
  })

  it('shows the free places of every hour for the chosen day, and they follow the day', async () => {
    const { data } = await setup()
    const pool = data.facilities.find((f) => f.key === 'pool')!
    const bar = () => screen.getByRole('list', { name: 'ที่ว่างรายชั่วโมงของ สระว่ายน้ำ' })
    expect(hourOf(bar())).toHaveLength(pool.closeHour - pool.openHour)
    for (const li of hourOf(bar())) {
      const hour = Number(li.textContent!.match(/^(\d\d):00/)![1])
      expect(li).toHaveTextContent(`${String(hour).padStart(2, '0')}:00 น. ว่าง ${freeAt(pool, data.bookings, day(1), hour)} จาก ${pool.capacity}`)
    }
    await userEvent.selectOptions(screen.getByLabelText('วันที่ดูที่ว่าง'), day(2))
    expect(within(bar()).getByText(/09:00 น\. ว่าง 15 จาก 20/)).toBeInTheDocument() // the sample booking of 5 people from 9 to 12
    expect(within(bar()).getByText(/12:00 น\. ว่าง 20 จาก 20/)).toBeInTheDocument()
  })

  it('offers tomorrow up to 14 days ahead as the days to look at', async () => {
    await setup()
    const options = within(screen.getByLabelText('วันที่ดูที่ว่าง')).getAllByRole('option').map((o) => (o as HTMLOptionElement).value)
    expect(options).toEqual(Array.from({ length: 14 }, (_, i) => day(i + 1)))
  })

  it('tells how much of the weekly quota the unit has used in the week of the chosen day', async () => {
    const { data } = await setup()
    const unit = data.bookings.find((b) => b.tenantPhone === DEMO_TENANT_PHONE)!.unitId
    expect(screen.getByText(`ห้องของคุณใช้สิทธิ์จอง ${quotaUsed(data.bookings, unit, day(1))} จาก 2 ครั้งในสัปดาห์ของวันที่เลือก`)).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('วันที่ดูที่ว่าง'), day(3))
    expect(screen.getByText(`ห้องของคุณใช้สิทธิ์จอง ${quotaUsed(data.bookings, unit, day(3))} จาก 2 ครั้งในสัปดาห์ของวันที่เลือก`)).toBeInTheDocument()
  })

  it('opens the form from a facility card already on that facility and the chosen day', async () => {
    await setup()
    await userEvent.selectOptions(screen.getByLabelText('วันที่ดูที่ว่าง'), day(5))
    await userEvent.click(screen.getByRole('button', { name: 'จอง ห้องประชุม' }))
    const dialog = screen.getByRole('dialog', { name: 'จองส่วนกลาง' })
    expect(within(dialog).getByLabelText('วันที่ใช้บริการ')).toHaveValue(day(5))
    expect(within(dialog).getByLabelText('ส่วนกลาง')).toHaveDisplayValue('ห้องประชุม')
  })

  it('explains instead of offering a booking when the account has no active lease', async () => {
    const p = makeTestFacilities()
    const full = await p.property.load()
    const stub: PropertyApi = { ...p.property, load: async () => ({ ...full, leases: full.leases.filter((l) => l.tenantPhone !== DEMO_TENANT_PHONE) }) }
    await setup({ property: stub })
    expect(screen.getByText(/บัญชีนี้ยังไม่มีสัญญาเช่าที่ใช้งานอยู่ จึงจองส่วนกลางไม่ได้/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^จอง / })).not.toBeInTheDocument()
    expect(screen.queryByText(/ห้องของคุณใช้สิทธิ์จอง/)).not.toBeInTheDocument()
  })
})

describe('TenantFacilitiesPage: my bookings', () => {
  it('shows only my bookings, newest first, and none of the other tenants’', async () => {
    const { data, mine } = await setup()
    expect(mine.length).toBeGreaterThanOrEqual(3)
    const shown = screen.getAllByRole('button', { name: /^เปิดการจอง / }).map((b) => b.getAttribute('aria-label')!.replace('เปิดการจอง ', ''))
    expect(shown).toEqual(mine.map((b) => b.code))
    for (const other of data.bookings.filter((b) => b.tenantPhone !== DEMO_TENANT_PHONE)) expect(screen.queryByText(other.code)).not.toBeInTheDocument()
  })

  it('shows code, facility, day and time, people and a status badge with text on each card', async () => {
    const { mine, data } = await setup()
    const b = mine[0]
    const c = within(card(b))
    expect(c.getByText(b.code)).toBeInTheDocument()
    expect(c.getByText(NAMES[data.facilities.find((f) => f.id === b.facilityId)!.key])).toBeInTheDocument()
    expect(c.getByText(formatDate(b.date, 'th'))).toBeInTheDocument()
    expect(c.getByText(`${String(b.startHour).padStart(2, '0')}:00–${String(b.endHour).padStart(2, '0')}:00 น.`)).toBeInTheDocument()
    expect(c.getByText(STATUS_TEXT[b.status])).toBeInTheDocument()
  })

  it('says so when I have no booking yet', async () => {
    const p = makeTestFacilities()
    const seed = makeFacilitiesSeed(await p.property.load(), TEST_TODAY)
    const gone = new Set(seed.bookings.filter((b) => b.tenantPhone === DEMO_TENANT_PHONE).map((b) => b.id))
    const data: FacilitiesData = { ...seed, bookings: seed.bookings.filter((b) => !gone.has(b.id)), notifications: seed.notifications.filter((n) => !gone.has(n.refId)) }
    const storage = new MemoryStorage()
    storage.setItem(FACILITIES_KEY, JSON.stringify(data))
    await setup({ api: createLocalFacilitiesApi({ storage, today, property: p.property }), property: p.property })
    expect(screen.getByText('ยังไม่มีการจอง')).toBeInTheDocument()
  })

  it('shows the dates in English', async () => {
    await i18n.changeLanguage('en')
    const { mine } = await setup()
    expect(within(screen.getByRole('button', { name: `Open booking ${mine[0].code}` })).getByText(formatDate(mine[0].date, 'en'))).toBeInTheDocument()
  })
})

describe('TenantFacilitiesPage: the detail and cancelling', () => {
  const cancellable = (mine: Booking[]) => mine.find((b) => canCancel(b, TEST_TODAY))!

  it('opens the detail: facts, the timeline in order, and the reason of a rejection', async () => {
    const { mine } = await setup()
    const rejected = mine.find((b) => b.status === 'rejected')!
    await userEvent.click(card(rejected))
    const dialog = screen.getByRole('dialog', { name: `การจอง ${rejected.code}` })
    expect(within(dialog).getByText(`เหตุผลที่ปฏิเสธ: ${rejected.history.at(-1)!.note}`)).toBeInTheDocument()
    const steps = within(within(dialog).getByRole('list', { name: 'ความคืบหน้า' })).getAllByRole('listitem')
    expect(steps).toHaveLength(rejected.history.length)
    rejected.history.forEach((h, i) => expect(steps[i]).toHaveTextContent(STATUS_TEXT[h.status]))
    expect(within(dialog).queryByRole('button', { name: 'ยกเลิกการจอง' })).not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('cancels a booking after asking, once, and the card follows', async () => {
    const user = userEvent.setup()
    const { api, mine } = await setup()
    const b = cancellable(mine)
    const cancel = vi.spyOn(api, 'cancelBooking')
    await user.click(card(b))
    await user.click(within(screen.getByRole('dialog', { name: `การจอง ${b.code}` })).getByRole('button', { name: 'ยกเลิกการจอง' }))
    const confirm = screen.getByRole('dialog', { name: `ยกเลิกการจอง ${b.code}` })
    expect(cancel).not.toHaveBeenCalled()
    await user.click(within(confirm).getByRole('button', { name: 'ยกเลิกการจอง' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: `ยกเลิกการจอง ${b.code}` })).not.toBeInTheDocument())
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(cancel).toHaveBeenCalledWith(b.id, DEMO_TENANT_PHONE)
    await user.keyboard('{Escape}')
    expect(within(card(b)).getByText(STATUS_TEXT.cancelled)).toBeInTheDocument()
  })

  it('calls the api once when the cancellation is pressed twice, and disables the button meanwhile', async () => {
    const user = userEvent.setup()
    const { api, mine } = await setup()
    const b = cancellable(mine)
    const original = api.cancelBooking.bind(api)
    let release!: () => void
    const cancel = vi.spyOn(api, 'cancelBooking').mockImplementation((id, phone) => new Promise((resolve) => (release = () => resolve(original(id, phone)))))
    await user.click(card(b))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ยกเลิกการจอง' }))
    const confirm = within(screen.getByRole('dialog', { name: `ยกเลิกการจอง ${b.code}` })).getByRole('button', { name: 'ยกเลิกการจอง' })
    await user.click(confirm)
    await user.click(confirm)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(confirm).toBeDisabled()
    release()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: `ยกเลิกการจอง ${b.code}` })).not.toBeInTheDocument())
  })

  it('offers no cancel button on the day itself, in the past, or once finished', async () => {
    const p = makeTestFacilities()
    const seed = makeFacilitiesSeed(await p.property.load(), TEST_TODAY)
    const mineAll = seed.bookings.filter((b) => b.tenantPhone === DEMO_TENANT_PHONE)
    const past = mineAll.find((b) => b.date < TEST_TODAY && b.status === 'confirmed')!
    const rejected = mineAll.find((b) => b.status === 'rejected')!
    await setup()
    for (const b of [past, rejected]) {
      await userEvent.click(card(b))
      expect(within(screen.getByRole('dialog')).queryByRole('button', { name: 'ยกเลิกการจอง' })).not.toBeInTheDocument()
      await userEvent.keyboard('{Escape}')
    }
  })

  it('says so and shows the new state when the booking changed in another tab, and still sends no second notice', async () => {
    const user = userEvent.setup()
    const { api, mine } = await setup()
    const b = cancellable(mine)
    await user.click(card(b))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ยกเลิกการจอง' }))
    await api.cancelBooking(b.id, DEMO_TENANT_PHONE) // another tab
    const count = (await api.load()).notifications.length
    await user.click(within(screen.getByRole('dialog', { name: `ยกเลิกการจอง ${b.code}` })).getByRole('button', { name: 'ยกเลิกการจอง' }))
    expect(await within(screen.getByRole('dialog', { name: `ยกเลิกการจอง ${b.code}` })).findByText('การจองนี้เปลี่ยนสถานะไปแล้ว รายการถูกโหลดใหม่')).toBeInTheDocument()
    expect((await api.load()).notifications).toHaveLength(count)
  })

  it('shows the full-storage message when the cancellation could not be saved', async () => {
    const user = userEvent.setup()
    const { api, mine } = await setup()
    const b = cancellable(mine)
    vi.spyOn(api, 'cancelBooking').mockRejectedValueOnce(new FacilitiesError('storage_failed'))
    await user.click(card(b))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ยกเลิกการจอง' }))
    await user.click(within(screen.getByRole('dialog', { name: `ยกเลิกการจอง ${b.code}` })).getByRole('button', { name: 'ยกเลิกการจอง' }))
    expect(await screen.findByText(/พื้นที่เก็บข้อมูลในเบราว์เซอร์เต็ม/)).toBeInTheDocument()
  })

  it('stacks the cancel dialog on the detail without React warnings; Tab stays inside the top one and Escape closes only it', async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { mine } = await setup()
    const b = cancellable(mine)
    await user.click(card(b))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ยกเลิกการจอง' }))
    const top = screen.getByRole('dialog', { name: `ยกเลิกการจอง ${b.code}` })
    for (let i = 0; i < 4; i++) {
      await user.tab()
      expect(top.contains(document.activeElement)).toBe(true)
    }
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: `ยกเลิกการจอง ${b.code}` })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: `การจอง ${b.code}` })).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('?booking= (from a notification)', () => {
  it('opens one of my bookings and clears the address when it is closed', async () => {
    const t = makeTestFacilities()
    const mine = (await t.facilities.load()).bookings.filter((b) => b.tenantPhone === DEMO_TENANT_PHONE)
    await setup({ route: `/tenant/facilities?booking=${mine[0].id}` })
    expect(screen.getByRole('dialog', { name: `การจอง ${mine[0].code}` })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/tenant\/facilities$/)
  })

  it.each([
    ['somebody else’s booking', true],
    ['a booking that does not exist', false],
  ])('ignores %s without breaking and clears the address', async (_name, real) => {
    const t = makeTestFacilities()
    const other = (await t.facilities.load()).bookings.find((b) => b.tenantPhone !== DEMO_TENANT_PHONE)!
    await setup({ route: `/tenant/facilities?booking=${real ? other.id : 'ghost'}` })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/tenant\/facilities$/)
  })
})

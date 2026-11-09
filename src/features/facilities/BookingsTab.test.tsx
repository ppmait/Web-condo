import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLocalFacilitiesApi, FACILITIES_KEY } from '../../facilities/localFacilitiesApi'
import { canDecide, quotaUsed } from '../../facilities/rules'
import { makeFacilitiesSeed } from '../../facilities/seed'
import { FacilitiesError, type Booking, type BookingStatus, type FacilitiesApi, type FacilitiesData } from '../../facilities/types'
import i18n from '../../i18n'
import { formatDate } from '../../lib/format'
import { addDays } from '../../property/dates'
import { MemoryStorage } from '../../test/memoryStorage'
import { renderFacilities } from '../../test/renderFacilities'
import { TEST_TODAY } from '../../test/renderProperty'
import { makeTestFacilities } from '../../test/testFacilities'
import BookingsTab from './BookingsTab'

function LocationProbe() {
  const { pathname, search } = useLocation()
  return <span data-testid="location">{pathname + search}</span>
}

afterEach(async () => {
  vi.restoreAllMocks()
  await i18n.changeLanguage('th')
})

const STATUS_TEXT: Record<BookingStatus, string> = { pending: 'รอยืนยันการจองส่วนกลาง', confirmed: 'ยืนยันแล้ว', rejected: 'ปฏิเสธ', cancelled: 'ยกเลิกแล้ว' }
const CARD_TEXT: Record<BookingStatus, string> = { pending: 'คำขอที่รอยืนยัน', confirmed: 'การจองที่ยืนยันแล้ว', rejected: 'การจองที่ถูกปฏิเสธ', cancelled: 'การจองที่ยกเลิกแล้ว' }
const NAMES: Record<string, string> = { pool: 'สระว่ายน้ำ', fitness: 'ฟิตเนส', meeting: 'ห้องประชุม', bbq: 'ลานบาร์บีคิว' }
const STATUSES: BookingStatus[] = ['pending', 'confirmed', 'rejected', 'cancelled']
const NAME = 'สมหญิง นิติบุคคล'

async function setup(opts: { api?: FacilitiesApi; route?: string } = {}) {
  const pair = makeTestFacilities()
  const api = opts.api ?? pair.facilities
  const view = await renderFacilities(
    <>
      <BookingsTab />
      <LocationProbe />
    </>,
    { api, property: pair.property, as: 'juristic', route: opts.route ?? '/juristic/parcels-bookings' },
  )
  return { ...view, api, data: await api.load() }
}

const rowOf = (code: string) => screen.getByText(code).closest('tr') as HTMLElement
const dataRows = () => screen.getAllByRole('row').slice(1)
const decidable = (data: FacilitiesData) => data.bookings.find((b) => canDecide(b, TEST_TODAY))!
const confirmDialog = (b: Booking) => screen.getByRole('dialog', { name: `ยืนยันการจอง ${b.code}` })
const rejectDialog = (b: Booking) => screen.getByRole('dialog', { name: `ปฏิเสธการจอง ${b.code}` })

async function openDetail(b: Booking) {
  await userEvent.click(within(rowOf(b.code)).getByRole('button', { name: `ดูรายละเอียด ${b.code}` }))
  return screen.getByRole('dialog', { name: `การจอง ${b.code}` })
}

describe('BookingsTab: the overview', () => {
  it('counts the bookings of each status on four cards', async () => {
    const { data } = await setup()
    for (const s of STATUSES) {
      const c = screen.getByText(CARD_TEXT[s]).closest('div') as HTMLElement
      expect(within(c).getByText(String(data.bookings.filter((b) => b.status === s).length))).toBeInTheDocument()
    }
  })

  it('lists every booking with facility, unit, tenant, day, time, people and a status badge, in a box that scrolls on its own', async () => {
    const { data } = await setup()
    expect(dataRows()).toHaveLength(data.bookings.length)
    for (const b of data.bookings) {
      const row = within(rowOf(b.code))
      expect(row.getByText(NAMES[data.facilities.find((f) => f.id === b.facilityId)!.key])).toBeInTheDocument()
      expect(row.getByText(b.unitCode)).toBeInTheDocument()
      expect(row.getByText(b.tenantName)).toBeInTheDocument()
      expect(row.getByText(formatDate(b.date, 'th'))).toBeInTheDocument()
      expect(row.getByText(STATUS_TEXT[b.status])).toBeInTheDocument()
    }
    expect(screen.getAllByRole('table')[0].parentElement).toHaveClass('overflow-x-auto', 'relative')
  })

  it.each(STATUSES)('filters by %s', async (s) => {
    const { data } = await setup()
    await userEvent.selectOptions(screen.getByLabelText('สถานะ'), STATUS_TEXT[s])
    const want = data.bookings.filter((b) => b.status === s)
    expect(want.length).toBeGreaterThan(0)
    expect(dataRows()).toHaveLength(want.length)
  })

  it('says nothing matches when the filter leaves no booking', async () => {
    const p = makeTestFacilities()
    const seed = makeFacilitiesSeed(await p.property.load(), TEST_TODAY)
    const gone = new Set(seed.bookings.filter((b) => b.status === 'cancelled').map((b) => b.id))
    const data: FacilitiesData = { ...seed, bookings: seed.bookings.filter((b) => !gone.has(b.id)), notifications: seed.notifications.filter((n) => !gone.has(n.refId)) }
    const storage = new MemoryStorage()
    storage.setItem(FACILITIES_KEY, JSON.stringify(data))
    await setup({ api: createLocalFacilitiesApi({ storage, today: () => TEST_TODAY, property: p.property }) })
    await userEvent.selectOptions(screen.getByLabelText('สถานะ'), STATUS_TEXT.cancelled)
    expect(screen.getByText('ไม่มีรายการตามตัวกรองนี้')).toBeInTheDocument()
  })

  it('shows the labels and dates in English', async () => {
    await i18n.changeLanguage('en')
    const { data } = await setup()
    expect(screen.getByLabelText('Status')).toBeInTheDocument()
    expect(within(rowOf(data.bookings[0].code)).getByText(formatDate(data.bookings[0].date, 'en'))).toBeInTheDocument()
  })
})

describe('BookingsTab: confirming', () => {
  it('asks first; confirming makes the booking confirmed and tells the tenant, once', async () => {
    const user = userEvent.setup()
    const { api, data } = await setup()
    const b = decidable(data)
    const decide = vi.spyOn(api, 'decideBooking')
    await user.click(within(await openDetail(b)).getByRole('button', { name: 'ยืนยัน' }))
    expect(decide).not.toHaveBeenCalled()
    await user.click(within(confirmDialog(b)).getByRole('button', { name: 'ยืนยัน' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: `ยืนยันการจอง ${b.code}` })).not.toBeInTheDocument())
    expect(decide).toHaveBeenCalledTimes(1)
    expect(decide).toHaveBeenCalledWith(b.id, 'confirmed', '', NAME)
    await user.keyboard('{Escape}')
    expect(within(rowOf(b.code)).getByText(STATUS_TEXT.confirmed)).toBeInTheDocument()
    const added = (await api.load()).notifications.slice(data.notifications.length)
    expect(added).toEqual([expect.objectContaining({ type: 'bookingDecided', refId: b.id, recipient: b.tenantPhone, status: 'confirmed' })])
  })

  it('calls the api once when the confirmation is pressed twice, and disables the button meanwhile', async () => {
    const user = userEvent.setup()
    const { api, data } = await setup()
    const b = decidable(data)
    const original = api.decideBooking.bind(api)
    let release!: () => void
    const decide = vi.spyOn(api, 'decideBooking').mockImplementation((a, c, d, e) => new Promise((resolve) => (release = () => resolve(original(a, c, d, e)))))
    await user.click(within(await openDetail(b)).getByRole('button', { name: 'ยืนยัน' }))
    const confirm = within(confirmDialog(b)).getByRole('button', { name: 'ยืนยัน' })
    await user.click(confirm)
    await user.click(confirm)
    expect(decide).toHaveBeenCalledTimes(1)
    expect(confirm).toBeDisabled()
    release()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: `ยืนยันการจอง ${b.code}` })).not.toBeInTheDocument())
  })

  it('says so, shows the new state and adds no second notice when the booking was decided in another tab', async () => {
    const user = userEvent.setup()
    const { api, data } = await setup()
    const b = decidable(data)
    await user.click(within(await openDetail(b)).getByRole('button', { name: 'ยืนยัน' }))
    await api.decideBooking(b.id, 'rejected', 'ไม่ว่าง', 'อีกแท็บ') // another tab
    const count = (await api.load()).notifications.length
    await user.click(within(confirmDialog(b)).getByRole('button', { name: 'ยืนยัน' }))
    expect(await within(confirmDialog(b)).findByText(/ถูกตัดสินหรือเปลี่ยนสถานะไปแล้ว/)).toBeInTheDocument()
    await waitFor(() => expect(within(rowOf(b.code)).getByText(STATUS_TEXT.rejected)).toBeInTheDocument())
    expect((await api.load()).notifications).toHaveLength(count)
  })

  it('says the storage is full when the decision could not be saved', async () => {
    const user = userEvent.setup()
    const { api, data } = await setup()
    const b = decidable(data)
    vi.spyOn(api, 'decideBooking').mockRejectedValueOnce(new FacilitiesError('storage_failed'))
    await user.click(within(await openDetail(b)).getByRole('button', { name: 'ยืนยัน' }))
    await user.click(within(confirmDialog(b)).getByRole('button', { name: 'ยืนยัน' }))
    expect(await within(confirmDialog(b)).findByText(/พื้นที่เก็บข้อมูลในเบราว์เซอร์เต็ม/)).toBeInTheDocument()
  })

  it('offers no decision for a booking that is not pending, or whose day has passed', async () => {
    const p = makeTestFacilities()
    const seed = makeFacilitiesSeed(await p.property.load(), TEST_TODAY)
    const pool = seed.facilities.find((f) => f.key === 'pool')!
    const past: Booking = {
      ...seed.bookings.find((b) => b.status === 'pending')!,
      id: 'crafted-past',
      code: 'BK-0900',
      facilityId: pool.id,
      date: addDays(TEST_TODAY, -2),
      startHour: 20,
      endHour: 21,
      people: 1,
      history: [{ status: 'pending', at: addDays(TEST_TODAY, -4), note: '', byName: 'x' }],
    }
    const withPast: FacilitiesData = { ...seed, bookings: [...seed.bookings, { ...past, createdAt: addDays(TEST_TODAY, -4) }], notifications: [] }
    const storage = new MemoryStorage()
    storage.setItem(FACILITIES_KEY, JSON.stringify(withPast))
    const { data } = await setup({ api: createLocalFacilitiesApi({ storage, today: () => TEST_TODAY, property: p.property }) })
    for (const b of [data.bookings.find((x) => x.status === 'confirmed')!, data.bookings.find((x) => x.status === 'rejected')!, data.bookings.find((x) => x.id === 'crafted-past')!]) {
      const dialog = await openDetail(b)
      expect(within(dialog).queryByRole('button', { name: /^(ยืนยัน|ปฏิเสธ)$/ })).not.toBeInTheDocument()
      await userEvent.keyboard('{Escape}')
    }
  })
})

describe('BookingsTab: rejecting', () => {
  it.each([[''], ['   '], ['x'.repeat(301)]])('needs a reason of 1–300 characters (%j): message under the field, focus there, no api call', async (reason) => {
    const user = userEvent.setup()
    const { api, data } = await setup()
    const b = decidable(data)
    const decide = vi.spyOn(api, 'decideBooking')
    await user.click(within(await openDetail(b)).getByRole('button', { name: 'ปฏิเสธ' }))
    const dialog = rejectDialog(b)
    const field = within(dialog).getByLabelText(/เหตุผลที่ปฏิเสธ/)
    if (reason) {
      await user.click(field)
      await user.paste(reason)
    }
    await user.click(within(dialog).getByRole('button', { name: 'ปฏิเสธการจอง' }))
    expect(decide).not.toHaveBeenCalled()
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveFocus()
    expect(within(dialog).getByText('กรุณาระบุเหตุผล (ไม่เกิน 300 ตัวอักษร)')).toBeInTheDocument()
  })

  it('rejects with the reason, gives the unit its place in the week back, and the tenant is told', async () => {
    const user = userEvent.setup()
    const { api, data } = await setup()
    const b = decidable(data)
    const before = quotaUsed(data.bookings, b.unitId, b.date)
    await user.click(within(await openDetail(b)).getByRole('button', { name: 'ปฏิเสธ' }))
    await user.type(within(rejectDialog(b)).getByLabelText(/เหตุผลที่ปฏิเสธ/), '  ปิดทำความสะอาด  ')
    await user.click(within(rejectDialog(b)).getByRole('button', { name: 'ปฏิเสธการจอง' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: `ปฏิเสธการจอง ${b.code}` })).not.toBeInTheDocument())
    const after = await api.load()
    const updated = after.bookings.find((x) => x.id === b.id)!
    expect(updated.status).toBe('rejected')
    expect(updated.history.at(-1)).toMatchObject({ note: 'ปิดทำความสะอาด', byName: NAME })
    expect(quotaUsed(after.bookings, b.unitId, b.date)).toBe(before - 1)
    expect(after.notifications.slice(data.notifications.length)).toEqual([expect.objectContaining({ type: 'bookingDecided', recipient: b.tenantPhone, status: 'rejected' })])
  })

  it('stacks the confirmation and rejection dialogs on the detail without React warnings; Tab stays inside the top one and Escape closes only it', async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { data } = await setup()
    const b = decidable(data)
    for (const [open, name] of [['ยืนยัน', `ยืนยันการจอง ${b.code}`], ['ปฏิเสธ', `ปฏิเสธการจอง ${b.code}`]] as const) {
      await user.click(within(await openDetail(b)).getByRole('button', { name: open }))
      const top = screen.getByRole('dialog', { name })
      for (let i = 0; i < 4; i++) {
        await user.tab()
        expect(top.contains(document.activeElement)).toBe(true)
      }
      await user.keyboard('{Escape}')
      expect(screen.queryByRole('dialog', { name })).not.toBeInTheDocument()
      expect(screen.getByRole('dialog', { name: `การจอง ${b.code}` })).toBeInTheDocument()
      await user.keyboard('{Escape}')
    }
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('BookingsTab: closing and opening a facility', () => {
  it('shows each facility open or closed, closes one with a note after asking, and opens it again', async () => {
    const user = userEvent.setup()
    const { api, data } = await setup()
    const pool = data.facilities.find((f) => f.key === 'pool')!
    const set = vi.spyOn(api, 'setFacilityClosed')
    expect(screen.getByRole('button', { name: 'เปิดให้จอง ลานบาร์บีคิว' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'ปิดชั่วคราว สระว่ายน้ำ' }))
    const dialog = screen.getByRole('dialog', { name: 'ปิด สระว่ายน้ำ ชั่วคราว' })
    expect(set).not.toHaveBeenCalled()
    await user.type(within(dialog).getByLabelText(/หมายเหตุการปิด/), 'ซ่อมระบบน้ำ')
    await user.click(within(dialog).getByRole('button', { name: 'ปิดชั่วคราว' }))
    await waitFor(() => expect(set).toHaveBeenCalledWith(pool.id, true, 'ซ่อมระบบน้ำ'))
    expect(await screen.findByRole('button', { name: 'เปิดให้จอง สระว่ายน้ำ' })).toBeInTheDocument()
    expect((await api.load()).bookings).toEqual(data.bookings) // the bookings that exist are not touched
    await user.click(screen.getByRole('button', { name: 'เปิดให้จอง สระว่ายน้ำ' }))
    await user.click(within(screen.getByRole('dialog', { name: 'เปิด สระว่ายน้ำ ให้จอง' })).getByRole('button', { name: 'เปิดให้จอง' }))
    expect(await screen.findByRole('button', { name: 'ปิดชั่วคราว สระว่ายน้ำ' })).toBeInTheDocument()
  })

  it('refuses a note over 300 characters with a message and focus, and the api is not called', async () => {
    const user = userEvent.setup()
    const { api } = await setup()
    const set = vi.spyOn(api, 'setFacilityClosed')
    await user.click(screen.getByRole('button', { name: 'ปิดชั่วคราว ฟิตเนส' }))
    const dialog = screen.getByRole('dialog', { name: 'ปิด ฟิตเนส ชั่วคราว' })
    const note = within(dialog).getByLabelText(/หมายเหตุการปิด/)
    await user.click(note)
    await user.paste('x'.repeat(301))
    await user.click(within(dialog).getByRole('button', { name: 'ปิดชั่วคราว' }))
    expect(set).not.toHaveBeenCalled()
    expect(note).toHaveAttribute('aria-invalid', 'true')
    expect(note).toHaveFocus()
  })

  it('a tenant cannot book a facility that was closed', async () => {
    const user = userEvent.setup()
    const { api, data } = await setup()
    const pool = data.facilities.find((f) => f.key === 'pool')!
    await user.click(screen.getByRole('button', { name: 'ปิดชั่วคราว สระว่ายน้ำ' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ปิดชั่วคราว' }))
    await screen.findByRole('button', { name: 'เปิดให้จอง สระว่ายน้ำ' })
    const e = await api.createBooking({ facilityId: pool.id, date: addDays(TEST_TODAY, 12), startHour: 9, endHour: 10, people: 1, tenantPhone: '0810000001', tenantName: 'x' }).catch((x: FacilitiesError) => x)
    expect((e as FacilitiesError).code).toBe('closed')
  })
})

describe('?booking= (from a notification)', () => {
  it('opens any booking and clears the address when it is closed', async () => {
    const t = makeTestFacilities()
    const b = (await t.facilities.load()).bookings[2]
    await setup({ route: `/juristic/parcels-bookings?booking=${b.id}` })
    expect(screen.getByRole('dialog', { name: `การจอง ${b.code}` })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/juristic\/parcels-bookings$/)
  })

  it('ignores a booking that does not exist without breaking, and clears the address', async () => {
    await setup({ route: '/juristic/parcels-bookings?booking=ghost' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/juristic\/parcels-bookings$/)
  })
})

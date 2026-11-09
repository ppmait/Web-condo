import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEMO_TENANT_PHONE } from '../../auth/demoAccounts'
import { FacilitiesError } from '../../facilities/types'
import i18n from '../../i18n'
import { addDays } from '../../property/dates'
import { renderFacilities } from '../../test/renderFacilities'
import { TEST_TODAY } from '../../test/renderProperty'
import { makeTestFacilities } from '../../test/testFacilities'
import BookingFormModal from './BookingFormModal'

afterEach(async () => {
  vi.restoreAllMocks()
  await i18n.changeLanguage('th')
})

const day = (n: number) => addDays(TEST_TODAY, n)

async function open(props: { facilityId?: string; date?: string } = {}) {
  const { facilities, property } = makeTestFacilities()
  const onClose = vi.fn()
  await renderFacilities(<BookingFormModal {...props} onClose={onClose} />, { api: facilities, property, as: 'tenant' })
  const data = await facilities.load()
  return { api: facilities, data, onClose, dialog: screen.getByRole('dialog') }
}

const fields = (dialog: HTMLElement) => ({
  facility: within(dialog).getByLabelText('ส่วนกลาง'),
  date: within(dialog).getByLabelText('วันที่ใช้บริการ'),
  start: within(dialog).getByLabelText(/เวลาเริ่ม/),
  hours: within(dialog).getByLabelText('จำนวนชั่วโมง'),
  people: within(dialog).getByLabelText(/จำนวนผู้ใช้/),
  submit: within(dialog).getByRole('button', { name: 'ส่งคำขอจอง' }),
})

const set = async (user: ReturnType<typeof userEvent.setup>, el: HTMLElement, value: string) => {
  await user.clear(el)
  if (value) await user.type(el, value)
}

/** fills the form with a good request (12 days ahead: a different week from the sample bookings) */
async function fill(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, data: Awaited<ReturnType<typeof open>>['data'], over: { date?: string; start?: string; hours?: string; people?: string } = {}) {
  const f = fields(dialog)
  await user.selectOptions(f.facility, data.facilities.find((x) => x.key === 'meeting')!.id)
  await set(user, f.date, over.date ?? day(12))
  await set(user, f.start, over.start ?? '9')
  await set(user, f.hours, over.hours ?? '2')
  await set(user, f.people, over.people ?? '3')
}

describe('BookingFormModal: checking before sending', () => {
  it('sends nothing when the form is empty: the required message, the fields marked, the focus on the first', async () => {
    const user = userEvent.setup()
    const { api, dialog } = await open()
    const create = vi.spyOn(api, 'createBooking')
    await user.click(fields(dialog).submit)
    expect(create).not.toHaveBeenCalled()
    expect(within(dialog).getByText('กรุณากรอกข้อมูลให้ครบถ้วน')).toBeInTheDocument()
    expect(fields(dialog).facility).toHaveAttribute('aria-invalid', 'true')
    expect(fields(dialog).date).toHaveAttribute('aria-invalid', 'true')
    expect(fields(dialog).facility).toHaveFocus()
    // the time can only be judged against the opening hours of a facility: once one is chosen an empty start is marked too
    await user.selectOptions(fields(dialog).facility, within(dialog).getAllByRole('option')[1])
    await user.click(fields(dialog).submit)
    expect(fields(dialog).start).toHaveAttribute('aria-invalid', 'true')
    expect(fields(dialog).date).toHaveFocus()
  })

  it.each([
    ['today', () => day(0)],
    ['yesterday', () => day(-1)],
    ['15 days ahead', () => day(15)],
  ])('refuses the date %s with a message under the field, and the api is not called', async (_name, date) => {
    const user = userEvent.setup()
    const { api, dialog, data } = await open()
    const create = vi.spyOn(api, 'createBooking')
    await fill(user, dialog, data, { date: date() })
    await user.click(fields(dialog).submit)
    expect(create).not.toHaveBeenCalled()
    expect(fields(dialog).date).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialog).getByText('เลือกวันที่ตั้งแต่พรุ่งนี้ถึง 14 วันข้างหน้า')).toBeInTheDocument()
  })

  it.each([
    ['starts before opening', { start: '6', hours: '1' }], // the meeting room opens at 8
    ['ends after closing', { start: '19', hours: '2' }], // and closes at 20
    ['is longer than three hours', { start: '9', hours: '4' }],
    ['has no hours', { start: '9', hours: '0' }],
  ])('refuses a time that %s', async (_name, over) => {
    const user = userEvent.setup()
    const { api, dialog, data } = await open()
    const create = vi.spyOn(api, 'createBooking')
    await fill(user, dialog, data, over)
    await user.click(fields(dialog).submit)
    expect(create).not.toHaveBeenCalled()
    expect(fields(dialog).start).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialog).getByText('เลือกช่วงเวลาที่อยู่ในเวลาเปิดและไม่เกิน 3 ชั่วโมง')).toBeInTheDocument()
  })

  it.each([['0'], ['6'], ['2.5']])('refuses %s people', async (people) => {
    const user = userEvent.setup()
    const { api, dialog, data } = await open()
    const create = vi.spyOn(api, 'createBooking')
    await fill(user, dialog, data, { people })
    await user.click(fields(dialog).submit)
    expect(create).not.toHaveBeenCalled()
    expect(fields(dialog).people).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialog).getByText('จำนวนผู้ใช้ต้องเป็น 1–5 คน')).toBeInTheDocument()
  })

  it('clears a field error as soon as that field is edited', async () => {
    const user = userEvent.setup()
    const { dialog } = await open()
    await user.click(fields(dialog).submit)
    await user.selectOptions(fields(dialog).facility, within(dialog).getAllByRole('option')[1])
    expect(fields(dialog).facility).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('offers only the facilities that are open', async () => {
    const { dialog } = await open()
    const names = within(dialog).getAllByRole('option').map((o) => o.textContent)
    expect(names).toEqual(expect.arrayContaining(['สระว่ายน้ำ', 'ฟิตเนส', 'ห้องประชุม']))
    expect(names).not.toContain('ลานบาร์บีคิว')
  })

  it('starts on the facility and the day it was opened from', async () => {
    const { data, dialog } = await open({ facilityId: undefined, date: day(2) })
    expect(fields(dialog).date).toHaveValue(day(2))
    expect(data.facilities.length).toBe(4)
  })

  it('shows how many places are free for the chosen slot, as numbers', async () => {
    const user = userEvent.setup()
    const { dialog, data } = await open()
    const pool = data.facilities.find((f) => f.key === 'pool')!
    await user.selectOptions(fields(dialog).facility, pool.id)
    await set(user, fields(dialog).date, day(2))
    await set(user, fields(dialog).start, '9')
    await set(user, fields(dialog).hours, '3')
    // the sample data holds 5 people in the pool on that day from 9 to 12
    expect(within(dialog).getByText('ที่ว่างในช่วงนี้: 15 คน')).toBeInTheDocument()
    await set(user, fields(dialog).start, '13')
    expect(within(dialog).getByText('ที่ว่างในช่วงนี้: 20 คน')).toBeInTheDocument()
  })
})

describe('BookingFormModal: sending', () => {
  it('sends a good request once, with who is asking, then closes', async () => {
    const user = userEvent.setup()
    const { api, dialog, data, onClose } = await open()
    const create = vi.spyOn(api, 'createBooking')
    await fill(user, dialog, data)
    await user.click(fields(dialog).submit)
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith({
      facilityId: data.facilities.find((f) => f.key === 'meeting')!.id,
      date: day(12),
      startHour: 9,
      endHour: 11,
      people: 3,
      tenantPhone: DEMO_TENANT_PHONE,
      tenantName: 'สมชาย ผู้เช่า',
    })
    expect((await api.load()).bookings.at(-1)).toMatchObject({ status: 'pending', startHour: 9, endHour: 11, people: 3 })
  })

  it('calls the api once when send is pressed twice quickly, and disables the button meanwhile', async () => {
    const user = userEvent.setup()
    const { api, dialog, data, onClose } = await open()
    const original = api.createBooking.bind(api)
    let release!: () => void
    const create = vi.spyOn(api, 'createBooking').mockImplementation((i) => new Promise((resolve) => (release = () => resolve(original(i)))))
    await fill(user, dialog, data)
    await user.click(fields(dialog).submit)
    await user.click(fields(dialog).submit)
    expect(create).toHaveBeenCalledTimes(1)
    expect(fields(dialog).submit).toBeDisabled()
    release()
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it.each([
    ['no_capacity', 'ช่วงเวลานี้ที่ว่างไม่พอสำหรับจำนวนผู้ใช้ที่ขอ'],
    ['quota_exceeded', 'ห้องของคุณจองครบ 2 ครั้งในสัปดาห์นี้แล้ว'],
    ['closed', 'ส่วนกลางนี้ปิดปรับปรุงชั่วคราว'],
    ['no_lease', 'บัญชีนี้ยังไม่มีสัญญาเช่าที่ใช้งานอยู่'],
    ['storage_failed', 'บันทึกไม่ได้เพราะพื้นที่เก็บข้อมูลในเบราว์เซอร์เต็ม'],
  ] as const)('shows the message for %s, keeps what was typed and stays open', async (code, text) => {
    const user = userEvent.setup()
    const { api, dialog, data, onClose } = await open()
    vi.spyOn(api, 'createBooking').mockRejectedValueOnce(new FacilitiesError(code))
    await fill(user, dialog, data)
    await user.click(fields(dialog).submit)
    expect(await within(dialog).findByText(new RegExp(text))).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(fields(dialog).start).toHaveValue(9)
    expect(fields(dialog).submit).toBeEnabled()
  })

  it('shows the real quota message when the unit has used both places of that week', async () => {
    const user = userEvent.setup()
    const { dialog, data, onClose } = await open()
    // the sample data holds two active bookings of the demo unit in the week of the 10th and 11th
    await fill(user, dialog, data, { date: day(4) })
    await user.click(fields(dialog).submit)
    expect(await within(dialog).findByText('ห้องของคุณจองครบ 2 ครั้งในสัปดาห์นี้แล้ว')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows a general message for an unexpected failure and lets the user try again', async () => {
    const user = userEvent.setup()
    const { api, dialog, data, onClose } = await open()
    vi.spyOn(api, 'createBooking').mockRejectedValueOnce(new Error('boom'))
    await fill(user, dialog, data)
    await user.click(fields(dialog).submit)
    expect(await within(dialog).findByText('ส่งคำขอจองไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')).toBeInTheDocument()
    await user.click(fields(dialog).submit)
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('shows the labels in English', async () => {
    await i18n.changeLanguage('en')
    await open()
    expect(screen.getByRole('dialog', { name: 'Book a facility' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send booking request' })).toBeInTheDocument()
  })
})

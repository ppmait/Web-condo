import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n'
import { formatDate } from '../../lib/format'
import { addDays } from '../../property/dates'
import { makeSeed } from '../../property/seed'
import { makeTestApi, renderProperty, TEST_TODAY } from '../../test/renderProperty'
import LeasesTab from './LeasesTab'

function LocationProbe() {
  const { pathname, search } = useLocation()
  return <span data-testid="location">{pathname + search}</span>
}

const renderTab = (api = makeTestApi()) =>
  renderProperty(
    <>
      <LeasesTab />
      <LocationProbe />
    </>,
    { api },
  )

afterEach(async () => {
  vi.restoreAllMocks()
  await i18n.changeLanguage('th')
})

const dataRows = () => screen.getAllByRole('row').slice(1)
const unitsShown = () => dataRows().map((r) => within(r).getAllByRole('cell')[0].textContent)
const rowOf = (code: string) => dataRows().find((r) => within(r).getAllByRole('cell')[0].textContent === code)!

async function openCreate() {
  await userEvent.click(screen.getByRole('button', { name: 'สร้างสัญญาเช่า' }))
  return screen.getByRole('dialog', { name: 'สร้างสัญญาเช่า' })
}

async function fillLease(dialog: HTMLElement, v: { unit?: string; name?: string; phone?: string; start?: string; end?: string; rent?: string; deposit?: string }) {
  const d = within(dialog)
  if (v.unit) await userEvent.selectOptions(d.getByLabelText('ห้อง'), v.unit)
  const set = async (label: string, value: string | undefined) => {
    if (value === undefined) return
    const input = d.getByLabelText(label)
    await userEvent.clear(input)
    if (value) await userEvent.type(input, value)
  }
  await set('ชื่อผู้เช่า', v.name)
  await set('เบอร์โทรผู้เช่า', v.phone)
  await set('วันเริ่มสัญญา', v.start)
  await set('วันสิ้นสุดสัญญา', v.end)
  await set('ค่าเช่าต่อเดือน (บาท)', v.rent)
  await set('เงินมัดจำ (บาท)', v.deposit)
}

const FUTURE_START = addDays(TEST_TODAY, 1000)
const FUTURE_END = addDays(TEST_TODAY, 1365)

describe('LeasesTab list', () => {
  it('shows every sample lease sorted by unit, with a status badge that has text', async () => {
    await renderTab()
    expect(unitsShown()).toEqual(['A-0502', 'A-0802', 'A-1204', 'A-1205', 'A-1902', 'B-0801', 'B-0802', 'B-1201', 'B-1601'])
    expect(within(rowOf('A-1204')).getByText('ใช้งาน')).toBeInTheDocument()
    expect(within(rowOf('A-0802')).getByText('หมดอายุ')).toBeInTheDocument()
    expect(within(rowOf('B-0802')).getByText('ยกเลิก')).toBeInTheDocument()
    expect(within(rowOf('B-1201')).getByText('ยังไม่เริ่ม')).toBeInTheDocument()
  })

  it('marks only the leases that are about to expire', async () => {
    await renderTab()
    const expiring = dataRows().filter((r) => within(r).queryByText('ใกล้หมดอายุ'))
    expect(expiring.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(['A-1204', 'A-1205'])
  })

  it.each([
    ['active', 5],
    ['upcoming', 1],
    ['ended', 2],
    ['cancelled', 1],
  ])('filters by status %s', async (value, count) => {
    await renderTab()
    await userEvent.selectOptions(screen.getByLabelText('สถานะ'), value)
    expect(dataRows()).toHaveLength(count)
  })

  it('shows the tenant, the period and the rent right-aligned with tabular figures', async () => {
    await renderTab()
    const seed = makeSeed(TEST_TODAY).leases.find((l) => l.id === 'l-1')!
    const row = rowOf('A-1204')
    expect(within(row).getByText('คุณอลิสา ชัยวงศ์')).toBeInTheDocument()
    expect(within(row).getByText(`${formatDate(seed.startDate, 'th')} – ${formatDate(seed.endDate, 'th')}`)).toBeInTheDocument()
    expect(within(row).getByText('฿18,000')).toHaveClass('text-right', 'tabular-nums')
    expect(screen.getByRole('table').parentElement).toHaveClass('overflow-x-auto')
  })

  it('shows dates with the Gregorian year in English', async () => {
    await i18n.changeLanguage('en')
    await renderTab()
    const seed = makeSeed(TEST_TODAY).leases.find((l) => l.id === 'l-1')!
    expect(within(rowOf('A-1204')).getByText(`${formatDate(seed.startDate, 'en')} – ${formatDate(seed.endDate, 'en')}`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New lease' })).toBeInTheDocument()
  })
})

describe('LeasesTab create', () => {
  it('only offers units that can be rented out', async () => {
    await renderTab()
    const dialog = await openCreate()
    const options = within(within(dialog).getByLabelText('ห้อง')).getAllByRole('option').map((o) => o.textContent)
    expect(options).toContain('A-0501')
    expect(options).not.toContain('A-0801') // owner-occupied
    expect(options).not.toContain('B-0302') // closed for renovation
  })

  it('fills in the list rent when a unit is chosen', async () => {
    await renderTab()
    const dialog = await openCreate()
    await userEvent.selectOptions(within(dialog).getByLabelText('ห้อง'), 'A-0501')
    expect(within(dialog).getByLabelText('ค่าเช่าต่อเดือน (บาท)')).toHaveValue(12000)
  })

  it('creates a lease that shows up in the list', async () => {
    await renderTab()
    const dialog = await openCreate()
    await fillLease(dialog, { unit: 'A-0501', name: 'คุณใหม่ ใจดี', phone: '0891234567', start: FUTURE_START, end: FUTURE_END, deposit: '24000' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'บันทึก' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(unitsShown()[0]).toBe('A-0501')
    expect(within(rowOf('A-0501')).getByText('คุณใหม่ ใจดี')).toBeInTheDocument()
    expect(within(rowOf('A-0501')).getByText('ยังไม่เริ่ม')).toBeInTheDocument()
  })

  it('shows an error under every invalid field, focuses the first and does not call the api', async () => {
    const api = makeTestApi()
    const create = vi.spyOn(api, 'createLease')
    await renderTab(api)
    const dialog = await openCreate()
    await userEvent.click(within(dialog).getByRole('button', { name: 'บันทึก' }))
    expect(create).not.toHaveBeenCalled()
    for (const label of ['ห้อง', 'ชื่อผู้เช่า', 'เบอร์โทรผู้เช่า', 'วันเริ่มสัญญา', 'วันสิ้นสุดสัญญา', 'ค่าเช่าต่อเดือน (บาท)']) {
      expect(within(dialog).getByLabelText(label)).toHaveAttribute('aria-invalid', 'true')
    }
    expect(within(dialog).getByLabelText('ห้อง')).toHaveFocus()
  })

  it('rejects a period that overlaps another lease of the unit, including one that starts on the day it ends', async () => {
    const api = makeTestApi()
    const create = vi.spyOn(api, 'createLease')
    await renderTab(api)
    const existing = makeSeed(TEST_TODAY).leases.find((l) => l.id === 'l-1')!
    const dialog = await openCreate()
    await fillLease(dialog, { unit: 'A-1204', name: 'คุณใหม่', phone: '0891234567', start: existing.endDate, end: addDays(existing.endDate, 365), rent: '18000', deposit: '0' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'บันทึก' }))
    expect(within(dialog).getByText('ช่วงสัญญานี้ซ้อนกับสัญญาอื่นของห้องนี้')).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('accepts a period that starts the day after another lease ends', async () => {
    await renderTab()
    const existing = makeSeed(TEST_TODAY).leases.find((l) => l.id === 'l-1')!
    const dialog = await openCreate()
    await fillLease(dialog, { unit: 'A-1204', name: 'คุณถัดไป', phone: '0891234567', start: addDays(existing.endDate, 1), end: addDays(existing.endDate, 366), rent: '18000', deposit: '0' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'บันทึก' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // both leases of the unit are listed, the newer one first
    expect(unitsShown().filter((c) => c === 'A-1204')).toHaveLength(2)
    expect(screen.getByText('คุณอลิสา ชัยวงศ์')).toBeInTheDocument()
    expect(screen.getByText('คุณถัดไป')).toBeInTheDocument()
  })

  it('rejects an end date on or before the start date', async () => {
    await renderTab()
    const dialog = await openCreate()
    await fillLease(dialog, { unit: 'A-0501', name: 'คุณใหม่', phone: '0891234567', start: FUTURE_END, end: FUTURE_START, rent: '12000', deposit: '0' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'บันทึก' }))
    expect(within(dialog).getByLabelText('วันสิ้นสุดสัญญา')).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialog).getByText(/วันที่ไม่ถูกต้อง หรือวันสิ้นสุดไม่อยู่หลังวันเริ่ม/)).toBeInTheDocument()
  })

  it('calls the api once when submitted twice while waiting', async () => {
    const api = makeTestApi()
    const original = api.createLease.bind(api)
    let release!: () => void
    const create = vi.spyOn(api, 'createLease').mockImplementation((input) => new Promise((resolve) => (release = () => resolve(original(input)))))
    await renderTab(api)
    const dialog = await openCreate()
    await fillLease(dialog, { unit: 'A-0501', name: 'คุณใหม่', phone: '0891234567', start: FUTURE_START, end: FUTURE_END, deposit: '0' })
    const save = within(dialog).getByRole('button', { name: 'บันทึก' })
    await userEvent.click(save)
    await userEvent.click(save)
    expect(create).toHaveBeenCalledTimes(1)
    expect(save).toBeDisabled()
    release()
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('LeasesTab edit', () => {
  it('fills the form with the current values and saves a change without clashing with itself', async () => {
    await renderTab()
    await userEvent.click(screen.getByRole('button', { name: 'แก้ไขสัญญา A-0502' }))
    const dialog = screen.getByRole('dialog', { name: 'แก้ไขสัญญาเช่า' })
    expect(within(dialog).getByLabelText('ชื่อผู้เช่า')).toHaveValue('คุณกมล วงศ์ดี')
    expect(within(dialog).getByLabelText('ห้อง')).toHaveValue(makeSeed(TEST_TODAY).units.find((u) => u.code === 'A-0502')!.id)
    await userEvent.clear(within(dialog).getByLabelText('ค่าเช่าต่อเดือน (บาท)'))
    await userEvent.type(within(dialog).getByLabelText('ค่าเช่าต่อเดือน (บาท)'), '13000')
    await userEvent.click(within(dialog).getByRole('button', { name: 'บันทึก' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(rowOf('A-0502')).getByText('฿13,000')).toBeInTheDocument()
  })

  it.each(['A-0802', 'B-0802'])('disables edit and cancel for the ended or cancelled lease of %s', async (code) => {
    await renderTab()
    expect(screen.getByRole('button', { name: `แก้ไขสัญญา ${code}` })).toBeDisabled()
    expect(screen.getByRole('button', { name: `ยกเลิกสัญญา ${code}` })).toBeDisabled()
  })
})

describe('LeasesTab cancel', () => {
  it('cancels an active lease after confirmation, with the reason, and locks it', async () => {
    const api = makeTestApi()
    await renderTab(api)
    await userEvent.click(screen.getByRole('button', { name: 'ยกเลิกสัญญา A-0502' }))
    const dialog = screen.getByRole('dialog', { name: 'ยกเลิกสัญญาเช่า' })
    await userEvent.type(within(dialog).getByLabelText('เหตุผล (ไม่บังคับ)'), '  ผู้เช่าย้ายออก  ')
    await userEvent.click(within(dialog).getByRole('button', { name: 'ยืนยันยกเลิกสัญญา' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(rowOf('A-0502')).getByText('ยกเลิก')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ยกเลิกสัญญา A-0502' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'แก้ไขสัญญา A-0502' })).toBeDisabled()
    const stored = (await api.load()).leases.find((l) => l.id === 'l-2')!
    expect(stored.cancelledAt).toBe(TEST_TODAY)
    expect(stored.cancelReason).toBe('ผู้เช่าย้ายออก')
  })

  it('does not cancel when the dialog is dismissed', async () => {
    const api = makeTestApi()
    const cancel = vi.spyOn(api, 'cancelLease')
    await renderTab(api)
    await userEvent.click(screen.getByRole('button', { name: 'ยกเลิกสัญญา A-0502' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ไม่ยกเลิก' }))
    expect(cancel).not.toHaveBeenCalled()
    expect(within(rowOf('A-0502')).getByText('ใช้งาน')).toBeInTheDocument()
  })

  it('confirms only once when pressed twice while waiting', async () => {
    const api = makeTestApi()
    const original = api.cancelLease.bind(api)
    let release!: () => void
    const cancel = vi.spyOn(api, 'cancelLease').mockImplementation((id, reason) => new Promise((resolve) => (release = () => resolve(original(id, reason)))))
    await renderTab(api)
    await userEvent.click(screen.getByRole('button', { name: 'ยกเลิกสัญญา A-0502' }))
    const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: 'ยืนยันยกเลิกสัญญา' })
    await userEvent.click(confirm)
    await userEvent.click(confirm)
    expect(cancel).toHaveBeenCalledTimes(1)
    release()
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('shows a message and keeps the dialog if the lease turns out to be locked', async () => {
    const api = makeTestApi()
    await renderTab(api)
    await userEvent.click(screen.getByRole('button', { name: 'ยกเลิกสัญญา A-0502' }))
    await api.cancelLease('l-2', 'ยกเลิกจากที่อื่น') // someone else cancels it first
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ยืนยันยกเลิกสัญญา' }))
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('แก้ไขหรือยกเลิกไม่ได้')
  })
})

describe('LeasesTab inspection shortcut', () => {
  it('goes to the move-in form for a lease that has no move-in yet', async () => {
    await renderTab()
    await userEvent.click(screen.getByRole('button', { name: 'บันทึกตรวจ A-1902' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/juristic/units/inspections?lease=l-7&type=moveIn')
  })

  it('goes to the move-out form when the move-in is already recorded', async () => {
    await renderTab()
    await userEvent.click(screen.getByRole('button', { name: 'บันทึกตรวจ A-1204' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/juristic/units/inspections?lease=l-1&type=moveOut')
  })

  it('is disabled when both inspections are recorded', async () => {
    await renderTab()
    expect(screen.getByRole('button', { name: 'บันทึกตรวจ B-0801' })).toBeDisabled()
  })
})

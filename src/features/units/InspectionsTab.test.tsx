import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n'
import { MemoryStorage } from '../../test/memoryStorage'
import { addDays } from '../../property/dates'
import { createLocalPropertyApi, PROPERTY_KEY } from '../../property/localPropertyApi'
import { makeSeed } from '../../property/seed'
import { makeTestApi, renderProperty, TEST_TODAY } from '../../test/renderProperty'
import InspectionsTab from './InspectionsTab'

function LocationProbe() {
  const { pathname, search } = useLocation()
  return <span data-testid="location">{pathname + search}</span>
}

const renderTab = (opts: { api?: ReturnType<typeof makeTestApi>; route?: string } = {}) =>
  renderProperty(
    <>
      <InspectionsTab />
      <LocationProbe />
    </>,
    { api: opts.api ?? makeTestApi(), route: opts.route ?? '/juristic/units/inspections' },
  )

afterEach(async () => {
  vi.restoreAllMocks()
  await i18n.changeLanguage('th')
})

const SEED = makeSeed(TEST_TODAY)
const leaseStart = (id: string) => SEED.leases.find((l) => l.id === id)!.startDate

const dataRows = () => screen.getAllByRole('row').slice(1)
const unitsShown = () => dataRows().map((r) => within(r).getAllByRole('cell')[0].textContent)

async function openCreate() {
  await userEvent.click(screen.getByRole('button', { name: 'บันทึกการตรวจ' }))
  return screen.getByRole('dialog', { name: 'บันทึกการตรวจสภาพห้อง' })
}

const group = (dialog: HTMLElement, name: string) => within(within(dialog).getByRole('group', { name }))

async function choose(dialog: HTMLElement, leaseLabel: string, type: 'ตรวจเข้า' | 'ตรวจออก') {
  await userEvent.selectOptions(within(dialog).getByLabelText('สัญญา'), leaseLabel)
  await userEvent.selectOptions(within(dialog).getByLabelText('ประเภทการตรวจ'), type)
}

async function setDate(dialog: HTMLElement, value: string) {
  const input = within(dialog).getByLabelText('วันที่ตรวจ')
  await userEvent.clear(input)
  await userEvent.type(input, value)
}

describe('InspectionsTab list', () => {
  it('lists the inspections newest first with the number of problems', async () => {
    await renderTab()
    expect(unitsShown()).toEqual(['B-0801', 'A-0502', 'B-0802', 'A-1204', 'A-1205', 'B-0801'])
    expect(within(dataRows()[0]).getByText('2 จุดไม่ปกติ')).toBeInTheDocument()
    expect(within(dataRows()[0]).getByText('ตรวจออก')).toBeInTheDocument()
    expect(within(dataRows()[1]).getByText('ปกติ')).toBeInTheDocument()
    expect(within(dataRows()[3]).getByText('1 จุดไม่ปกติ')).toBeInTheDocument()
  })

  it('filters by inspection type', async () => {
    await renderTab()
    await userEvent.selectOptions(screen.getByLabelText('กรองตามประเภท'), 'moveOut')
    expect(dataRows()).toHaveLength(1)
    expect(unitsShown()).toEqual(['B-0801'])
  })

  it('has no delete button and a table that scrolls sideways', async () => {
    await renderTab()
    expect(screen.queryByRole('button', { name: /ลบ/ })).not.toBeInTheDocument()
    expect(screen.getByRole('table').parentElement).toHaveClass('overflow-x-auto')
  })

  it('is in English when the language is English', async () => {
    await i18n.changeLanguage('en')
    await renderTab()
    expect(screen.getByRole('button', { name: 'Record inspection' })).toBeInTheDocument()
    expect(screen.getAllByText('Move-in').length).toBeGreaterThan(0)
  })
})

describe('InspectionsTab create', () => {
  it('records a move-in with the signed-in user as the default inspector', async () => {
    await renderTab()
    const dialog = await openCreate()
    expect(within(dialog).getAllByRole('group').length).toBeGreaterThanOrEqual(8)
    expect(within(dialog).getByLabelText('ผู้ตรวจ')).toHaveValue('สมหญิง นิติบุคคล')
    expect(within(dialog).getByLabelText('วันที่ตรวจ')).toHaveValue(TEST_TODAY)
    await choose(dialog, 'A-1902 — คุณปริญญา สุดใจ', 'ตรวจเข้า')
    await userEvent.click(within(dialog).getByRole('button', { name: 'บันทึก' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(dataRows()).toHaveLength(7)
    expect(unitsShown()[0]).toBe('A-1902')
  })

  it('does not offer a lease whose move-in and move-out are both recorded, and offers only the missing type', async () => {
    await renderTab()
    const dialog = await openCreate()
    const leaseOptions = within(within(dialog).getByLabelText('สัญญา')).getAllByRole('option').map((o) => o.textContent)
    expect(leaseOptions).not.toContain('B-0801 — คุณธนากร มีสุข')
    expect(leaseOptions).toContain('A-1204 — คุณอลิสา ชัยวงศ์')
    await userEvent.selectOptions(within(dialog).getByLabelText('สัญญา'), 'A-1204 — คุณอลิสา ชัยวงศ์')
    const typeOptions = within(within(dialog).getByLabelText('ประเภทการตรวจ')).getAllByRole('option').map((o) => o.textContent)
    expect(typeOptions).toEqual(['ตรวจออก'])
  })

  it('allows a move-out for a cancelled lease', async () => {
    await renderTab()
    const dialog = await openCreate()
    await choose(dialog, 'B-0802 — คุณชนาภร ทองคำ', 'ตรวจออก')
    await userEvent.click(within(dialog).getByRole('button', { name: 'บันทึก' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(dataRows()).toHaveLength(7)
  })

  it('requires a note for an item that is not ok: shows it under the field and focuses it', async () => {
    const api = makeTestApi()
    const save = vi.spyOn(api, 'saveInspection')
    await renderTab({ api })
    const dialog = await openCreate()
    await choose(dialog, 'A-1902 — คุณปริญญา สุดใจ', 'ตรวจเข้า')
    await userEvent.selectOptions(group(dialog, 'ห้องครัว').getByLabelText('สภาพ'), 'damaged')
    await userEvent.click(within(dialog).getByRole('button', { name: 'บันทึก' }))
    expect(save).not.toHaveBeenCalled()
    expect(group(dialog, 'ห้องครัว').getByText('กรุณาระบุหมายเหตุสำหรับรายการที่ไม่ปกติ')).toBeInTheDocument()
    expect(group(dialog, 'ห้องครัว').getByLabelText('หมายเหตุ')).toHaveFocus()
  })

  it('saves an item with a problem once its note is filled in', async () => {
    await renderTab()
    const dialog = await openCreate()
    await choose(dialog, 'A-1902 — คุณปริญญา สุดใจ', 'ตรวจเข้า')
    await userEvent.selectOptions(group(dialog, 'ห้องน้ำ').getByLabelText('สภาพ'), 'damaged')
    await userEvent.type(group(dialog, 'ห้องน้ำ').getByLabelText('หมายเหตุ'), 'ก๊อกรั่ว')
    await userEvent.click(within(dialog).getByRole('button', { name: 'บันทึก' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(dataRows()[0]).getByText('1 จุดไม่ปกติ')).toBeInTheDocument()
  })

  it('rejects a move-in dated before the lease starts', async () => {
    await renderTab()
    const dialog = await openCreate()
    await choose(dialog, 'A-1902 — คุณปริญญา สุดใจ', 'ตรวจเข้า')
    await setDate(dialog, addDays(leaseStart('l-7'), -1))
    await userEvent.click(within(dialog).getByRole('button', { name: 'บันทึก' }))
    expect(within(dialog).getByLabelText('วันที่ตรวจ')).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialog).getByText(/วันที่ตรวจไม่ถูกต้อง/)).toBeInTheDocument()
  })

  it('rejects a move-out dated before the move-in', async () => {
    await renderTab()
    const dialog = await openCreate()
    await choose(dialog, 'A-1204 — คุณอลิสา ชัยวงศ์', 'ตรวจออก')
    await setDate(dialog, leaseStart('l-1'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'บันทึก' }))
    expect(within(dialog).getByLabelText('วันที่ตรวจ')).toHaveAttribute('aria-invalid', 'true')
  })

  it('rejects a negative meter reading but accepts empty meters', async () => {
    await renderTab()
    const dialog = await openCreate()
    await choose(dialog, 'A-1902 — คุณปริญญา สุดใจ', 'ตรวจเข้า')
    await userEvent.type(within(dialog).getByLabelText('เลขมิเตอร์น้ำ'), '-5')
    await userEvent.click(within(dialog).getByRole('button', { name: 'บันทึก' }))
    expect(within(dialog).getByText('เลขมิเตอร์ต้องเป็นตัวเลขไม่ติดลบ')).toBeInTheDocument()
    await userEvent.clear(within(dialog).getByLabelText('เลขมิเตอร์น้ำ'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'บันทึก' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('requires a lease and an inspector', async () => {
    await renderTab()
    const dialog = await openCreate()
    await userEvent.clear(within(dialog).getByLabelText('ผู้ตรวจ'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'บันทึก' }))
    expect(within(dialog).getByLabelText('สัญญา')).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialog).getByLabelText('ผู้ตรวจ')).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialog).getByLabelText('สัญญา')).toHaveFocus()
  })

  it('calls the api once when submitted twice while waiting', async () => {
    const api = makeTestApi()
    const original = api.saveInspection.bind(api)
    let release!: () => void
    const save = vi.spyOn(api, 'saveInspection').mockImplementation((input, id) => new Promise((resolve) => (release = () => resolve(original(input, id)))))
    await renderTab({ api })
    const dialog = await openCreate()
    await choose(dialog, 'A-1902 — คุณปริญญา สุดใจ', 'ตรวจเข้า')
    const button = within(dialog).getByRole('button', { name: 'บันทึก' })
    await userEvent.click(button)
    await userEvent.click(button)
    expect(save).toHaveBeenCalledTimes(1)
    expect(button).toBeDisabled()
    release()
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('disables the record button, with an explanation, when nothing is left to inspect', async () => {
    const data = makeSeed(TEST_TODAY)
    data.leases = data.leases.filter((l) => l.id === 'l-4')
    data.inspections = data.inspections.filter((i) => i.leaseId === 'l-4')
    const storage = new MemoryStorage()
    storage.setItem(PROPERTY_KEY, JSON.stringify(data))
    await renderTab({ api: createLocalPropertyApi({ storage, today: () => TEST_TODAY }) })
    const button = screen.getByRole('button', { name: 'บันทึกการตรวจ' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', expect.stringContaining('ตรวจเข้าและตรวจออกครบแล้ว'))
  })
})

describe('InspectionsTab edit', () => {
  it('opens an existing inspection with the lease and type fixed, and saves a change in place', async () => {
    await renderTab()
    await userEvent.click(screen.getByRole('button', { name: 'ดู/แก้ไขการตรวจ A-1204 (ตรวจเข้า)' }))
    const dialog = screen.getByRole('dialog', { name: 'การตรวจสภาพห้อง' })
    expect(within(dialog).getByLabelText('สัญญา')).toBeDisabled()
    expect(within(dialog).getByLabelText('ประเภทการตรวจ')).toBeDisabled()
    expect(group(dialog, 'ห้องน้ำ').getByLabelText('สภาพ')).toHaveValue('damaged')
    expect(group(dialog, 'ห้องน้ำ').getByLabelText('หมายเหตุ')).toHaveValue('ก๊อกอ่างล้างหน้ารั่วเล็กน้อย')
    await userEvent.clear(within(dialog).getByLabelText('ผู้ตรวจ'))
    await userEvent.type(within(dialog).getByLabelText('ผู้ตรวจ'), 'ผู้ตรวจใหม่')
    await userEvent.click(within(dialog).getByRole('button', { name: 'บันทึก' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(dataRows()).toHaveLength(6)
    expect(screen.getByText('ผู้ตรวจใหม่')).toBeInTheDocument()
  })
})

describe('InspectionsTab opened from the lease list (?lease=&type=)', () => {
  it('opens the form with the lease and type filled in, and clears the address after it is closed', async () => {
    await renderTab({ route: '/juristic/units/inspections?lease=l-7&type=moveIn' })
    const dialog = screen.getByRole('dialog', { name: 'บันทึกการตรวจสภาพห้อง' })
    expect(within(dialog).getByLabelText('สัญญา')).toHaveValue('l-7')
    expect(within(dialog).getByLabelText('ประเภทการตรวจ')).toHaveValue('moveIn')
    expect(screen.getByTestId('location')).toHaveTextContent('?lease=l-7&type=moveIn')
    await userEvent.click(within(dialog).getByRole('button', { name: 'ยกเลิก' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/juristic\/units\/inspections$/)
  })

  it('clears the address after saving too, and shows the new inspection', async () => {
    await renderTab({ route: '/juristic/units/inspections?lease=l-7&type=moveIn' })
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'บันทึก' }))
    // saving is asynchronous: wait for the result instead of looking at the screen at once
    // generous timeout: the whole suite runs in parallel and a busy machine can make the save take longer
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), { timeout: 4000 })
    await vi.waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/juristic\/units\/inspections$/), { timeout: 4000 })
    await vi.waitFor(() => expect(dataRows()).toHaveLength(7), { timeout: 4000 })
  })

  it.each([
    ['an unknown lease', '?lease=ghost&type=moveIn'],
    ['a type that is already recorded', '?lease=l-1&type=moveIn'],
    ['an unknown type', '?lease=l-7&type=bogus'],
    ['a missing type', '?lease=l-7'],
  ])('ignores %s without breaking', async (_name, search) => {
    await renderTab({ route: `/juristic/units/inspections${search}` })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(dataRows()).toHaveLength(6)
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/juristic\/units\/inspections$/)
  })
})

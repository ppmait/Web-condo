import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n'
import type { Unit } from '../../property/types'
import { makeTestApi, renderProperty } from '../../test/renderProperty'
import UnitsTab from './UnitsTab'

afterEach(async () => {
  vi.restoreAllMocks()
  await i18n.changeLanguage('th')
})

const dataRows = () => screen.getAllByRole('row').slice(1)
const codesShown = () => dataRows().map((r) => within(r).getAllByRole('cell')[0].textContent)
const search = () => screen.getByLabelText('ค้นหา')

async function openCreate() {
  await userEvent.click(screen.getByRole('button', { name: 'เพิ่มห้องชุด' }))
  return screen.getByRole('dialog', { name: 'เพิ่มห้องชุด' })
}

async function fillUnit(dialog: HTMLElement, v: Partial<Record<'code' | 'floor' | 'area' | 'owner' | 'rent', string>>) {
  const d = within(dialog)
  const set = async (label: string, value: string | undefined) => {
    if (value === undefined) return
    const input = d.getByLabelText(label)
    await userEvent.clear(input)
    if (value) await userEvent.type(input, value)
  }
  await set('รหัสห้อง', v.code)
  await set('ชั้น', v.floor)
  await set('ขนาด (ตร.ม.)', v.area)
  await set('ชื่อเจ้าของ', v.owner)
  await set('ค่าเช่าตั้งต้น (บาท)', v.rent)
}

describe('UnitsTab list', () => {
  it('shows the first 10 units sorted by code, with a pager', async () => {
    await renderProperty(<UnitsTab />)
    expect(dataRows()).toHaveLength(10)
    expect(codesShown()[0]).toBe('A-0501')
    expect(codesShown()[9]).toBe('A-1902')
    expect(screen.getByText('หน้า 1 จาก 3')).toBeInTheDocument()
  })

  it('goes to the next pages', async () => {
    await renderProperty(<UnitsTab />)
    await userEvent.click(screen.getByRole('button', { name: 'ถัดไป' }))
    expect(codesShown()[0]).toBe('A-2001')
    await userEvent.click(screen.getByRole('button', { name: 'ถัดไป' }))
    expect(dataRows()).toHaveLength(4)
    expect(codesShown()[0]).toBe('B-2101')
    expect(screen.getByRole('button', { name: 'ถัดไป' })).toBeDisabled()
  })

  it('searches by code (any case, spaces trimmed) and returns to page 1', async () => {
    await renderProperty(<UnitsTab />)
    await userEvent.click(screen.getByRole('button', { name: 'ถัดไป' }))
    await userEvent.type(search(), '  a-12 ')
    expect(codesShown()).toEqual(['A-1201', 'A-1202', 'A-1204', 'A-1205'])
    expect(screen.queryByText(/หน้า \d+ จาก/)).not.toBeInTheDocument()
  })

  it('searches by owner name', async () => {
    await renderProperty(<UnitsTab />)
    await userEvent.type(search(), 'รินทร์')
    expect(codesShown()).toEqual(['A-1204'])
  })

  it('filters by tower', async () => {
    await renderProperty(<UnitsTab />)
    await userEvent.selectOptions(screen.getByLabelText('อาคาร'), 'B')
    expect(screen.getByText('หน้า 1 จาก 2')).toBeInTheDocument()
    expect(codesShown().every((c) => c?.startsWith('B-'))).toBe(true)
  })

  it.each([
    ['rented', 'มีผู้เช่า', 5],
    ['vacant', 'ว่าง', 10],
    ['ownerOccupied', 'เจ้าของอยู่เอง', 6],
    ['closed', 'ปิดปรับปรุง', 1],
  ])('filters by status %s and shows a badge with text', async (value, label, firstPageCount) => {
    await renderProperty(<UnitsTab />)
    await userEvent.selectOptions(screen.getByLabelText('สถานะ'), value)
    expect(dataRows()).toHaveLength(firstPageCount)
    for (const row of dataRows()) expect(within(row).getByText(label)).toBeInTheDocument()
  })

  it('shows "no data" and no pager when nothing matches', async () => {
    await renderProperty(<UnitsTab />)
    await userEvent.type(search(), 'zzz')
    expect(screen.getByText('ไม่มีข้อมูล')).toBeInTheDocument()
    expect(screen.queryByText(/หน้า \d+ จาก/)).not.toBeInTheDocument()
  })

  it('shows the rent right-aligned with tabular figures, inside a table that scrolls sideways', async () => {
    await renderProperty(<UnitsTab />)
    const cell = screen.getAllByText('฿12,000')[0]
    expect(cell).toHaveClass('text-right', 'tabular-nums')
    expect(screen.getByRole('table').parentElement).toHaveClass('overflow-x-auto')
  })

  it('is in English when the language is English', async () => {
    await i18n.changeLanguage('en')
    await renderProperty(<UnitsTab />)
    expect(screen.getByRole('button', { name: 'Add unit' })).toBeInTheDocument()
    expect(screen.getAllByText('Vacant').length).toBeGreaterThan(0)
  })
})

describe('UnitsTab create', () => {
  it('adds a unit that then shows up in the list', async () => {
    await renderProperty(<UnitsTab />)
    const dialog = await openCreate()
    await fillUnit(dialog, { code: 'c-0101', floor: '1', area: '30', owner: 'คุณสมมติ', rent: '10000' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'บันทึก' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.type(search(), 'c-0101')
    expect(codesShown()).toEqual(['C-0101'])
  })

  it('shows an error under every invalid field, focuses the first one and does not call the api', async () => {
    const api = makeTestApi()
    const create = vi.spyOn(api, 'createUnit')
    await renderProperty(<UnitsTab />, { api })
    const dialog = await openCreate()
    await userEvent.click(within(dialog).getByRole('button', { name: 'บันทึก' }))
    expect(create).not.toHaveBeenCalled()
    for (const label of ['รหัสห้อง', 'ชั้น', 'ขนาด (ตร.ม.)', 'ชื่อเจ้าของ', 'ค่าเช่าตั้งต้น (บาท)']) {
      expect(within(dialog).getByLabelText(label)).toHaveAttribute('aria-invalid', 'true')
    }
    expect(within(dialog).getByLabelText('รหัสห้อง')).toHaveFocus()
    expect(within(dialog).getByText(/รหัสห้องต้องเป็นรูปแบบ/)).toBeInTheDocument()
  })

  it('shows a duplicate code under the code field', async () => {
    const api = makeTestApi()
    const create = vi.spyOn(api, 'createUnit')
    await renderProperty(<UnitsTab />, { api })
    const dialog = await openCreate()
    await fillUnit(dialog, { code: ' a-1204 ', floor: '1', area: '30', owner: 'คุณสมมติ', rent: '1' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'บันทึก' }))
    expect(within(dialog).getByText('รหัสห้องนี้ถูกใช้แล้ว')).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('clears a field error when that field is edited', async () => {
    await renderProperty(<UnitsTab />)
    const dialog = await openCreate()
    await userEvent.click(within(dialog).getByRole('button', { name: 'บันทึก' }))
    await userEvent.type(within(dialog).getByLabelText('ชื่อเจ้าของ'), 'ก')
    expect(within(dialog).getByLabelText('ชื่อเจ้าของ')).toHaveAttribute('aria-invalid', 'false')
    expect(within(dialog).getByLabelText('ชั้น')).toHaveAttribute('aria-invalid', 'true')
  })

  it('calls the api once when submitted twice while waiting, and disables the button', async () => {
    const api = makeTestApi()
    const original = api.createUnit.bind(api)
    let release!: () => void
    const create = vi.spyOn(api, 'createUnit').mockImplementation(
      (input) => new Promise((resolve) => (release = () => resolve(original(input)))),
    )
    await renderProperty(<UnitsTab />, { api })
    const dialog = await openCreate()
    await fillUnit(dialog, { code: 'C-0101', floor: '1', area: '30', owner: 'คุณสมมติ', rent: '10000' })
    const save = within(dialog).getByRole('button', { name: 'บันทึก' })
    await userEvent.click(save)
    await userEvent.click(save)
    expect(create).toHaveBeenCalledTimes(1)
    expect(save).toBeDisabled()
    release()
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('closes without saving on cancel', async () => {
    const api = makeTestApi()
    const create = vi.spyOn(api, 'createUnit')
    await renderProperty(<UnitsTab />, { api })
    const dialog = await openCreate()
    await userEvent.click(within(dialog).getByRole('button', { name: 'ยกเลิก' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })
})

describe('UnitsTab edit', () => {
  it('fills the form with the current values and saves a change', async () => {
    await renderProperty(<UnitsTab />)
    await userEvent.click(screen.getByRole('button', { name: 'แก้ไขห้อง A-0501' }))
    const dialog = screen.getByRole('dialog', { name: 'แก้ไขห้องชุด' })
    expect(within(dialog).getByLabelText('รหัสห้อง')).toHaveValue('A-0501')
    expect(within(dialog).getByLabelText('ชั้น')).toHaveValue(5)
    expect(within(dialog).getByLabelText('ชื่อเจ้าของ')).toHaveValue('คุณวรา ใจเย็น')
    await userEvent.clear(within(dialog).getByLabelText('ชื่อเจ้าของ'))
    await userEvent.type(within(dialog).getByLabelText('ชื่อเจ้าของ'), 'เจ้าของใหม่')
    await userEvent.click(within(dialog).getByRole('button', { name: 'บันทึก' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(screen.getAllByRole('row')[1]).getByText('เจ้าของใหม่')).toBeInTheDocument()
  })

  it('locks the code and use of a unit that has leases, but still saves other changes', async () => {
    await renderProperty(<UnitsTab />)
    await userEvent.click(screen.getByRole('button', { name: 'แก้ไขห้อง A-1204' }))
    const dialog = screen.getByRole('dialog', { name: 'แก้ไขห้องชุด' })
    expect(within(dialog).getByLabelText('รหัสห้อง')).toBeDisabled()
    expect(within(dialog).getByLabelText('การใช้งาน')).toBeDisabled()
    expect(within(dialog).getByText(/ห้องที่มีสัญญาแล้วแก้รหัสห้องและการใช้งานไม่ได้/)).toBeInTheDocument()
    await userEvent.clear(within(dialog).getByLabelText('ค่าเช่าตั้งต้น (บาท)'))
    await userEvent.type(within(dialog).getByLabelText('ค่าเช่าตั้งต้น (บาท)'), '19000')
    await userEvent.click(within(dialog).getByRole('button', { name: 'บันทึก' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getAllByText('฿19,000').length).toBeGreaterThan(0)
  })

  it('does not lock a unit without leases', async () => {
    await renderProperty(<UnitsTab />)
    await userEvent.click(screen.getByRole('button', { name: 'แก้ไขห้อง A-0501' }))
    expect(screen.getByLabelText('รหัสห้อง')).toBeEnabled()
    expect(screen.getByLabelText('การใช้งาน')).toBeEnabled()
  })
})

describe('UnitsTab delete', () => {
  it('deletes a unit without leases after confirmation', async () => {
    await renderProperty(<UnitsTab />)
    await userEvent.click(screen.getByRole('button', { name: 'ลบห้อง A-0501' }))
    const dialog = screen.getByRole('dialog', { name: 'ลบห้องชุด' })
    expect(within(dialog).getByText(/A-0501/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'ลบ' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.type(search(), 'a-0501')
    expect(screen.getByText('ไม่มีข้อมูล')).toBeInTheDocument()
  })

  it('does not delete when the confirmation is cancelled', async () => {
    const api = makeTestApi()
    const del = vi.spyOn(api, 'deleteUnit')
    await renderProperty(<UnitsTab />, { api })
    await userEvent.click(screen.getByRole('button', { name: 'ลบห้อง A-0501' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ยกเลิก' }))
    expect(del).not.toHaveBeenCalled()
    expect(codesShown()[0]).toBe('A-0501')
  })

  it('refuses to delete a unit that has leases: shows a message, keeps the dialog and the unit', async () => {
    await renderProperty(<UnitsTab />)
    await userEvent.click(screen.getByRole('button', { name: 'ลบห้อง A-1204' }))
    const dialog = screen.getByRole('dialog', { name: 'ลบห้องชุด' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'ลบ' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('ห้องนี้มีสัญญาอยู่ ลบไม่ได้')
    await userEvent.click(within(dialog).getByRole('button', { name: 'ยกเลิก' }))
    expect(codesShown()).toContain('A-1204')
  })

  it('confirms only once when pressed twice while waiting', async () => {
    const api = makeTestApi()
    const original = api.deleteUnit.bind(api)
    let release!: () => void
    const del = vi.spyOn(api, 'deleteUnit').mockImplementation((id: string) => new Promise<void>((resolve) => (release = () => resolve(original(id)))))
    await renderProperty(<UnitsTab />, { api })
    await userEvent.click(screen.getByRole('button', { name: 'ลบห้อง A-0501' }))
    const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: 'ลบ' })
    await userEvent.click(confirm)
    await userEvent.click(confirm)
    expect(del).toHaveBeenCalledTimes(1)
    release()
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('UnitsTab with the stored data', () => {
  it('shows a unit created in the api even though the list has several pages', async () => {
    const api = makeTestApi()
    const unit: Unit = await api.createUnit({
      code: 'Z-9999',
      floor: 9,
      areaSqm: 20,
      type: 'studio',
      ownerName: 'คุณท้ายตาราง',
      ownership: 'forRent',
      listRent: 9999,
      closed: false,
    })
    await renderProperty(<UnitsTab />, { api })
    await userEvent.type(search(), unit.code)
    expect(codesShown()).toEqual(['Z-9999'])
  })
})

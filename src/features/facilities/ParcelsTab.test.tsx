import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEMO_TENANT_PHONE } from '../../auth/demoAccounts'
import { FacilitiesError, type FacilitiesApi, type Parcel } from '../../facilities/types'
import i18n from '../../i18n'
import { formatDate } from '../../lib/format'
import { renderFacilities } from '../../test/renderFacilities'
import { TEST_TODAY } from '../../test/renderProperty'
import { makeTestFacilities } from '../../test/testFacilities'
import ParcelsTab from './ParcelsTab'

function LocationProbe() {
  const { pathname, search } = useLocation()
  return <span data-testid="location">{pathname + search}</span>
}

afterEach(async () => {
  vi.restoreAllMocks()
  await i18n.changeLanguage('th')
})

const NAME = 'สมหญิง นิติบุคคล'
const PLACE: Record<string, string> = { frontDesk: 'เคาน์เตอร์นิติบุคคล', locker: 'ตู้ล็อกเกอร์' }

async function setup(opts: { route?: string } = {}) {
  const pair = makeTestFacilities()
  const view = await renderFacilities(
    <>
      <ParcelsTab />
      <LocationProbe />
    </>,
    { api: pair.facilities, property: pair.property, as: 'juristic', route: opts.route ?? '/juristic/parcels-bookings/parcels' },
  )
  const data = await pair.facilities.load()
  const property = await pair.property.load()
  return { ...view, api: pair.facilities as FacilitiesApi, data, property }
}

const rowOf = (code: string) => screen.getByText(code).closest('tr') as HTMLElement
const dataRows = () => screen.getAllByRole('row').slice(1)
const pickupDialog = (p: Parcel) => screen.getByRole('dialog', { name: `รับพัสดุ ${p.code}` })
const formFields = (dialog: HTMLElement) => ({
  unit: within(dialog).getByLabelText('ห้อง'),
  carrier: within(dialog).getByLabelText('ขนส่ง'),
  tracking: within(dialog).getByLabelText(/เลขติดตาม/),
  location: within(dialog).getByLabelText('ที่วางพัสดุ'),
  submit: within(dialog).getByRole('button', { name: 'ลงทะเบียน' }),
})

async function openDetail(p: Parcel) {
  await userEvent.click(within(rowOf(p.code)).getByRole('button', { name: `ดูรายละเอียด ${p.code}` }))
  return screen.getByRole('dialog', { name: `พัสดุ ${p.code}` })
}

describe('ParcelsTab: the list', () => {
  it('lists every parcel with unit, tenant, carrier, tracking, place, status and the day it arrived, in a box that scrolls on its own', async () => {
    const { data } = await setup()
    expect(dataRows()).toHaveLength(data.parcels.length)
    for (const p of data.parcels) {
      const row = within(rowOf(p.code))
      expect(row.getByText(p.unitCode)).toBeInTheDocument()
      expect(row.getByText(p.tenantName)).toBeInTheDocument()
      expect(row.getByText(p.carrier)).toBeInTheDocument()
      expect(row.getByText(PLACE[p.location])).toBeInTheDocument()
      expect(row.getByText(formatDate(p.registeredAt, 'th'))).toBeInTheDocument()
      expect(row.getByText(p.status === 'waiting' ? 'รอรับ' : 'รับแล้ว')).toBeInTheDocument()
    }
    expect(screen.getAllByRole('table')[0].parentElement).toHaveClass('overflow-x-auto', 'relative')
  })

  it.each([
    ['รอรับ', 'waiting'],
    ['รับแล้ว', 'pickedUp'],
  ] as const)('filters by %s', async (label, status) => {
    const { data } = await setup()
    await userEvent.selectOptions(screen.getByLabelText('สถานะ'), label)
    expect(dataRows()).toHaveLength(data.parcels.filter((p) => p.status === status).length)
  })

  it('shows the labels and dates in English', async () => {
    await i18n.changeLanguage('en')
    const { data } = await setup()
    expect(screen.getByRole('button', { name: 'Register a parcel' })).toBeInTheDocument()
    expect(within(rowOf(data.parcels[0].code)).getByText(formatDate(data.parcels[0].registeredAt, 'en'))).toBeInTheDocument()
  })
})

describe('ParcelsTab: registering a parcel', () => {
  it('offers only the units that have an active lease, with the tenant’s name', async () => {
    const user = userEvent.setup()
    const { property } = await setup()
    await user.click(screen.getByRole('button', { name: 'ลงทะเบียนพัสดุ' }))
    const options = within(screen.getByRole('dialog')).getByLabelText('ห้อง').querySelectorAll('option')
    const active = property.leases.filter((l) => !l.cancelledAt && l.startDate <= TEST_TODAY && TEST_TODAY <= l.endDate)
    expect(options.length).toBe(active.length + 1) // plus the placeholder
    const labels = [...options].map((o) => o.textContent)
    for (const l of active) expect(labels.some((x) => x?.includes(property.units.find((u) => u.id === l.unitId)!.code) && x.includes(l.tenantName))).toBe(true)
    const ended = property.leases.find((l) => l.endDate < TEST_TODAY)!
    expect(labels.some((x) => x?.includes(property.units.find((u) => u.id === ended.unitId)!.code))).toBe(false)
  })

  it('registers a parcel once, shows it, and tells that unit’s tenant only', async () => {
    const user = userEvent.setup()
    const { api, data, property } = await setup()
    const register = vi.spyOn(api, 'registerParcel')
    const lease = property.leases.find((l) => l.tenantPhone === DEMO_TENANT_PHONE)!
    await user.click(screen.getByRole('button', { name: 'ลงทะเบียนพัสดุ' }))
    const dialog = screen.getByRole('dialog', { name: 'ลงทะเบียนพัสดุ' })
    const f = formFields(dialog)
    await user.selectOptions(f.unit, lease.unitId)
    await user.type(f.carrier, 'DHL Express')
    await user.type(f.tracking, 'DH999')
    await user.selectOptions(f.location, 'locker')
    await user.click(f.submit)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'ลงทะเบียนพัสดุ' })).not.toBeInTheDocument())
    expect(register).toHaveBeenCalledTimes(1)
    expect(register).toHaveBeenCalledWith({ unitId: lease.unitId, carrier: 'DHL Express', trackingNo: 'DH999', location: 'locker' }, NAME)
    const after = await api.load()
    const created = after.parcels.at(-1)!
    expect(created).toMatchObject({ status: 'waiting', tenantPhone: DEMO_TENANT_PHONE, carrier: 'DHL Express' })
    expect(within(rowOf(created.code)).getByText('DHL Express')).toBeInTheDocument()
    expect(after.notifications.slice(data.notifications.length)).toEqual([expect.objectContaining({ type: 'parcelArrived', refId: created.id, recipient: DEMO_TENANT_PHONE })])
  })

  it.each([
    ['nothing filled in', {}, ['unit', 'carrier']],
    ['a carrier of 41 characters', { unit: true, carrier: 'x'.repeat(41) }, ['carrier']],
    ['a tracking number of 41 characters', { unit: true, carrier: 'Kerry', tracking: 'x'.repeat(41) }, ['tracking']],
  ] as const)('refuses %s: messages under the fields, focus on the first, no api call', async (_name, over, marked) => {
    const user = userEvent.setup()
    const { api, property } = await setup()
    const register = vi.spyOn(api, 'registerParcel')
    await user.click(screen.getByRole('button', { name: 'ลงทะเบียนพัสดุ' }))
    const dialog = screen.getByRole('dialog', { name: 'ลงทะเบียนพัสดุ' })
    const f = formFields(dialog)
    if ('unit' in over) await user.selectOptions(f.unit, property.leases[0].unitId)
    if ('carrier' in over && over.carrier) {
      await user.click(f.carrier)
      await user.paste(over.carrier)
    }
    if ('tracking' in over && over.tracking) {
      await user.click(f.tracking)
      await user.paste(over.tracking)
    }
    await user.click(f.submit)
    expect(register).not.toHaveBeenCalled()
    for (const k of marked) expect(f[k]).toHaveAttribute('aria-invalid', 'true')
    expect(f[marked[0]]).toHaveFocus()
  })

  it('calls the api once when the button is pressed twice, and disables it meanwhile', async () => {
    const user = userEvent.setup()
    const { api, property } = await setup()
    const original = api.registerParcel.bind(api)
    let release!: () => void
    const register = vi.spyOn(api, 'registerParcel').mockImplementation((i, n) => new Promise((resolve) => (release = () => resolve(original(i, n)))))
    await user.click(screen.getByRole('button', { name: 'ลงทะเบียนพัสดุ' }))
    const f = formFields(screen.getByRole('dialog'))
    await user.selectOptions(f.unit, property.leases.find((l) => l.tenantPhone === DEMO_TENANT_PHONE)!.unitId)
    await user.type(f.carrier, 'Kerry')
    await user.click(f.submit)
    await user.click(f.submit)
    expect(register).toHaveBeenCalledTimes(1)
    expect(f.submit).toBeDisabled()
    release()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it.each([
    ['no_lease', /ห้องนี้ไม่มีผู้เช่าที่มีสัญญาใช้งานอยู่/],
    ['storage_failed', /พื้นที่เก็บข้อมูลในเบราว์เซอร์เต็ม/],
  ] as const)('shows the message for %s and keeps what was typed', async (code, text) => {
    const user = userEvent.setup()
    const { api, property } = await setup()
    vi.spyOn(api, 'registerParcel').mockRejectedValueOnce(new FacilitiesError(code))
    await user.click(screen.getByRole('button', { name: 'ลงทะเบียนพัสดุ' }))
    const dialog = screen.getByRole('dialog')
    const f = formFields(dialog)
    await user.selectOptions(f.unit, property.leases.find((l) => l.tenantPhone === DEMO_TENANT_PHONE)!.unitId)
    await user.type(f.carrier, 'Kerry')
    await user.click(f.submit)
    expect(await within(dialog).findByText(text)).toBeInTheDocument()
    expect(f.carrier).toHaveValue('Kerry')
    expect(f.submit).toBeEnabled()
  })
})

describe('ParcelsTab: marking a parcel picked up', () => {
  const waitingOf = (data: Awaited<ReturnType<typeof setup>>['data']) => data.parcels.find((p) => p.status === 'waiting')!

  it('asks with an optional note, then the parcel is picked up with the note kept as typed to the api', async () => {
    const user = userEvent.setup()
    const { api, data } = await setup()
    const p = waitingOf(data)
    const pick = vi.spyOn(api, 'markPickedUp')
    await user.click(within(await openDetail(p)).getByRole('button', { name: 'ทำเครื่องหมายว่ารับแล้ว' }))
    expect(pick).not.toHaveBeenCalled()
    await user.type(within(pickupDialog(p)).getByLabelText(/หมายเหตุ/), 'รับโดยญาติ')
    await user.click(within(pickupDialog(p)).getByRole('button', { name: 'ยืนยันว่ารับแล้ว' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: `รับพัสดุ ${p.code}` })).not.toBeInTheDocument())
    expect(pick).toHaveBeenCalledWith(p.id, 'รับโดยญาติ', NAME)
    await user.keyboard('{Escape}')
    expect(within(rowOf(p.code)).getByText('รับแล้ว')).toBeInTheDocument()
  })

  it('offers no button for a parcel that was already picked up', async () => {
    const { data } = await setup()
    const dialog = await openDetail(data.parcels.find((p) => p.status === 'pickedUp')!)
    expect(within(dialog).queryByRole('button', { name: 'ทำเครื่องหมายว่ารับแล้ว' })).not.toBeInTheDocument()
  })

  it('takes a note of 300 characters and refuses 301: message, focus, no api call', async () => {
    const user = userEvent.setup()
    const { api, data } = await setup()
    const p = waitingOf(data)
    const pick = vi.spyOn(api, 'markPickedUp')
    await user.click(within(await openDetail(p)).getByRole('button', { name: 'ทำเครื่องหมายว่ารับแล้ว' }))
    const note = within(pickupDialog(p)).getByLabelText(/หมายเหตุ/)
    await user.click(note)
    await user.paste('x'.repeat(301))
    await user.click(within(pickupDialog(p)).getByRole('button', { name: 'ยืนยันว่ารับแล้ว' }))
    expect(pick).not.toHaveBeenCalled()
    expect(note).toHaveAttribute('aria-invalid', 'true')
    expect(note).toHaveFocus()
    await user.clear(note)
    await user.click(note)
    await user.paste('x'.repeat(300))
    await user.click(within(pickupDialog(p)).getByRole('button', { name: 'ยืนยันว่ารับแล้ว' }))
    await waitFor(() => expect(pick).toHaveBeenCalledTimes(1))
  })

  it('says so and shows the new state when the parcel was already picked up in another tab', async () => {
    const user = userEvent.setup()
    const { api, data } = await setup()
    const p = waitingOf(data)
    await user.click(within(await openDetail(p)).getByRole('button', { name: 'ทำเครื่องหมายว่ารับแล้ว' }))
    await api.markPickedUp(p.id, '', 'อีกแท็บ')
    await user.click(within(pickupDialog(p)).getByRole('button', { name: 'ยืนยันว่ารับแล้ว' }))
    expect(await within(pickupDialog(p)).findByText(/ถูกทำเครื่องหมายไปแล้ว/)).toBeInTheDocument()
    await waitFor(() => expect(within(rowOf(p.code)).getByText('รับแล้ว')).toBeInTheDocument())
    expect((await api.load()).parcels.find((x) => x.id === p.id)!.history.filter((h) => h.status === 'pickedUp')).toHaveLength(1)
  })

  it('stacks the dialog on the detail without React warnings; Tab stays inside the top one and Escape closes only it', async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { data } = await setup()
    const p = waitingOf(data)
    await user.click(within(await openDetail(p)).getByRole('button', { name: 'ทำเครื่องหมายว่ารับแล้ว' }))
    const top = pickupDialog(p)
    for (let i = 0; i < 4; i++) {
      await user.tab()
      expect(top.contains(document.activeElement)).toBe(true)
    }
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: `รับพัสดุ ${p.code}` })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: `พัสดุ ${p.code}` })).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('?parcel= (from a notification)', () => {
  it('opens any parcel and clears the address when it is closed', async () => {
    const t = makeTestFacilities()
    const p = (await t.facilities.load()).parcels[1]
    await setup({ route: `/juristic/parcels-bookings/parcels?parcel=${p.id}` })
    expect(screen.getByRole('dialog', { name: `พัสดุ ${p.code}` })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/juristic\/parcels-bookings\/parcels$/)
  })

  it('ignores a parcel that does not exist without breaking, and clears the address', async () => {
    await setup({ route: '/juristic/parcels-bookings/parcels?parcel=ghost' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/juristic\/parcels-bookings\/parcels$/)
  })
})

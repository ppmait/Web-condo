import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Outlet, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n'
import { formatBaht } from '../../lib/format'
import { BILLING_KEY, createLocalBillingApi } from '../../billing/localBillingApi'
import { billable, previousReading, summarize } from '../../billing/rules'
import { makeBillingSeed } from '../../billing/seed'
import type { BillingApi, BillingData } from '../../billing/types'
import { MemoryStorage } from '../../test/memoryStorage'
import { renderBilling } from '../../test/renderBilling'
import { TEST_TODAY } from '../../test/renderProperty'
import { makeTestBilling } from '../../test/testBilling'
import ReadingsTab from './ReadingsTab'

afterEach(async () => {
  vi.restoreAllMocks()
  await i18n.changeLanguage('th')
})

const PERIOD = '2026-11'
const READ = 'เลขมิเตอร์ต้องเป็นจำนวนเต็มไม่ติดลบ'
const ORDER = 'เลขมิเตอร์ปัจจุบันต้องไม่น้อยกว่าเลขก่อนหน้า'

const harness = (period: string) => (
  <Routes>
    <Route element={<Outlet context={{ period }} />}>
      <Route path="*" element={<ReadingsTab />} />
    </Route>
  </Routes>
)

async function setup(opts: { period?: string; api?: BillingApi; property?: ReturnType<typeof makeTestBilling>['property'] } = {}) {
  const pair = makeTestBilling()
  const property = opts.property ?? pair.property
  const api = opts.api ?? pair.billing
  const view = await renderBilling(harness(opts.period ?? PERIOD), { api, property })
  const prop = await property.load()
  return { ...view, api, property, prop }
}

const rowOf = (code: string) => screen.getByRole('rowheader', { name: code }).closest('tr') as HTMLElement
const input = (meter: 'น้ำ' | 'ไฟ', field: 'ก่อนหน้า' | 'ปัจจุบัน', code: string) =>
  screen.getByLabelText(`${meter} ${field} ห้อง ${code}`) as HTMLInputElement
const saveButton = (code: string) => screen.getByRole('button', { name: `บันทึก ห้อง ${code}` })

/** the first billable unit of the period that still has no reading, with the previous reading it follows */
async function awaiting(api: BillingApi, prop: Awaited<ReturnType<typeof setup>>['prop'], period = PERIOD) {
  const data = await api.load()
  const entry = billable(prop, period).find(
    ({ unit }) => !data.readings.some((r) => r.unitId === unit.id && r.period === period) && previousReading(data.readings, unit.id, period),
  )!
  return { ...entry, data, prev: previousReading(data.readings, entry.unit.id, period)! }
}

/** seed data with everything about one unit removed, so that unit has never been read */
function storageWithoutUnit(unitId: string, property: Awaited<ReturnType<typeof setup>>['prop']) {
  const seed = makeBillingSeed(property, TEST_TODAY)
  const invoiceIds = new Set(seed.invoices.filter((i) => i.unitId === unitId).map((i) => i.id))
  const cut: BillingData = {
    ...seed,
    readings: seed.readings.filter((r) => r.unitId !== unitId),
    invoices: seed.invoices.filter((i) => i.unitId !== unitId),
    notifications: seed.notifications.filter((n) => !invoiceIds.has(n.invoiceId)),
  }
  const storage = new MemoryStorage()
  storage.setItem(BILLING_KEY, JSON.stringify(cut))
  return storage
}

describe('ReadingsTab: what is shown', () => {
  it('lists exactly the units billed in the period, with their tenants', async () => {
    const { prop } = await setup()
    const list = billable(prop, PERIOD)
    expect(list.length).toBeGreaterThan(0)
    expect(screen.getAllByRole('rowheader')).toHaveLength(list.length)
    for (const { unit, lease } of list) expect(within(rowOf(unit.code)).getByText(lease.tenantName)).toBeInTheDocument()
  })

  it('shows the previous reading from the period before, and the usage and amounts of a saved reading', async () => {
    const { api, prop } = await setup()
    const data = await api.load()
    const { unit } = billable(prop, PERIOD).find(({ unit }) => data.readings.some((r) => r.unitId === unit.id && r.period === PERIOD))!
    const reading = data.readings.find((r) => r.unitId === unit.id && r.period === PERIOD)!
    expect(input('น้ำ', 'ก่อนหน้า', unit.code).value).toBe(String(reading.waterPrev))
    expect(input('น้ำ', 'ปัจจุบัน', unit.code).value).toBe(String(reading.waterCurr))
    const row = within(rowOf(unit.code))
    expect(row.getByText(String(reading.waterCurr - reading.waterPrev))).toBeInTheDocument()
    expect(row.getAllByText(formatBaht((reading.waterCurr - reading.waterPrev) * data.rates.water)).length).toBeGreaterThan(0)
    expect(row.getByText(formatBaht(Math.floor(unit.areaSqm * data.rates.common + 0.5)))).toBeInTheDocument()
    expect(row.getByText('จดแล้ว')).toBeInTheDocument()
  })

  it('marks a unit without a reading as not yet read', async () => {
    const { api, prop } = await setup()
    const { unit } = await awaiting(api, prop)
    expect(within(rowOf(unit.code)).getByText('ยังไม่จด')).toBeInTheDocument()
  })

  it('says so, and disables issuing, when no unit is billed in the period', async () => {
    await setup({ period: '2020-01' })
    expect(screen.getByText('ไม่มีห้องที่ถูกเรียกเก็บในรอบนี้')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ออกใบแจ้งหนี้รอบนี้' })).toBeDisabled()
  })
})

describe('ReadingsTab: saving a reading', () => {
  it('saves a valid reading, takes the previous value from the period before, and shows usage and amounts', async () => {
    const user = userEvent.setup()
    const { api, prop } = await setup()
    const { unit, prev, data } = await awaiting(api, prop)
    const save = vi.spyOn(api, 'saveReading')
    await user.type(input('น้ำ', 'ปัจจุบัน', unit.code), String(prev.waterCurr + 10))
    await user.type(input('ไฟ', 'ปัจจุบัน', unit.code), String(prev.electricCurr + 100))
    expect(within(rowOf(unit.code)).getAllByText(formatBaht(10 * data.rates.water)).length).toBeGreaterThan(0)
    await user.click(saveButton(unit.code))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(save).toHaveBeenCalledWith({
      unitId: unit.id,
      period: PERIOD,
      waterPrev: prev.waterCurr,
      waterCurr: prev.waterCurr + 10,
      electricPrev: prev.electricCurr,
      electricCurr: prev.electricCurr + 100,
    })
    await waitFor(() => expect(within(rowOf(unit.code)).getByText('จดแล้ว')).toBeInTheDocument())
    const after = await api.load()
    expect(summarize(after, prop, PERIOD, TEST_TODAY).awaitingReadings).toBe(summarize(data, prop, PERIOD, TEST_TODAY).awaitingReadings - 1)
  })

  it('rejects a current value below the previous one: message under the field, focus there, no api call', async () => {
    const user = userEvent.setup()
    const { api, prop } = await setup()
    const { unit, prev } = await awaiting(api, prop)
    const save = vi.spyOn(api, 'saveReading')
    await user.type(input('น้ำ', 'ปัจจุบัน', unit.code), String(prev.waterCurr - 1))
    await user.type(input('ไฟ', 'ปัจจุบัน', unit.code), String(prev.electricCurr + 5))
    await user.click(saveButton(unit.code))
    expect(save).not.toHaveBeenCalled()
    const field = input('น้ำ', 'ปัจจุบัน', unit.code)
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveFocus()
    expect(within(rowOf(unit.code)).getByText(ORDER)).toBeInTheDocument()
    await user.type(field, '99999')
    expect(field).not.toHaveAttribute('aria-invalid', 'true')
  })

  it.each([['1.5'], ['-3'], ['abc'], ['']])('rejects the current value %j without calling the api', async (text) => {
    const user = userEvent.setup()
    const { api, prop } = await setup()
    const { unit, prev } = await awaiting(api, prop)
    const save = vi.spyOn(api, 'saveReading')
    if (text) await user.type(input('น้ำ', 'ปัจจุบัน', unit.code), text)
    await user.type(input('ไฟ', 'ปัจจุบัน', unit.code), String(prev.electricCurr + 5))
    await user.click(saveButton(unit.code))
    expect(save).not.toHaveBeenCalled()
    expect(input('น้ำ', 'ปัจจุบัน', unit.code)).toHaveAttribute('aria-invalid', 'true')
    expect(within(rowOf(unit.code)).getByText(READ)).toBeInTheDocument()
  })

  it('calls the api once when save is pressed twice quickly', async () => {
    const user = userEvent.setup()
    const { api, prop } = await setup()
    const { unit, prev } = await awaiting(api, prop)
    const original = api.saveReading.bind(api)
    let release!: () => void
    const save = vi.spyOn(api, 'saveReading').mockImplementation((r) => new Promise((resolve) => (release = () => resolve(original(r)))))
    await user.type(input('น้ำ', 'ปัจจุบัน', unit.code), String(prev.waterCurr + 1))
    await user.type(input('ไฟ', 'ปัจจุบัน', unit.code), String(prev.electricCurr + 1))
    await user.click(saveButton(unit.code))
    await user.click(saveButton(unit.code))
    expect(save).toHaveBeenCalledTimes(1)
    expect(saveButton(unit.code)).toBeDisabled()
    release()
    await waitFor(() => expect(within(rowOf(unit.code)).getByText('จดแล้ว')).toBeInTheDocument())
  })

  it('lets the previous value be typed only for a unit that was never read before', async () => {
    const user = userEvent.setup()
    const pair = makeTestBilling()
    const prop = await pair.property.load()
    const first = billable(prop, PERIOD)[0].unit
    const api = createLocalBillingApi({ storage: storageWithoutUnit(first.id, prop), today: () => TEST_TODAY, property: pair.property })
    await setup({ api, property: pair.property })
    expect(input('น้ำ', 'ก่อนหน้า', first.code)).toBeEnabled()
    const other = billable(prop, PERIOD).find(({ unit }) => unit.id !== first.id)!.unit
    expect(input('น้ำ', 'ก่อนหน้า', other.code)).toBeDisabled()
    const save = vi.spyOn(api, 'saveReading')
    await user.type(input('น้ำ', 'ก่อนหน้า', first.code), '50')
    await user.type(input('น้ำ', 'ปัจจุบัน', first.code), '60')
    await user.type(input('ไฟ', 'ก่อนหน้า', first.code), '500')
    await user.type(input('ไฟ', 'ปัจจุบัน', first.code), '620')
    await user.click(saveButton(first.code))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(save).toHaveBeenCalledWith({ unitId: first.id, period: PERIOD, waterPrev: 50, waterCurr: 60, electricPrev: 500, electricCurr: 620 })
  })
})

describe('ReadingsTab: rows that are locked', () => {
  it('locks a unit that already has an invoice for the period, and says why', async () => {
    const { prop } = await setup({ period: '2026-10' })
    const { unit } = billable(prop, '2026-10')[0]
    for (const [meter, field] of [['น้ำ', 'ปัจจุบัน'], ['ไฟ', 'ปัจจุบัน'], ['น้ำ', 'ก่อนหน้า']] as const) {
      expect(input(meter, field, unit.code)).toBeDisabled()
    }
    expect(within(rowOf(unit.code)).getByText('ออกบิลแล้ว')).toBeInTheDocument()
    expect(within(rowOf(unit.code)).getByText(/ออกใบแจ้งหนี้ของห้องนี้ในรอบนี้แล้ว/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: `บันทึก ห้อง ${unit.code}` })).not.toBeInTheDocument()
  })

  it('locks an older period that a newer reading already follows', async () => {
    const pair = makeTestBilling()
    const prop = await pair.property.load()
    const seed = makeBillingSeed(prop, TEST_TODAY)
    const unit = billable(prop, '2026-09')[0].unit
    const storage = new MemoryStorage()
    storage.setItem(
      BILLING_KEY,
      JSON.stringify({
        ...seed,
        invoices: seed.invoices.filter((i) => !(i.unitId === unit.id && i.period === '2026-09')),
        notifications: seed.notifications.filter((n) => !n.invoiceId.endsWith(`2026-09-${unit.id}`)),
      }),
    )
    const api = createLocalBillingApi({ storage, today: () => TEST_TODAY, property: pair.property })
    await setup({ api, property: pair.property, period: '2026-09' })
    expect(input('น้ำ', 'ปัจจุบัน', unit.code)).toBeDisabled()
    expect(within(rowOf(unit.code)).getByText(/แก้ได้เฉพาะเลขมิเตอร์ล่าสุดของห้อง/)).toBeInTheDocument()
  })
})

describe('ReadingsTab: issuing invoices', () => {
  const issueButton = () => screen.getByRole('button', { name: 'ออกใบแจ้งหนี้รอบนี้' })

  it('asks first, naming how many invoices will be issued and which units are skipped for having no reading', async () => {
    const user = userEvent.setup()
    const { api, prop } = await setup()
    const data = await api.load()
    const list = billable(prop, PERIOD)
    const missing = list.filter(({ unit }) => !data.readings.some((r) => r.unitId === unit.id && r.period === PERIOD)).map(({ unit }) => unit.code)
    const ready = list.length - missing.length
    const issue = vi.spyOn(api, 'issueInvoices')
    await user.click(issueButton())
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(`จะออกใบแจ้งหนี้ ${ready} ใบ`)).toBeInTheDocument()
    expect(within(dialog).getByText(new RegExp(`จะข้าม ${missing.length} ห้อง.*${missing[0]}`))).toBeInTheDocument()
    expect(issue).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'ยกเลิก' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(issue).not.toHaveBeenCalled()
  })

  it('issues invoices only for the units that have a reading, then reports the result', async () => {
    const user = userEvent.setup()
    const { api, prop } = await setup()
    const before = await api.load()
    const list = billable(prop, PERIOD)
    const missing = list.filter(({ unit }) => !before.readings.some((r) => r.unitId === unit.id && r.period === PERIOD)).length
    const ready = list.length - missing
    await user.click(issueButton())
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ออกใบแจ้งหนี้' }))
    expect(await screen.findByText(`ออก ${ready} ใบ ข้าม ${missing} ห้อง`)).toBeInTheDocument()
    const after = await api.load()
    expect(after.invoices.filter((i) => i.period === PERIOD)).toHaveLength(ready)
    await user.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: 'ปิด' }).at(-1)!)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(rowOf(list[0].unit.code)).getByText('ออกบิลแล้ว')).toBeInTheDocument()
  })

  it('calls the api once when the confirmation is pressed twice', async () => {
    const user = userEvent.setup()
    const { api } = await setup()
    const original = api.issueInvoices.bind(api)
    let release!: () => void
    const issue = vi.spyOn(api, 'issueInvoices').mockImplementation((p) => new Promise((resolve) => (release = () => resolve(original(p)))))
    await user.click(issueButton())
    const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: 'ออกใบแจ้งหนี้' })
    await user.click(confirm)
    await user.click(confirm)
    expect(issue).toHaveBeenCalledTimes(1)
    expect(confirm).toBeDisabled()
    release()
    expect(await screen.findByText(/^ออก \d+ ใบ/)).toBeInTheDocument()
  })

  it('does not create duplicates when the whole period was issued meanwhile (another tab)', async () => {
    const user = userEvent.setup()
    const { api } = await setup()
    await user.click(issueButton())
    await api.issueInvoices(PERIOD)
    const count = (await api.load()).invoices.length
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ออกใบแจ้งหนี้' }))
    expect(await screen.findByText(/^ออก 0 ใบ/)).toBeInTheDocument()
    expect((await api.load()).invoices).toHaveLength(count)
  })

  it('disables issuing once every unit that has a reading already has its invoice', async () => {
    const user = userEvent.setup()
    const { api } = await setup()
    await user.click(issueButton())
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ออกใบแจ้งหนี้' }))
    await screen.findByText(/^ออก \d+ ใบ/)
    await user.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: 'ปิด' }).at(-1)!)
    expect(issueButton()).toBeDisabled()
    expect((await api.load()).invoices.some((i) => i.period === PERIOD)).toBe(true)
  })

  it('shows a failure message when issuing fails, and lets the user try again', async () => {
    const user = userEvent.setup()
    const { api } = await setup()
    vi.spyOn(api, 'issueInvoices').mockRejectedValueOnce(new Error('boom'))
    await user.click(issueButton())
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ออกใบแจ้งหนี้' }))
    expect(await screen.findByText('ออกใบแจ้งหนี้ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'ออกใบแจ้งหนี้' })).toBeEnabled()
  })
})

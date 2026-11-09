import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n'
import { renderBilling } from '../../test/renderBilling'
import { makeTestBilling } from '../../test/testBilling'
import RatesTab from './RatesTab'

afterEach(async () => {
  vi.restoreAllMocks()
  await i18n.changeLanguage('th')
})

const ERROR = 'อัตราต้องเป็นจำนวนเต็มบาทมากกว่า 0'

async function setup() {
  const { billing, property } = makeTestBilling()
  await renderBilling(<RatesTab />, { api: billing, property })
  return { api: billing }
}

const field = (name: RegExp) => screen.getByLabelText(name) as HTMLInputElement
const replace = async (user: ReturnType<typeof userEvent.setup>, el: HTMLElement, value: string) => {
  await user.clear(el)
  if (value) await user.type(el, value)
}
const save = () => screen.getByRole('button', { name: 'บันทึกอัตรา' })

describe('RatesTab', () => {
  it('fills the form with the current rates and explains that issued invoices do not change', async () => {
    await setup()
    expect(field(/ค่าน้ำ/).value).toBe('18')
    expect(field(/ค่าไฟ/).value).toBe('7')
    expect(field(/ค่าส่วนกลาง/).value).toBe('60')
    expect(screen.getByText(/ใบแจ้งหนี้ที่ออกไปแล้วจะไม่เปลี่ยน/)).toBeInTheDocument()
  })

  it.each([['0'], ['-1'], ['1.5'], ['abc'], ['']])('rejects the water rate %j: message under the field, focus there, no api call', async (value) => {
    const user = userEvent.setup()
    const { api } = await setup()
    const saveRates = vi.spyOn(api, 'saveRates')
    await replace(user, field(/ค่าน้ำ/), value)
    await user.click(save())
    expect(saveRates).not.toHaveBeenCalled()
    expect(field(/ค่าน้ำ/)).toHaveAttribute('aria-invalid', 'true')
    expect(field(/ค่าน้ำ/)).toHaveFocus()
    expect(screen.getByText(ERROR)).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('saves valid rates, shows a success message, and the api now holds them', async () => {
    const user = userEvent.setup()
    const { api } = await setup()
    await replace(user, field(/ค่าน้ำ/), '20')
    await replace(user, field(/ค่าไฟ/), '8')
    await replace(user, field(/ค่าส่วนกลาง/), '70')
    await user.click(save())
    expect(await screen.findByText('บันทึกอัตราแล้ว')).toBeInTheDocument()
    expect((await api.load()).rates).toEqual({ water: 20, electric: 8, common: 70 })
  })

  it('removes the success message as soon as the user edits a field again', async () => {
    const user = userEvent.setup()
    await setup()
    await replace(user, field(/ค่าน้ำ/), '20')
    await user.click(save())
    await screen.findByText('บันทึกอัตราแล้ว')
    await user.type(field(/ค่าน้ำ/), '1')
    expect(screen.queryByText('บันทึกอัตราแล้ว')).not.toBeInTheDocument()
  })

  it('new invoices use the new rates while invoices already issued keep the old ones', async () => {
    const user = userEvent.setup()
    const { api } = await setup()
    const old = (await api.load()).invoices.find((i) => i.period === '2026-10')!
    await replace(user, field(/ค่าน้ำ/), '20')
    await user.click(save())
    await screen.findByText('บันทึกอัตราแล้ว')
    const result = await api.issueInvoices('2026-11')
    expect(result.issued.length).toBeGreaterThan(0)
    for (const i of result.issued) expect(i.water.rate).toBe(20)
    const kept = (await api.load()).invoices.find((i) => i.id === old.id)!
    expect(kept.water).toEqual(old.water)
    expect(kept.total).toBe(old.total)
  })

  it('calls the api once when save is pressed twice quickly, and disables the button meanwhile', async () => {
    const user = userEvent.setup()
    const { api } = await setup()
    const original = api.saveRates.bind(api)
    let release!: () => void
    const saveRates = vi.spyOn(api, 'saveRates').mockImplementation((r) => new Promise((resolve) => (release = () => resolve(original(r)))))
    await replace(user, field(/ค่าน้ำ/), '20')
    await user.click(save())
    await user.click(save())
    expect(saveRates).toHaveBeenCalledTimes(1)
    expect(save()).toBeDisabled()
    release()
    await waitFor(() => expect(screen.getByText('บันทึกอัตราแล้ว')).toBeInTheDocument())
  })

  it('shows a failure message when saving fails', async () => {
    const user = userEvent.setup()
    const { api } = await setup()
    vi.spyOn(api, 'saveRates').mockRejectedValueOnce(new Error('boom'))
    await replace(user, field(/ค่าน้ำ/), '20')
    await user.click(save())
    expect(await screen.findByText('บันทึกอัตราไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')).toBeInTheDocument()
  })

  it('shows the labels in English', async () => {
    await i18n.changeLanguage('en')
    await setup()
    expect(screen.getByLabelText(/Water rate/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save rates' })).toBeInTheDocument()
  })
})

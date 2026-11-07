import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import { todayISO } from '../../property/dates'
import { summarize } from '../../property/rules'
import { makeSeed } from '../../property/seed'
import type { PropertyApi, PropertyData } from '../../property/types'
import { makeTestApi } from '../../test/renderProperty'
import { renderApp } from '../../test/renderApp'
import InspectionsTab from './InspectionsTab'
import LeasesTab from './LeasesTab'
import UnitsPage from './UnitsPage'
import UnitsTab from './UnitsTab'

afterEach(async () => {
  await i18n.changeLanguage('th')
})

const sidebarLink = () => within(screen.getByRole('navigation', { name: 'เมนูหลัก' })).getByRole('link', { name: 'ห้องชุดและสัญญาเช่า' })
const tabs = () => within(screen.getByRole('navigation', { name: 'ส่วนของห้องชุดและสัญญา' }))

describe('UnitsPage (through the real routes)', () => {
  it('shows the four summary cards for the sample data', async () => {
    await renderApp('/juristic/units', { as: 'juristic' })
    const today = todayISO()
    const s = summarize(makeSeed(today), today)
    expect(screen.getByRole('heading', { level: 1, name: 'ห้องชุดและสัญญาเช่า' })).toBeInTheDocument()
    for (const [label, value] of [
      ['ห้องทั้งหมด', s.totalUnits],
      ['ห้องว่าง', s.vacantUnits],
      ['สัญญาใกล้หมดอายุ (60 วัน)', s.expiringLeases],
      ['รอตรวจเข้า', s.awaitingMoveIn],
    ] as const) {
      const card = (await screen.findByText(label)).closest('div') as HTMLElement
      expect(within(card).getByText(String(value))).toBeInTheDocument()
    }
  })

  it('has three tabs and marks the current one with aria-current', async () => {
    await renderApp('/juristic/units', { as: 'juristic' })
    expect(await tabs().findByRole('link', { name: 'ห้องชุด' })).toHaveAttribute('aria-current', 'page')
    expect(tabs().getByRole('link', { name: 'สัญญาเช่า' })).not.toHaveAttribute('aria-current')
    expect(tabs().getByRole('link', { name: 'ตรวจสภาพห้อง' })).not.toHaveAttribute('aria-current')
  })

  it('switches tabs, changing the content and aria-current', async () => {
    await renderApp('/juristic/units', { as: 'juristic' })
    await userEvent.click(await tabs().findByRole('link', { name: 'สัญญาเช่า' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'สัญญาเช่า' })).toBeInTheDocument()
    expect(tabs().getByRole('link', { name: 'สัญญาเช่า' })).toHaveAttribute('aria-current', 'page')
    expect(tabs().getByRole('link', { name: 'ห้องชุด' })).not.toHaveAttribute('aria-current')
    await userEvent.click(tabs().getByRole('link', { name: 'ตรวจสภาพห้อง' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'ตรวจสภาพห้อง' })).toBeInTheDocument()
  })

  it.each(['/juristic/units', '/juristic/units/leases', '/juristic/units/inspections'])(
    'keeps the side menu item active on %s',
    async (path) => {
      await renderApp(path, { as: 'juristic' })
      await screen.findByRole('heading', { level: 1, name: 'ห้องชุดและสัญญาเช่า' })
      expect(sidebarLink()).toHaveAttribute('aria-current', 'page')
    },
  )

  it('shows a 404 for an unknown sub path instead of an empty page', async () => {
    await renderApp('/juristic/units/xyz', { as: 'juristic' })
    expect(screen.getByRole('heading', { level: 1, name: 'ไม่พบหน้าที่ค้นหา' })).toBeInTheDocument()
  })

  it('is not reachable by a tenant: they are sent back to their own home', async () => {
    await renderApp('/juristic/units', { as: 'tenant' })
    expect(screen.getByRole('heading', { level: 1, name: 'ภาพรวมห้องชุด' })).toBeInTheDocument()
    expect(screen.queryByText('ห้องทั้งหมด')).not.toBeInTheDocument()
  })

  it('is not reachable by a technician', async () => {
    await renderApp('/juristic/units/leases', { as: 'technician' })
    expect(screen.getByRole('heading', { level: 1, name: 'งานของฉัน' })).toBeInTheDocument()
  })

  it('is not reachable when signed out', async () => {
    await renderApp('/juristic/units')
    expect(screen.getByRole('heading', { level: 1, name: 'เข้าสู่ระบบ' })).toBeInTheDocument()
  })

  it('switches to English', async () => {
    await renderApp('/juristic/units', { as: 'juristic' })
    await userEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Units & leases' })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Units sections' })).getByRole('link', { name: 'Leases' })).toBeInTheDocument()
    expect(await screen.findByText('Total units')).toBeInTheDocument()
  })
})

describe('UnitsPage states (with an injected api)', () => {
  const renderWith = (api: PropertyApi) =>
    render(
      <MemoryRouter initialEntries={['/juristic/units']}>
        <Routes>
          <Route path="/juristic/units" element={<UnitsPage api={api} today={() => '2026-11-08'} />}>
            <Route index element={<UnitsTab />} />
            <Route path="leases" element={<LeasesTab />} />
            <Route path="inspections" element={<InspectionsTab />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

  it('shows a loading status first and then the page', async () => {
    let resolve!: (d: PropertyData) => void
    const base = makeTestApi()
    renderWith({ ...base, load: () => new Promise<PropertyData>((r) => (resolve = r)) })
    expect(screen.getByRole('status')).toHaveTextContent('กำลังโหลดข้อมูล')
    resolve(await base.load())
    expect(await screen.findByText('ห้องทั้งหมด')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows an error alert when the data cannot be loaded', async () => {
    renderWith({ ...makeTestApi(), load: () => Promise.reject(new Error('boom')) })
    expect(await screen.findByRole('alert')).toHaveTextContent('โหลดข้อมูลไม่สำเร็จ')
  })
})

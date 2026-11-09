import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import { renderApp } from '../../test/renderApp'

function LocationProbe() {
  const { pathname, search } = useLocation()
  return <span data-testid="location">{pathname + search}</span>
}

afterEach(async () => {
  await i18n.changeLanguage('th')
})

const open = (path: string, as: 'juristic' | 'tenant' | 'technician' = 'juristic') => renderApp(path, { as, extra: <LocationProbe /> })
const tabs = () => within(screen.getByRole('navigation', { name: 'ส่วนของพัสดุและการจอง' }))
const sidebarLink = () => within(screen.getByRole('navigation', { name: 'เมนูหลัก' })).getByRole('link', { name: 'พัสดุและการจอง' })

describe('JuristicFacilitiesPage (through the real routes)', () => {
  it('shows the bookings first, with two tabs and the current one marked', async () => {
    await open('/juristic/parcels-bookings')
    expect(await screen.findByRole('heading', { level: 1, name: 'พัสดุและการจอง' })).toBeInTheDocument()
    expect(await tabs().findByRole('link', { name: 'การจอง' })).toHaveAttribute('aria-current', 'page')
    expect(tabs().getByRole('link', { name: 'พัสดุ' })).not.toHaveAttribute('aria-current')
    expect(await screen.findByRole('button', { name: 'ลงทะเบียนพัสดุ' }, { timeout: 200 }).catch(() => null)).toBeNull() // that button belongs to the parcels tab
    expect(await screen.findByLabelText('สถานะ')).toBeInTheDocument()
  })

  it('switches to the parcels tab', async () => {
    await open('/juristic/parcels-bookings')
    await userEvent.click(await tabs().findByRole('link', { name: 'พัสดุ' }))
    expect(await screen.findByRole('button', { name: 'ลงทะเบียนพัสดุ' })).toBeInTheDocument()
    expect(tabs().getByRole('link', { name: 'พัสดุ' })).toHaveAttribute('aria-current', 'page')
    expect(tabs().getByRole('link', { name: 'การจอง' })).not.toHaveAttribute('aria-current')
  })

  it.each(['/juristic/parcels-bookings', '/juristic/parcels-bookings/parcels'])('keeps the side menu item active on %s', async (path) => {
    await open(path)
    await tabs().findByRole('link', { name: 'การจอง' })
    expect(sidebarLink()).toHaveAttribute('aria-current', 'page')
  })

  it.each(['tenant', 'technician'] as const)('does not let the %s in: they are sent back to their own home', async (role) => {
    await open('/juristic/parcels-bookings', role)
    await screen.findByRole('button', { name: 'ออกจากระบบ' })
    expect(screen.getByTestId('location')).not.toHaveTextContent('/juristic/parcels-bookings')
    expect(screen.queryByRole('navigation', { name: 'ส่วนของพัสดุและการจอง' })).not.toBeInTheDocument()
  })

  it('shows the not-found page for a tab that does not exist', async () => {
    await open('/juristic/parcels-bookings/bogus')
    expect(await screen.findByRole('heading', { name: 'ไม่พบหน้าที่ค้นหา' })).toBeInTheDocument()
  })

  it('shows the labels in English', async () => {
    await i18n.changeLanguage('en')
    await open('/juristic/parcels-bookings')
    expect(await screen.findByRole('heading', { level: 1, name: 'Parcels & bookings' })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Parcels and bookings sections' })).getByRole('link', { name: 'Bookings' })).toBeInTheDocument()
  })
})

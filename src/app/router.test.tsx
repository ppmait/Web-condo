import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { renderApp } from '../test/renderApp'

const nav = () => within(screen.getByRole('navigation'))

afterEach(async () => {
  await i18n.changeLanguage('th')
})

describe('AppRoutes (signed in)', () => {
  it.each([
    ['tenant', '/tenant', 'ภาพรวมห้องชุด'],
    ['juristic', '/juristic', 'แดชบอร์ด'],
    ['technician', '/technician', 'งานของฉัน'],
  ] as const)('redirects the %s role root %s to its home page', async (role, path, heading) => {
    await renderApp(path, { as: role })
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
  })

  it('shows only the tenant menu for a tenant', async () => {
    await renderApp('/tenant/billing', { as: 'tenant' })
    expect(nav().getByRole('link', { name: 'พัสดุของฉัน' })).toBeInTheDocument()
    expect(nav().queryByRole('link', { name: 'แดชบอร์ด' })).not.toBeInTheDocument()
    expect(nav().queryByRole('link', { name: 'รายงาน' })).not.toBeInTheDocument()
  })

  it('shows only the juristic menu for a juristic user', async () => {
    await renderApp('/juristic/dashboard', { as: 'juristic' })
    expect(nav().getByRole('link', { name: 'รายงาน' })).toBeInTheDocument()
    expect(nav().queryByRole('link', { name: 'พัสดุของฉัน' })).not.toBeInTheDocument()
  })

  it('shows only the technician menu for a technician', async () => {
    await renderApp('/technician/jobs', { as: 'technician' })
    expect(nav().getAllByRole('link')).toHaveLength(1)
  })

  it('marks the active menu item with aria-current', async () => {
    await renderApp('/tenant/parcels', { as: 'tenant' })
    expect(nav().getByRole('link', { name: 'พัสดุของฉัน' })).toHaveAttribute('aria-current', 'page')
    expect(nav().getByRole('link', { name: 'ภาพรวมห้องชุด' })).not.toHaveAttribute('aria-current')
  })

  it('shows a 404 page for an unknown URL, linking back to the role home', async () => {
    await renderApp('/xyz', { as: 'tenant' })
    expect(screen.getByRole('heading', { level: 1, name: 'ไม่พบหน้าที่ค้นหา' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'กลับหน้าแรก' })).toHaveAttribute('href', '/tenant/overview')
  })

  it('shows a 404 page under the own role and keeps that role menu and home link', async () => {
    await renderApp('/juristic/xyz', { as: 'juristic' })
    expect(screen.getByRole('heading', { level: 1, name: 'ไม่พบหน้าที่ค้นหา' })).toBeInTheDocument()
    expect(nav().getByRole('link', { name: 'รายงาน' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'กลับหน้าแรก' })).toHaveAttribute('href', '/juristic/dashboard')
  })

  it('switches the menu labels to English with the language toggle', async () => {
    await renderApp('/tenant/overview', { as: 'tenant' })
    await userEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(nav().getByRole('link', { name: 'My parcels' })).toBeInTheDocument()
  })
})

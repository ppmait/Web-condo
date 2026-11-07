import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { AppRoutes } from './router'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

const nav = () => within(screen.getByRole('navigation'))

afterEach(async () => {
  await i18n.changeLanguage('th')
})

describe('AppRoutes', () => {
  it('redirects / to the tenant home', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { level: 1, name: 'ภาพรวมห้องชุด' })).toBeInTheDocument()
  })

  it.each([
    ['/tenant', 'ภาพรวมห้องชุด'],
    ['/juristic', 'แดชบอร์ด'],
    ['/technician', 'งานของฉัน'],
  ])('redirects the role root %s to its home page', (path, heading) => {
    renderAt(path)
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
  })

  it('shows only the tenant menu for a tenant route', () => {
    renderAt('/tenant/billing')
    expect(nav().getByRole('link', { name: 'พัสดุของฉัน' })).toBeInTheDocument()
    expect(nav().queryByRole('link', { name: 'แดชบอร์ด' })).not.toBeInTheDocument()
    expect(nav().queryByRole('link', { name: 'รายงาน' })).not.toBeInTheDocument()
  })

  it('shows only the juristic menu for a juristic route', () => {
    renderAt('/juristic/dashboard')
    expect(nav().getByRole('link', { name: 'รายงาน' })).toBeInTheDocument()
    expect(nav().queryByRole('link', { name: 'พัสดุของฉัน' })).not.toBeInTheDocument()
  })

  it('shows only the technician menu for a technician route', () => {
    renderAt('/technician/jobs')
    expect(nav().getAllByRole('link')).toHaveLength(1)
  })

  it('marks the active menu item with aria-current', () => {
    renderAt('/tenant/parcels')
    expect(nav().getByRole('link', { name: 'พัสดุของฉัน' })).toHaveAttribute('aria-current', 'page')
    expect(nav().getByRole('link', { name: 'ภาพรวมห้องชุด' })).not.toHaveAttribute('aria-current')
  })

  it('shows a 404 page for an unknown top-level URL', () => {
    renderAt('/xyz')
    expect(screen.getByRole('heading', { level: 1, name: 'ไม่พบหน้าที่ค้นหา' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'กลับหน้าแรก' })).toHaveAttribute('href', '/tenant/overview')
  })

  it('shows a 404 page under a role and keeps that role menu and home link', () => {
    renderAt('/juristic/xyz')
    expect(screen.getByRole('heading', { level: 1, name: 'ไม่พบหน้าที่ค้นหา' })).toBeInTheDocument()
    expect(nav().getByRole('link', { name: 'รายงาน' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'กลับหน้าแรก' })).toHaveAttribute('href', '/juristic/dashboard')
  })

  it('switches role with the role switcher', async () => {
    renderAt('/tenant/overview')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'บทบาท' }), 'juristic')
    expect(screen.getByRole('heading', { level: 1, name: 'แดชบอร์ด' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'บทบาท' })).toHaveValue('juristic')
  })

  it('switches the menu labels to English with the language toggle', async () => {
    renderAt('/tenant/overview')
    await userEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(nav().getByRole('link', { name: 'My parcels' })).toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import '../i18n'
import { AppRoutes } from './router'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

const menuButton = () => screen.getByRole('button', { name: 'เมนู' })

describe('AppShell mobile drawer', () => {
  it('starts closed and opens from the menu button', async () => {
    renderAt('/tenant/overview')
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(menuButton())
    expect(menuButton()).toHaveAttribute('aria-expanded', 'true')
  })

  it('closes on Escape', async () => {
    renderAt('/tenant/overview')
    await userEvent.click(menuButton())
    await userEvent.keyboard('{Escape}')
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes when the backdrop is clicked', async () => {
    renderAt('/tenant/overview')
    expect(screen.queryByTestId('drawer-backdrop')).not.toBeInTheDocument()
    await userEvent.click(menuButton())
    await userEvent.click(screen.getByTestId('drawer-backdrop'))
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes and navigates when a menu item is chosen', async () => {
    renderAt('/tenant/overview')
    await userEvent.click(menuButton())
    await userEvent.click(screen.getByRole('link', { name: 'พัสดุของฉัน' }))
    expect(screen.getByRole('heading', { level: 1, name: 'พัสดุของฉัน' })).toBeInTheDocument()
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes when the role switcher changes the route', async () => {
    renderAt('/tenant/overview')
    await userEvent.click(menuButton())
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'บทบาท' }), 'technician')
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
  })

  it('has no menu button on an unknown top-level route', () => {
    renderAt('/xyz')
    expect(screen.queryByRole('button', { name: 'เมนู' })).not.toBeInTheDocument()
  })
})

describe('AppShell header on narrow screens', () => {
  // found in a 390px screenshot: the title pushed the role switcher and EN button off screen
  it('lets the title shrink and keeps the role switcher and language toggle from shrinking', () => {
    renderAt('/tenant/overview')
    const title = screen.getByText('ระบบบริหารคอนโด')
    expect(title).toHaveClass('min-w-0', 'flex-1', 'truncate')
    const actions = screen.getByRole('combobox', { name: 'บทบาท' }).parentElement
    expect(actions).toHaveClass('shrink-0')
    expect(screen.getByRole('combobox', { name: 'บทบาท' })).toHaveClass('max-w-28')
  })
})

describe('AppShell menu labels', () => {
  it('truncates long labels and keeps the full label as a title', () => {
    renderAt('/juristic/dashboard')
    const link = screen.getByRole('link', { name: 'ห้องชุดและสัญญาเช่า' })
    expect(link).toHaveAttribute('title', 'ห้องชุดและสัญญาเช่า')
    expect(link.querySelector('span.truncate')).toHaveTextContent('ห้องชุดและสัญญาเช่า')
  })
})

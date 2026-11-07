import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useNavigate } from 'react-router'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../test/renderApp'

function BackButton() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate(-1)}>
      browser-back
    </button>
  )
}

const openAs = (path: string, role: 'tenant' | 'juristic' = 'tenant') =>
  renderApp(path, { as: role, extra: <BackButton /> })

const menuButton = () => screen.getByRole('button', { name: 'เมนู' })

describe('AppShell mobile drawer', () => {
  it('starts closed and opens from the menu button', async () => {
    await openAs('/tenant/overview')
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(menuButton())
    expect(menuButton()).toHaveAttribute('aria-expanded', 'true')
  })

  it('closes on Escape', async () => {
    await openAs('/tenant/overview')
    await userEvent.click(menuButton())
    await userEvent.keyboard('{Escape}')
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes when the backdrop is clicked', async () => {
    await openAs('/tenant/overview')
    expect(screen.queryByTestId('drawer-backdrop')).not.toBeInTheDocument()
    await userEvent.click(menuButton())
    await userEvent.click(screen.getByTestId('drawer-backdrop'))
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes and navigates when a menu item is chosen', async () => {
    await openAs('/tenant/overview')
    await userEvent.click(menuButton())
    await userEvent.click(screen.getByRole('link', { name: 'พัสดุของฉัน' }))
    expect(screen.getByRole('heading', { level: 1, name: 'พัสดุของฉัน' })).toBeInTheDocument()
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
  })

  it('stays closed after browser Back to the page the drawer was opened on', async () => {
    await openAs('/tenant/overview')
    await userEvent.click(menuButton())
    await userEvent.click(screen.getByRole('link', { name: 'พัสดุของฉัน' }))
    await userEvent.click(screen.getByRole('button', { name: 'browser-back' }))
    expect(screen.getByRole('heading', { level: 1, name: 'ภาพรวมห้องชุด' })).toBeInTheDocument()
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes when the menu item for the current page is chosen', async () => {
    await openAs('/tenant/overview')
    await userEvent.click(menuButton())
    await userEvent.click(screen.getByRole('link', { name: 'ภาพรวมห้องชุด' }))
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false')
  })

  it('keeps the sidebar in view while a tall page scrolls', async () => {
    await openAs('/tenant/overview')
    expect(screen.getByRole('navigation')).toHaveClass('md:sticky', 'md:top-0', 'md:h-screen')
  })
})

describe('AppShell header on narrow screens', () => {
  // found in a 390px screenshot: the title pushed the header actions off screen
  it('lets the title shrink and keeps the header actions from shrinking', async () => {
    await openAs('/tenant/overview')
    const title = screen.getByText('ระบบบริหารคอนโด')
    expect(title).toHaveClass('min-w-0', 'flex-1', 'truncate')
    expect(screen.getByTestId('header-actions')).toHaveClass('shrink-0')
  })

  it('has no role switcher any more', async () => {
    await openAs('/tenant/overview')
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
})

describe('AppShell menu labels', () => {
  it('truncates long labels and keeps the full label as a title', async () => {
    await openAs('/juristic/dashboard', 'juristic')
    const link = screen.getByRole('link', { name: 'ห้องชุดและสัญญาเช่า' })
    expect(link).toHaveAttribute('title', 'ห้องชุดและสัญญาเช่า')
    expect(link.querySelector('span.truncate')).toHaveTextContent('ห้องชุดและสัญญาเช่า')
  })
})

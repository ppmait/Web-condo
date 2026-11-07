import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import StatusBadge from './StatusBadge'

afterEach(async () => {
  await i18n.changeLanguage('th')
})

describe('StatusBadge', () => {
  it.each([
    ['settled', 'เรียบร้อย'],
    ['pending', 'รอดำเนินการ'],
    ['critical', 'เร่งด่วน'],
    ['inactive', 'ไม่ใช้งาน'],
  ] as const)('shows the Thai text for %s', (status, text) => {
    render(<StatusBadge status={status} />)
    const badge = screen.getByText(text)
    expect(badge).toHaveAttribute('data-status', status)
  })

  it('switches to English with the language', async () => {
    await i18n.changeLanguage('en')
    render(<StatusBadge status="pending" />)
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('lets label override the default text', () => {
    render(<StatusBadge status="settled" label="ชำระแล้ว" />)
    expect(screen.getByText('ชำระแล้ว')).toHaveAttribute('data-status', 'settled')
    expect(screen.queryByText('เรียบร้อย')).not.toBeInTheDocument()
  })
})

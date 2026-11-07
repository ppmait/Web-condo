import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import th from '../i18n/th.json'
import { NAV_BY_ROLE, ROLES, roleFromPath, roleHome } from './roles'

describe('NAV_BY_ROLE', () => {
  it.each(ROLES)('%s has at least one menu item under its own prefix', (role) => {
    const items = NAV_BY_ROLE[role]
    expect(items.length).toBeGreaterThanOrEqual(1)
    for (const item of items) expect(item.path.startsWith(`/${role}/`)).toBe(true)
  })

  it.each(ROLES)('%s has no duplicate paths or keys', (role) => {
    const paths = NAV_BY_ROLE[role].map((i) => i.path)
    const keys = NAV_BY_ROLE[role].map((i) => i.key)
    expect(new Set(paths).size).toBe(paths.length)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('has a Thai and English label for every nav key and role', () => {
    const nav = { th: th.nav as Record<string, string>, en: en.nav as Record<string, string> }
    const roleLabels = { th: th.role as Record<string, string>, en: en.role as Record<string, string> }
    for (const role of ROLES) {
      expect(roleLabels.th[role]).toBeTruthy()
      expect(roleLabels.en[role]).toBeTruthy()
      for (const { key } of NAV_BY_ROLE[role]) {
        expect(nav.th[key], `th nav.${key}`).toBeTruthy()
        expect(nav.en[key], `en nav.${key}`).toBeTruthy()
      }
    }
  })
})

describe('roleHome', () => {
  it('returns the first menu path of the role', () => {
    expect(roleHome('juristic')).toBe('/juristic/dashboard')
    expect(roleHome('tenant')).toBe('/tenant/overview')
    expect(roleHome('technician')).toBe('/technician/jobs')
  })
})

describe('roleFromPath', () => {
  it.each([
    ['/tenant/billing', 'tenant'],
    ['/juristic', 'juristic'],
    ['/technician/jobs', 'technician'],
  ])('%s → %s', (path, role) => {
    expect(roleFromPath(path)).toBe(role)
  })

  it.each(['/xyz', '/', '', '/tenants', '/Tenant'])('%j → null', (path) => {
    expect(roleFromPath(path)).toBeNull()
  })
})

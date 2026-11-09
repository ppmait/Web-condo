import { describe, expect, it } from 'vitest'
import { DEMO_TECH_PHONE, DEMO_TENANT_PHONE } from '../auth/demoAccounts'
import { addDays, isValidDate } from '../property/dates'
import { makeSeed as makePropertySeed } from '../property/seed'
import { isMaintenanceData } from './localMaintenanceApi'
import { CATEGORIES, nextStatus } from './rules'
import { makeMaintenanceSeed } from './seed'
import type { RequestStatus } from './types'

const STATUSES: RequestStatus[] = ['waiting', 'assigned', 'inProgress', 'done']

describe.each(['2026-11-08', '2028-02-29', '2031-01-03'])('makeMaintenanceSeed for %s', (today) => {
  const property = makePropertySeed(today)
  const data = makeMaintenanceSeed(property, today)

  it('is trusted by the stored-data check', () => {
    expect(isMaintenanceData(JSON.parse(JSON.stringify(data)), property)).toBe(true)
  })

  it('has three technicians, tech01 among them with the demo phone', () => {
    expect(data.technicians).toHaveLength(3)
    expect(data.technicians.some((t) => t.phone === DEMO_TECH_PHONE)).toBe(true)
    expect(new Set(data.technicians.map((t) => t.phone)).size).toBe(3)
  })

  it('has requests in every status, with unique ids and MR codes', () => {
    for (const s of STATUSES) expect(data.requests.some((r) => r.status === s)).toBe(true)
    expect(new Set(data.requests.map((r) => r.id)).size).toBe(data.requests.length)
    expect(data.requests.map((r) => r.code).sort()).toEqual(data.requests.map((_, i) => `MR-${String(i + 1).padStart(4, '0')}`))
  })

  it('gives the demo tenant at least three requests of different statuses', () => {
    const mine = data.requests.filter((r) => r.tenantPhone === DEMO_TENANT_PHONE)
    expect(new Set(mine.map((r) => r.status)).size).toBeGreaterThanOrEqual(3)
  })

  it('gives tech01 jobs that are assigned and in progress', () => {
    const tech = data.technicians.find((t) => t.phone === DEMO_TECH_PHONE)!
    const jobs = data.requests.filter((r) => r.assigneeId === tech.id)
    expect(jobs.some((r) => r.status === 'assigned')).toBe(true)
    expect(jobs.some((r) => r.status === 'inProgress')).toBe(true)
  })

  it('has a history that follows the flow, ends in the current status and never lies in the future', () => {
    for (const r of data.requests) {
      expect(r.history[0].status).toBe('waiting')
      expect(r.history.at(-1)!.status).toBe(r.status)
      r.history.forEach((h, i) => {
        expect(isValidDate(h.at)).toBe(true)
        expect(h.at <= today).toBe(true)
        if (i > 0) {
          expect(h.at >= r.history[i - 1].at).toBe(true)
          expect([r.history[i - 1].status, nextStatus(r.history[i - 1].status)]).toContain(h.status)
        }
      })
      expect(r.createdAt).toBe(r.history[0].at)
      expect(r.createdAt >= addDays(today, -60)).toBe(true)
    }
  })

  it('has 1–3 photos, valid categories and snapshots of units that exist', () => {
    const units = new Set(property.units.map((u) => u.id))
    for (const r of data.requests) {
      expect(r.photos.length).toBeGreaterThanOrEqual(1)
      expect(r.photos.length).toBeLessThanOrEqual(3)
      expect(r.photos.every((p) => p.dataUrl.startsWith('data:image/'))).toBe(true)
      expect(CATEGORIES).toContain(r.category)
      expect(units.has(r.unitId)).toBe(true)
    }
  })

  it('has notifications that match the history and go to the right recipients', () => {
    const created = data.notifications.filter((n) => n.type === 'requestCreated')
    expect(created.every((n) => n.recipient === 'role:juristic')).toBe(true)
    expect(created).toHaveLength(data.requests.length)
    for (const n of data.notifications) {
      const r = data.requests.find((x) => x.id === n.requestId)!
      if (n.type === 'statusChanged') expect(n.recipient).toBe(r.tenantPhone)
      if (n.type === 'assigned') expect(n.recipient).toBe(data.technicians.find((t) => t.id === r.assigneeId)!.phone)
    }
    expect(data.notifications.some((n) => !n.read && n.recipient === DEMO_TENANT_PHONE)).toBe(true)
    expect(data.notifications.some((n) => !n.read && n.recipient === DEMO_TECH_PHONE)).toBe(true)
    expect(data.notifications.some((n) => !n.read && n.recipient === 'role:juristic')).toBe(true)
  })
})

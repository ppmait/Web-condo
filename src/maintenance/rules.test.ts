import { describe, expect, it } from 'vitest'
import en from '../i18n/en.json'
import th from '../i18n/th.json'
import {
  CATEGORIES,
  canAssign,
  canTechnicianUpdate,
  nextCode,
  nextStatus,
  statusBadge,
  validateNote,
  validatePhotoFile,
  validateRequest,
} from './rules'
import type { MaintenanceRequest, Photo, RequestInput, RequestStatus, Technician } from './types'

const photo = (name = 'a.jpg'): Photo => ({ name, dataUrl: 'data:image/jpeg;base64,AAAA' })
const input = (over: Partial<RequestInput> = {}): RequestInput => ({
  category: 'plumbing',
  title: 'ก๊อกน้ำรั่ว',
  description: 'น้ำหยดตลอดเวลา',
  photos: [photo()],
  ...over,
})
const request = (over: Partial<MaintenanceRequest> = {}): MaintenanceRequest => ({
  id: 'r1',
  code: 'MR-0001',
  unitId: 'u1',
  unitCode: 'A-1204',
  leaseId: 'l1',
  tenantName: 'คุณทดสอบ',
  tenantPhone: '0810000001',
  category: 'plumbing',
  title: 'ก๊อกน้ำรั่ว',
  description: 'น้ำหยด',
  photos: [photo()],
  createdAt: '2026-11-08',
  status: 'waiting',
  history: [{ status: 'waiting', at: '2026-11-08', note: '', byName: 'คุณทดสอบ' }],
  ...over,
})
const tech: Technician = { id: 't1', name: 'ช่าง', phone: '0800000002' }

describe('validateRequest', () => {
  it('accepts a complete request', () => {
    expect(validateRequest(input())).toEqual({})
  })

  it.each([['wrong'], ['']])('rejects the category %j', (category) => {
    expect(validateRequest(input({ category: category as never })).category).toBe('maintenance.errors.category')
  })

  it.each(CATEGORIES)('accepts the category %s', (category) => {
    expect(validateRequest(input({ category }))).toEqual({})
  })

  it.each([[''], ['   ']])('rejects the empty title %j', (title) => {
    expect(validateRequest(input({ title })).title).toBe('maintenance.errors.title')
  })

  it('accepts a title of 80 characters and rejects 81 (after trimming)', () => {
    expect(validateRequest(input({ title: 'ก'.repeat(80) }))).toEqual({})
    expect(validateRequest(input({ title: `  ${'ก'.repeat(80)}  ` }))).toEqual({})
    expect(validateRequest(input({ title: 'ก'.repeat(81) })).title).toBe('maintenance.errors.title')
  })

  it.each([[''], ['  \n ']])('rejects the empty description %j', (description) => {
    expect(validateRequest(input({ description })).description).toBe('maintenance.errors.description')
  })

  it('accepts a description of 1000 characters and rejects 1001', () => {
    expect(validateRequest(input({ description: 'x'.repeat(1000) }))).toEqual({})
    expect(validateRequest(input({ description: 'x'.repeat(1001) })).description).toBe('maintenance.errors.description')
  })

  it('needs between 1 and 3 photos', () => {
    expect(validateRequest(input({ photos: [] })).photos).toBe('maintenance.errors.photos')
    expect(validateRequest(input({ photos: [photo('1'), photo('2'), photo('3')] }))).toEqual({})
    expect(validateRequest(input({ photos: [photo('1'), photo('2'), photo('3'), photo('4')] })).photos).toBe('maintenance.errors.photos')
  })

  it('reports every problem at once', () => {
    const e = validateRequest({ category: 'x' as never, title: '', description: '', photos: [] })
    expect(Object.keys(e).sort()).toEqual(['category', 'description', 'photos', 'title'])
  })
})

describe('validateNote', () => {
  it('accepts an empty note and 300 characters, rejects 301', () => {
    expect(validateNote('')).toBeNull()
    expect(validateNote('x'.repeat(300))).toBeNull()
    expect(validateNote('x'.repeat(301))).toBe('maintenance.errors.note')
  })

  it('counts the trimmed note', () => {
    expect(validateNote(`  ${'x'.repeat(300)}  `)).toBeNull()
  })
})

describe('validatePhotoFile', () => {
  const MB10 = 10 * 1024 * 1024

  it.each([
    ['a.jpg', 'image/jpeg'],
    ['a.JPEG', 'image/jpeg'],
    ['a.png', 'image/png'],
    ['a.webp', 'image/webp'],
  ])('accepts %s as %s', (name, type) => {
    expect(validatePhotoFile({ name, type, size: 1000 })).toBeNull()
  })

  it.each([
    ['a.gif', 'image/gif'],
    ['a.pdf', 'application/pdf'],
    ['noextension', 'image/png'],
    ['a.png', 'image/jpeg'],
    ['a.jpg', ''],
  ])('rejects %s with type %j', (name, type) => {
    expect(validatePhotoFile({ name, type, size: 1000 })).toBe('maintenance.errors.photoFile')
  })

  it('accepts exactly 10 MB and rejects one byte more, an empty file and a nonsense size', () => {
    expect(validatePhotoFile({ name: 'a.png', type: 'image/png', size: MB10 })).toBeNull()
    expect(validatePhotoFile({ name: 'a.png', type: 'image/png', size: MB10 + 1 })).toBe('maintenance.errors.photoFile')
    expect(validatePhotoFile({ name: 'a.png', type: 'image/png', size: 0 })).toBe('maintenance.errors.photoFile')
    expect(validatePhotoFile({ name: 'a.png', type: 'image/png', size: Number.NaN })).toBe('maintenance.errors.photoFile')
  })
})

describe('nextCode', () => {
  it('starts at MR-0001', () => {
    expect(nextCode([])).toBe('MR-0001')
  })

  it('is one more than the highest number, not the count', () => {
    expect(nextCode([{ code: 'MR-0009' }, { code: 'MR-0002' }])).toBe('MR-0010')
  })

  it('skips codes of another shape and keeps growing past four digits', () => {
    expect(nextCode([{ code: 'XX-0500' }, { code: 'MR-abc' }, { code: 'MR-0003' }])).toBe('MR-0004')
    expect(nextCode([{ code: 'MR-9999' }])).toBe('MR-10000')
  })
})

describe('status flow', () => {
  it('goes waiting → assigned → inProgress → done and stops', () => {
    expect(nextStatus('waiting')).toBe('assigned')
    expect(nextStatus('assigned')).toBe('inProgress')
    expect(nextStatus('inProgress')).toBe('done')
    expect(nextStatus('done')).toBeNull()
  })

  it.each([
    ['waiting', true],
    ['assigned', true],
    ['inProgress', false],
    ['done', false],
  ] as [RequestStatus, boolean][])('canAssign when %s is %s', (status, expected) => {
    expect(canAssign(request({ status }))).toBe(expected)
  })

  it.each([
    ['assigned', 't1', true],
    ['inProgress', 't1', true],
    ['assigned', 't2', false],
    ['waiting', 't1', false],
    ['done', 't1', false],
    ['assigned', undefined, false],
  ] as [RequestStatus, string | undefined, boolean][])('a technician may update a %s job assigned to %s: %s', (status, assigneeId, expected) => {
    expect(canTechnicianUpdate(request({ status, assigneeId }), tech)).toBe(expected)
  })
})

describe('statusBadge', () => {
  it('gives every status its own badge style', () => {
    const badges = (['waiting', 'assigned', 'inProgress', 'done'] as RequestStatus[]).map(statusBadge)
    expect(badges).toEqual(['critical', 'inactive', 'pending', 'settled'])
  })
})

describe('texts', () => {
  const lookup = (file: unknown, path: string) => path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], file)
  const keys = [
    ...CATEGORIES.map((c) => `maintenance.category.${c}`),
    ...(['waiting', 'assigned', 'inProgress', 'done'] as const).map((s) => `maintenance.status.${s}`),
    ...['category', 'title', 'description', 'photos', 'photoFile', 'incomplete', 'note'].map((k) => `maintenance.errors.${k}`),
  ]

  it.each(keys)('has a different Thai and English text for %s', (key) => {
    const [a, b] = [lookup(th, key), lookup(en, key)]
    expect(typeof a === 'string' && a.trim() !== '').toBe(true)
    expect(typeof b === 'string' && b.trim() !== '').toBe(true)
    expect(a).not.toBe(b)
  })

  it('uses the wording the requirement asks for', () => {
    expect(lookup(th, 'maintenance.errors.incomplete')).toBe('กรุณากรอกข้อมูลและแนบรูปภาพประกอบให้ครบถ้วน')
    expect(lookup(th, 'maintenance.status.waiting')).toBe('รอการมอบหมาย')
  })
})

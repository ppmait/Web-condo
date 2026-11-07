import { describe, expect, it } from 'vitest'
import { sha256Hex } from './hash'

describe('sha256Hex', () => {
  it('hashes text with SHA-256 as lowercase hex', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('hashes Thai text deterministically', async () => {
    expect(await sha256Hex('รหัสผ่าน')).toBe(await sha256Hex('รหัสผ่าน'))
    expect(await sha256Hex('รหัสผ่าน')).not.toBe(await sha256Hex('รหัสผ่าน '))
  })
})

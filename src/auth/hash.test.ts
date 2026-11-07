import { afterEach, describe, expect, it, vi } from 'vitest'
import { sha256Fallback, sha256Hex } from './hash'

afterEach(() => vi.unstubAllGlobals())

describe('sha256Hex', () => {
  it('hashes text with SHA-256 as lowercase hex', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('hashes Thai text deterministically', async () => {
    expect(await sha256Hex('รหัสผ่าน')).toBe(await sha256Hex('รหัสผ่าน'))
    expect(await sha256Hex('รหัสผ่าน')).not.toBe(await sha256Hex('รหัสผ่าน '))
  })

  it('still works when crypto.subtle is unavailable (plain-http origin other than localhost)', async () => {
    vi.stubGlobal('crypto', {})
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('sha256Fallback', () => {
  it.each([
    ['empty', ''],
    ['abc', 'abc'],
    ['Thai', 'รหัสผ่าน'],
    ['emoji and mixed text', '😀 mixed ไทย'],
    ['55 bytes (one block, max)', 'a'.repeat(55)],
    ['56 bytes (padding spills into a second block)', 'a'.repeat(56)],
    ['63 bytes', 'a'.repeat(63)],
    ['64 bytes (exactly one block of data)', 'a'.repeat(64)],
    ['65 bytes', 'a'.repeat(65)],
    ['1000 bytes (many blocks)', 'x'.repeat(1000)],
  ])('gives the same digest as Web Crypto for %s', async (_name, text) => {
    expect(sha256Fallback(text)).toBe(await sha256Hex(text))
  })
})

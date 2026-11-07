/**
 * SHA-256 of the text as lowercase hex.
 * Uses Web Crypto when available; `crypto.subtle` only exists on secure origins (https or localhost),
 * so on e.g. http://192.168.x.x we fall back to a small pure-JS implementation instead of failing.
 */
export async function sha256Hex(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return sha256Fallback(text)
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))

function firstPrimes(count: number): number[] {
  const primes: number[] = []
  for (let n = 2; primes.length < count; n++) {
    if (primes.every((p) => n % p !== 0)) primes.push(n)
  }
  return primes
}

const PRIMES = firstPrimes(64)
const fractionBits = (x: number) => Math.floor((x - Math.floor(x)) * 0x100000000)
// FIPS 180-4: round constants = cube roots, initial hash = square roots, of the first primes
const K = PRIMES.map((p) => fractionBits(Math.cbrt(p)))
const H0 = PRIMES.slice(0, 8).map((p) => fractionBits(Math.sqrt(p)))

/** Pure-JS SHA-256 (exported for tests; use sha256Hex). */
export function sha256Fallback(text: string): string {
  const bytes = new TextEncoder().encode(text)
  const bitLength = bytes.length * 8
  const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000))
  view.setUint32(padded.length - 4, bitLength >>> 0)

  const h = Uint32Array.from(H0)
  const w = new Uint32Array(64)
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = w[i - 16] + s0 + w[i - 7] + s1
    }
    let [a, b, c, d, e, f, g, hh] = h
    for (let i = 0; i < 64; i++) {
      const t1 = hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]
      const t2 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))
      hh = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }
    h[0] += a
    h[1] += b
    h[2] += c
    h[3] += d
    h[4] += e
    h[5] += f
    h[6] += g
    h[7] += hh
  }
  return Array.from(h, (x) => x.toString(16).padStart(8, '0')).join('')
}

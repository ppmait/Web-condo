/** In-memory Storage for tests, plus variants that fail on read or on write. */
export class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  clear() {
    this.map.clear()
  }
  getItem(key: string) {
    return this.map.get(key) ?? null
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.map.delete(key)
  }
  setItem(key: string, value: string) {
    this.map.set(key, value)
  }
}

export class UnreadableStorage extends MemoryStorage {
  getItem(): string | null {
    throw new Error('blocked')
  }
}

export class UnwritableStorage extends MemoryStorage {
  setItem(): void {
    throw new Error('quota')
  }
}

import { describe, expect, it } from 'vitest'
import { DEMO_ACCOUNTS, DEMO_PASSWORD, DEMO_TECH_PHONE, DEMO_TENANT_PHONE } from './demoAccounts'
import { SESSION_KEY, USERS_KEY, createLocalAuthApi } from './localAuthApi'
import { AuthError, type RegisterForm } from './types'

class MemoryStorage implements Storage {
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

class UnreadableStorage extends MemoryStorage {
  getItem(): string | null {
    throw new Error('blocked')
  }
}

class UnwritableStorage extends MemoryStorage {
  setItem(): void {
    throw new Error('quota')
  }
}

const fastHash = async (s: string) => `h:${s}`

const form: RegisterForm = {
  username: 'somchai_01',
  password: 'password123',
  confirmPassword: 'password123',
  fullName: 'สมชาย ใจดี',
  email: 'somchai@example.com',
  phone: '0812345678',
}

const make = (storage: Storage | null = new MemoryStorage()) => createLocalAuthApi({ storage, hash: fastHash })

const failure = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e
  }
  return null
}

describe('seeding', () => {
  it('has no current user at first', async () => {
    expect(await make().currentUser()).toBeNull()
  })

  it('gives each demo account its own phone number: tenant01 is the tenant of unit A-1204 in the sample data', async () => {
    const api = make()
    expect((await api.login('tenant01', DEMO_PASSWORD)).phone).toBe('0810000001')
    expect((await api.login('staff01', DEMO_PASSWORD)).phone).toBe('0800000000')
    expect((await api.login('tech01', DEMO_PASSWORD)).phone).toBe('0800000002')
    expect(DEMO_TENANT_PHONE).toBe('0810000001')
    expect(DEMO_TECH_PHONE).toBe('0800000002')
  })

  it.each(DEMO_ACCOUNTS)('seeds the demo account $username with role $role', async ({ username, role }) => {
    const user = await make().login(username, DEMO_PASSWORD)
    expect(user.role).toBe(role)
    expect(user.username).toBe(username)
  })
})

describe('register', () => {
  it('creates a tenant, returns no password fields and starts the session', async () => {
    const api = make()
    const user = await api.register(form)
    expect(user.role).toBe('tenant')
    expect(user.username).toBe('somchai_01')
    expect(JSON.stringify(user)).not.toMatch(/password|hash/i)
    expect((await api.currentUser())?.id).toBe(user.id)
  })

  it('lets the new account log in again later', async () => {
    const api = make()
    await api.register(form)
    await api.logout()
    expect((await api.login('somchai_01', 'password123')).fullName).toBe('สมชาย ใจดี')
  })

  it('never stores the password as plain text', async () => {
    const storage = new MemoryStorage()
    const api = createLocalAuthApi({ storage })
    await api.register(form)
    expect(storage.getItem(USERS_KEY)).not.toContain('password123')
    expect((await api.login('somchai_01', 'password123')).username).toBe('somchai_01')
  })

  it.each(['tenant01', ' TENANT01 ', 'Tenant01'])('rejects the taken username %j', async (username) => {
    const e = await failure(make().register({ ...form, username }))
    expect(e).toBeInstanceOf(AuthError)
    expect((e as AuthError).code).toBe('username_taken')
  })

  it('rejects a username that differs only by case from a newly registered one', async () => {
    const api = make()
    await api.register(form)
    const e = await failure(api.register({ ...form, username: 'SOMCHAI_01' }))
    expect((e as AuthError).code).toBe('username_taken')
  })

  it('rejects an invalid form', async () => {
    const e = await failure(make().register({ ...form, email: 'bad' }))
    expect((e as AuthError).code).toBe('invalid_input')
  })
})

describe('login', () => {
  it.each([
    ['unknown user', 'nobody', DEMO_PASSWORD],
    ['wrong password', 'tenant01', 'wrong-password'],
    ['empty fields', '', ''],
  ])('fails with the same error for %s', async (_name, username, password) => {
    const e = await failure(make().login(username, password))
    expect(e).toBeInstanceOf(AuthError)
    expect((e as AuthError).code).toBe('invalid_credentials')
    expect((e as AuthError).message).toBe('invalid_credentials')
  })

  it('accepts a username with spaces and capitals', async () => {
    expect((await make().login(' Tenant01 ', DEMO_PASSWORD)).username).toBe('tenant01')
  })

  it('does not change the session when login fails', async () => {
    const api = make()
    await api.login('tenant01', DEMO_PASSWORD)
    await failure(api.login('tenant01', 'wrong-password'))
    expect((await api.currentUser())?.username).toBe('tenant01')
  })
})

describe('session', () => {
  it('survives creating a new api on the same storage and is cleared by logout', async () => {
    const storage = new MemoryStorage()
    const first = make(storage)
    const user = await first.login('staff01', DEMO_PASSWORD)
    expect((await make(storage).currentUser())?.id).toBe(user.id)

    await first.logout()
    expect(await first.currentUser()).toBeNull()
    expect(storage.getItem(SESSION_KEY)).toBeNull()
    expect(await make(storage).currentUser()).toBeNull()
  })

  it('keeps registered users across api instances', async () => {
    const storage = new MemoryStorage()
    await make(storage).register(form)
    expect((await make(storage).login('somchai_01', 'password123')).username).toBe('somchai_01')
  })

  it('clears a session that points to a user that does not exist', async () => {
    const storage = new MemoryStorage()
    storage.setItem(SESSION_KEY, 'ghost-id')
    expect(await make(storage).currentUser()).toBeNull()
    expect(storage.getItem(SESSION_KEY)).toBeNull()
  })
})

describe('corrupt stored users', () => {
  it.each(['not json', '{}', '[]', '[1,2]', '[{"id":1}]', 'null', '[{"id":"a","username":"x","role":"admin"}]'])(
    'reseeds the demo accounts when condo:users is %j',
    async (bad) => {
      const storage = new MemoryStorage()
      storage.setItem(USERS_KEY, bad)
      const api = make(storage)
      expect((await api.login('tenant01', DEMO_PASSWORD)).role).toBe('tenant')
      const stored = JSON.parse(storage.getItem(USERS_KEY) as string)
      expect(Array.isArray(stored)).toBe(true)
      expect(stored).toHaveLength(DEMO_ACCOUNTS.length)
    },
  )
})

describe('hashing that fails once', () => {
  it('does not cache the failure: the next call seeds and works', async () => {
    let calls = 0
    const flaky = async (s: string) => {
      if (calls++ === 0) throw new TypeError('crypto.subtle is unavailable')
      return `h:${s}`
    }
    const api = createLocalAuthApi({ storage: new MemoryStorage(), hash: flaky })
    await expect(api.login('tenant01', DEMO_PASSWORD)).rejects.toThrow(TypeError)
    expect((await api.login('tenant01', DEMO_PASSWORD)).role).toBe('tenant')
  })
})

describe('storage that fails', () => {
  it('works in memory when reading throws', async () => {
    const api = make(new UnreadableStorage())
    expect((await api.login('tenant01', DEMO_PASSWORD)).role).toBe('tenant')
    expect((await api.currentUser())?.username).toBe('tenant01')
  })

  it('works in memory when writing throws', async () => {
    const api = make(new UnwritableStorage())
    const user = await api.register(form)
    expect((await api.currentUser())?.id).toBe(user.id)
    await api.logout()
    expect((await api.login('somchai_01', 'password123')).id).toBe(user.id)
  })

  it('works with no storage at all', async () => {
    const api = make(null)
    expect((await api.register(form)).role).toBe('tenant')
    expect((await api.currentUser())?.username).toBe('somchai_01')
  })
})

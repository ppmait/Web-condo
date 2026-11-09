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

describe('demo accounts that were stored with an older phone number', () => {
  /** storage as an earlier visit left it: the demo tenant and technician still have the old shared number */
  async function staleStorage() {
    const storage = new MemoryStorage()
    await make(storage).login('tenant01', DEMO_PASSWORD) // seeds the users
    const users = JSON.parse(storage.getItem(USERS_KEY) as string) as { username: string; phone: string }[]
    for (const u of users) if (u.username === 'tenant01' || u.username === 'tech01') u.phone = '0800000000'
    storage.setItem(USERS_KEY, JSON.stringify(users))
    return { storage, before: users }
  }

  it('puts the current phone number back on a demo account at the next login, and stores it', async () => {
    const { storage } = await staleStorage()
    const api = make(storage)
    expect((await api.login('tenant01', DEMO_PASSWORD)).phone).toBe(DEMO_TENANT_PHONE)
    expect((await api.login('tech01', DEMO_PASSWORD)).phone).toBe(DEMO_TECH_PHONE)
    const stored = JSON.parse(storage.getItem(USERS_KEY) as string) as { username: string; phone: string }[]
    expect(stored.find((u) => u.username === 'tenant01')!.phone).toBe(DEMO_TENANT_PHONE)
    expect(stored.find((u) => u.username === 'tech01')!.phone).toBe(DEMO_TECH_PHONE)
  })

  it('also repairs the account of a session that is already signed in', async () => {
    const { storage } = await staleStorage()
    const first = make(storage)
    await first.login('tenant01', DEMO_PASSWORD)
    expect((await make(storage).currentUser())?.phone).toBe(DEMO_TENANT_PHONE)
  })

  it('keeps the id and the password of the account, and leaves other accounts and demo numbers that are already right alone', async () => {
    const { storage, before } = await staleStorage()
    const api = make(storage)
    await api.register(form)
    await api.login('tenant01', DEMO_PASSWORD)
    const after = JSON.parse(storage.getItem(USERS_KEY) as string) as { id: string; username: string; phone: string; passwordHash: string }[]
    const original = (name: string) => before.find((u) => u.username === name) as unknown as { id: string; passwordHash: string }
    expect(after.find((u) => u.username === 'tenant01')).toMatchObject({ id: original('tenant01').id, passwordHash: original('tenant01').passwordHash })
    expect(after.find((u) => u.username === 'somchai_01')!.phone).toBe(form.phone)
    expect(after.find((u) => u.username === 'staff01')!.phone).toBe('0800000000')
  })

  it('does not touch a registered account that happens to use the old shared number', async () => {
    const { storage } = await staleStorage()
    const api = make(storage)
    const user = await api.register({ ...form, phone: '0800000000' })
    expect(user.phone).toBe('0800000000')
    await api.login('tenant01', DEMO_PASSWORD)
    expect((await make(storage).login('somchai_01', 'password123')).phone).toBe('0800000000')
  })

  it('writes nothing when every demo number is already right', async () => {
    const storage = new MemoryStorage()
    await make(storage).login('tenant01', DEMO_PASSWORD)
    let writes = 0
    const original = storage.setItem.bind(storage)
    storage.setItem = (k: string, v: string) => {
      if (k === USERS_KEY) writes++
      original(k, v)
    }
    await make(storage).login('tenant01', DEMO_PASSWORD)
    expect(writes).toBe(0)
  })

  it('still works when the repaired list cannot be written', async () => {
    const { storage } = await staleStorage()
    storage.setItem = () => {
      throw new Error('quota')
    }
    expect((await make(storage).login('tenant01', DEMO_PASSWORD)).phone).toBe(DEMO_TENANT_PHONE)
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

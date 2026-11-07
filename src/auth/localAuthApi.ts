import { ROLES } from '../app/roles'
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from './demoAccounts'
import { sha256Hex } from './hash'
import { AuthError, type AuthApi, type RegisterForm, type User } from './types'
import { normalizeUsername, validateRegister } from './validate'

export const USERS_KEY = 'condo:users'
export const SESSION_KEY = 'condo:session'

interface StoredUser extends User {
  passwordHash: string
}

interface Options {
  /** Defaults to the browser localStorage. `null` keeps everything in memory. */
  storage?: Storage | null
  hash?: (text: string) => Promise<string>
}

const isString = (v: unknown): v is string => typeof v === 'string'

function isStoredUser(v: unknown): v is StoredUser {
  if (typeof v !== 'object' || v === null) return false
  const u = v as Record<string, unknown>
  return (
    isString(u.id) &&
    isString(u.username) &&
    isString(u.fullName) &&
    isString(u.email) &&
    isString(u.phone) &&
    isString(u.passwordHash) &&
    ROLES.includes(u.role as never)
  )
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

const toPublic = ({ passwordHash: _passwordHash, ...user }: StoredUser): User => user

export function createLocalAuthApi(opts: Options = {}): AuthApi {
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage
  const hash = opts.hash ?? sha256Hex

  // storage may throw or be missing: these wrappers keep the in-memory state authoritative
  const read = (key: string): string | null => {
    try {
      return storage ? storage.getItem(key) : null
    } catch {
      return null
    }
  }
  const write = (key: string, value: string | null) => {
    try {
      if (!storage) return
      if (value === null) storage.removeItem(key)
      else storage.setItem(key, value)
    } catch {
      // ignore: the app keeps working from memory
    }
  }

  let usersPromise: Promise<StoredUser[]> | null = null
  const loadUsers = (): Promise<StoredUser[]> => {
    usersPromise ??= (async () => {
      try {
        const parsed: unknown = JSON.parse(read(USERS_KEY) ?? 'null')
        if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(isStoredUser)) return parsed
      } catch {
        // fall through to seeding
      }
      const seeded: StoredUser[] = []
      for (const account of DEMO_ACCOUNTS) {
        seeded.push({
          id: newId(),
          username: account.username,
          fullName: account.fullName,
          email: `${account.username}@example.com`,
          phone: '0800000000',
          role: account.role,
          passwordHash: await hash(DEMO_PASSWORD),
        })
      }
      write(USERS_KEY, JSON.stringify(seeded))
      return seeded
    })().catch((error: unknown) => {
      usersPromise = null // do not cache a failure (e.g. hashing unavailable): the next call retries
      throw error
    })
    return usersPromise
  }

  let sessionId: string | null | undefined // undefined = not read from storage yet
  const getSession = () => (sessionId === undefined ? (sessionId = read(SESSION_KEY)) : sessionId)
  const setSession = (id: string | null) => {
    sessionId = id
    write(SESSION_KEY, id)
  }

  return {
    async register(form: RegisterForm) {
      if (Object.keys(validateRegister(form)).length > 0) throw new AuthError('invalid_input')
      const users = await loadUsers()
      const username = normalizeUsername(form.username)
      if (users.some((u) => u.username === username)) throw new AuthError('username_taken')
      const stored: StoredUser = {
        id: newId(),
        username,
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        role: 'tenant',
        passwordHash: await hash(form.password),
      }
      users.push(stored)
      write(USERS_KEY, JSON.stringify(users))
      setSession(stored.id)
      return toPublic(stored)
    },

    async login(username: string, password: string) {
      const users = await loadUsers()
      const user = users.find((u) => u.username === normalizeUsername(username))
      const passwordHash = await hash(password) // hash even for unknown users: same work, same error
      if (!user || username.trim() === '' || password === '' || user.passwordHash !== passwordHash) {
        throw new AuthError('invalid_credentials')
      }
      setSession(user.id)
      return toPublic(user)
    },

    async logout() {
      setSession(null)
    },

    async currentUser() {
      const users = await loadUsers()
      const id = getSession()
      if (id === null) return null
      const user = users.find((u) => u.id === id)
      if (!user) {
        setSession(null)
        return null
      }
      return toPublic(user)
    },
  }
}

export const localAuthApi: AuthApi = createLocalAuthApi()

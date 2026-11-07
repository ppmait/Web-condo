import { useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { roleHome } from '../../app/roles'
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../../auth/demoAccounts'
import { AuthError } from '../../auth/types'
import { useAuth } from '../../auth/useAuth'
import Button from '../../components/Button'
import FormField from '../../components/FormField'
import AuthLayout from './AuthLayout'

export default function LoginPage() {
  const { t } = useTranslation()
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [required, setRequired] = useState<{ username: boolean; password: boolean }>({
    username: false,
    password: false,
  })
  const [failed, setFailed] = useState(false)
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (inFlight.current) return
    const missing = { username: username.trim() === '', password: password === '' }
    setRequired(missing)
    setFailed(false)
    if (missing.username || missing.password) return

    inFlight.current = true
    setPending(true)
    try {
      const user = await login(username, password)
      navigate(roleHome(user.role), { replace: true })
    } catch (err) {
      if (!(err instanceof AuthError)) throw err
      setFailed(true)
      setPassword('')
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return (
    <AuthLayout title={t('auth.login.title')}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FormField label={t('auth.fields.username')} error={required.username ? t('auth.errors.required') : undefined}>
          {(a) => (
            <input
              {...a}
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          )}
        </FormField>
        <FormField label={t('auth.fields.password')} error={required.password ? t('auth.errors.required') : undefined}>
          {(a) => (
            <input
              {...a}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </FormField>
        {failed && (
          <p role="alert" className="text-sm text-error">
            {t('auth.loginFailed')}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {t('auth.login.submit')}
        </Button>
      </form>

      <p className="mt-4 text-sm text-on-surface-variant">
        <Link to="/register" className="font-semibold text-primary-container underline">
          {t('auth.links.toRegister')}
        </Link>
      </p>

      <section className="mt-6 rounded-lg bg-surface-container-low p-4" aria-label={t('auth.demo.title')}>
        <h2 className="text-sm font-semibold text-primary-container">{t('auth.demo.title')}</h2>
        <p className="mt-1 text-xs text-on-surface-variant">{t('auth.demo.hint', { password: DEMO_PASSWORD })}</p>
        <div className="mt-3 flex flex-col gap-2">
          {DEMO_ACCOUNTS.map((account) => (
            <Button
              key={account.username}
              variant="secondary"
              className="justify-start"
              onClick={() => {
                setUsername(account.username)
                setPassword(DEMO_PASSWORD)
                setFailed(false)
                setRequired({ username: false, password: false })
              }}
            >
              {t(`role.${account.role}`)} ({account.username})
            </Button>
          ))}
        </div>
      </section>
    </AuthLayout>
  )
}

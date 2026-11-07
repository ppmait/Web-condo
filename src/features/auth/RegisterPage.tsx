import { useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { roleHome } from '../../app/roles'
import { AuthError, type RegisterForm } from '../../auth/types'
import { useAuth } from '../../auth/useAuth'
import { validateRegister, type RegisterErrors } from '../../auth/validate'
import Button from '../../components/Button'
import FormField from '../../components/FormField'
import AuthLayout from './AuthLayout'

const EMPTY: RegisterForm = {
  username: '',
  password: '',
  confirmPassword: '',
  fullName: '',
  email: '',
  phone: '',
}

interface FieldSpec {
  name: keyof RegisterForm
  type: string
  autoComplete: string
  inputMode?: 'numeric' | 'email'
}

const FIELDS: FieldSpec[] = [
  { name: 'username', type: 'text', autoComplete: 'username' },
  { name: 'password', type: 'password', autoComplete: 'new-password' },
  { name: 'confirmPassword', type: 'password', autoComplete: 'new-password' },
  { name: 'fullName', type: 'text', autoComplete: 'name' },
  { name: 'email', type: 'email', autoComplete: 'email', inputMode: 'email' },
  { name: 'phone', type: 'tel', autoComplete: 'tel', inputMode: 'numeric' },
]

export default function RegisterPage() {
  const { t } = useTranslation()
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState<RegisterForm>(EMPTY)
  const [errors, setErrors] = useState<RegisterErrors>({})
  const [generalError, setGeneralError] = useState(false)
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)

  const change = (name: keyof RegisterForm, value: string) => {
    setForm((f) => ({ ...f, [name]: value }))
    setErrors((e) => {
      if (!e[name]) return e
      const rest = { ...e }
      delete rest[name]
      return rest
    })
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (inFlight.current) return
    setGeneralError(false)
    const found = validateRegister(form)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    inFlight.current = true
    setPending(true)
    try {
      const user = await register(form)
      navigate(roleHome(user.role), { replace: true })
    } catch (err) {
      if (err instanceof AuthError && err.code === 'username_taken') {
        setErrors({ username: 'auth.errors.usernameTaken' })
      } else if (err instanceof AuthError && err.code === 'invalid_input') {
        setErrors(validateRegister(form))
      } else {
        setGeneralError(true)
      }
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  return (
    <AuthLayout title={t('auth.register.title')}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {FIELDS.map((f) => (
          <FormField
            key={f.name}
            label={t(`auth.fields.${f.name}`)}
            error={errors[f.name] ? t(errors[f.name] as string) : undefined}
          >
            {(a) => (
              <input
                {...a}
                type={f.type}
                autoComplete={f.autoComplete}
                inputMode={f.inputMode}
                value={form[f.name]}
                onChange={(e) => change(f.name, e.target.value)}
              />
            )}
          </FormField>
        ))}
        {generalError && (
          <p role="alert" className="text-sm text-error">
            {t('auth.errors.generic')}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {t('auth.register.submit')}
        </Button>
      </form>

      <p className="mt-4 text-sm text-on-surface-variant">
        <Link to="/login" className="font-semibold text-primary-container underline">
          {t('auth.links.toLogin')}
        </Link>
      </p>
    </AuthLayout>
  )
}

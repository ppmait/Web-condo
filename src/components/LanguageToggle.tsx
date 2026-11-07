import { useTranslation } from 'react-i18next'
import { LANG_KEY, type Lang } from '../i18n'

const LANGS: Lang[] = ['th', 'en']

export default function LanguageToggle() {
  const { i18n } = useTranslation()

  const choose = (lang: Lang) => {
    void i18n.changeLanguage(lang)
    try {
      localStorage.setItem(LANG_KEY, lang)
    } catch {
      // storage unavailable: language still switches for this session
    }
  }

  return (
    <div className="inline-flex rounded-lg bg-surface-container-low p-0.5">
      {LANGS.map((lang) => (
        <button
          key={lang}
          type="button"
          aria-pressed={i18n.language === lang}
          onClick={() => choose(lang)}
          className={`rounded px-2.5 py-1 text-xs font-semibold ${
            i18n.language === lang
              ? 'bg-surface-container-lowest text-primary-container shadow-sm'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          {lang.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

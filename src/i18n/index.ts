import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import th from './th.json'

export const LANG_KEY = 'condo:lang'
export type Lang = 'th' | 'en'

export function readStoredLang(): Lang {
  try {
    const value = localStorage.getItem(LANG_KEY)
    return value === 'en' ? 'en' : 'th'
  } catch {
    return 'th'
  }
}

void i18n.use(initReactI18next).init({
  resources: { th: { translation: th }, en: { translation: en } },
  lng: readStoredLang(),
  fallbackLng: 'th',
  interpolation: { escapeValue: false },
  initAsync: false,
})

export default i18n

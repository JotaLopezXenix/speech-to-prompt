import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import common from './locales/es/common.json'

// Español por defecto. Strings externalizados; estructura lista para más locales.
void i18n.use(initReactI18next).init({
  resources: { es: { common } },
  lng: 'es',
  fallbackLng: 'es',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
})

export default i18n

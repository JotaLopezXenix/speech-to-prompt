import { useTranslation } from 'react-i18next'
import { Placeholder } from './Placeholder'

export default function Settings() {
  const { t } = useTranslation()
  return <Placeholder title={t('settings.title')}>{t('settings.placeholder')}</Placeholder>
}

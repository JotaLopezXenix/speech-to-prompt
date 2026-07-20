import { useTranslation } from 'react-i18next'
import { Placeholder } from './Placeholder'

export default function History() {
  const { t } = useTranslation()
  return <Placeholder title={t('history.title')}>{t('history.placeholder')}</Placeholder>
}

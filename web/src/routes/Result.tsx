import { useTranslation } from 'react-i18next'
import { Placeholder } from './Placeholder'

export default function Result() {
  const { t } = useTranslation()
  return <Placeholder title={t('result.title')}>{t('result.placeholder')}</Placeholder>
}

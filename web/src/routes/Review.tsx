import { useTranslation } from 'react-i18next'
import { Placeholder } from './Placeholder'

export default function Review() {
  const { t } = useTranslation()
  return <Placeholder title={t('review.title')}>{t('review.placeholder')}</Placeholder>
}

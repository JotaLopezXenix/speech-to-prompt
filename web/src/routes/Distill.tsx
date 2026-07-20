import { useTranslation } from 'react-i18next'
import { Placeholder } from './Placeholder'

export default function Distill() {
  const { t } = useTranslation()
  return <Placeholder title={t('distill.title')}>{t('distill.placeholder')}</Placeholder>
}

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Placeholder } from './Placeholder'
import { api } from '@/api/client'

type Health = 'checking' | 'ok' | 'fail'

// Placeholder de la fase Captura (la real, con salvaguardas, llega en SPEC-04).
// Comprueba el backend con el CLIENTE TIPADO (SPEC-02) para verificar el lazo
// front→/api/v1 extremo a extremo.
export default function Capture() {
  const { t } = useTranslation()
  const [health, setHealth] = useState<Health>('checking')

  useEffect(() => {
    let alive = true
    api
      .healthDb()
      .then(({ response }) => alive && setHealth(response.ok ? 'ok' : 'fail'))
      .catch(() => alive && setHealth('fail'))
    return () => {
      alive = false
    }
  }, [])

  return (
    <Placeholder title={t('capture.title')}>
      <p>{t('capture.subtitle')}</p>
      <p className="mt-2 text-sm">{t('capture.placeholder')}</p>
      <p className="mt-4 text-sm">
        {health === 'checking' && t('health.checking')}
        {health === 'ok' && <span className="font-medium text-success">● {t('health.ok')}</span>}
        {health === 'fail' && <span className="font-medium text-error">● {t('health.fail')}</span>}
      </p>
    </Placeholder>
  )
}

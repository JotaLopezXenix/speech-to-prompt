import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Wordmark } from '@/components/brand/Wordmark'

// Placeholder de Login (integración MSAL real en SPEC-03).
export default function Login() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6">
      <Wordmark />
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">{t('login.title')}</h1>
      <Button className="w-full max-w-xs" disabled>
        {t('login.cta')}
      </Button>
      <p className="text-sm text-muted-foreground">{t('login.placeholder')}</p>
    </div>
  )
}

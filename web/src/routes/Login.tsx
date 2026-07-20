import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Wordmark } from '@/components/brand/Wordmark'
import { useAuth } from '@/auth/authContext'

// Logo de Microsoft (cuadrícula 2×2 de colores). Decorativo.
function MicrosoftLogo() {
  return (
    <span className="grid grid-cols-2 grid-rows-2 gap-[2px]" aria-hidden="true">
      <span className="size-[9px] bg-[#F25022]" />
      <span className="size-[9px] bg-[#7FBA00]" />
      <span className="size-[9px] bg-[#00A4EF]" />
      <span className="size-[9px] bg-[#FFB900]" />
    </span>
  )
}

// Pantalla de Login (diseño B · Papel). El botón lanza el login MSAL redirect.
export default function Login() {
  const { t } = useTranslation()
  const { login } = useAuth()
  const [signingIn, setSigningIn] = useState(false)

  const onLogin = () => {
    setSigningIn(true)
    login() // navega fuera (redirect); el estado local solo evita doble clic.
  }

  return (
    <div className="flex min-h-dvh flex-col px-7 py-10">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <Wordmark />
        <h1 className="mt-8 max-w-[18rem] text-balance font-display text-3xl font-medium leading-tight tracking-tight text-ink">
          {t('login.tagline')}
        </h1>
        <p className="mt-4 max-w-[18rem] text-[15px] leading-relaxed text-muted-foreground">
          {t('login.subtitle')}
        </p>
      </div>
      <div className="flex flex-col items-center gap-4">
        <Button
          variant="outline"
          className="h-14 w-full max-w-xs gap-3 rounded-[14px] text-[15px] font-semibold"
          onClick={onLogin}
          disabled={signingIn}
        >
          <MicrosoftLogo />
          {signingIn ? t('auth.signingIn') : t('login.cta')}
        </Button>
        <p className="max-w-[18rem] text-center text-[11.5px] leading-relaxed text-muted-foreground/80">
          {t('login.terms')}
        </p>
      </div>
    </div>
  )
}

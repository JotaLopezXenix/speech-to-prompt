import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LogOut } from 'lucide-react'
import { useTheme } from '@/theme/ThemeProvider'
import { useAuth } from '@/auth/authContext'
import { cn } from '@/lib/utils'

const APP_VERSION = '2.0'

// Pantalla "Ajustes" (SPEC-06): cliente-pura (sin red). Cuenta (de useAuth),
// preferencias (tema, idioma) y cerrar sesión. SIN proveedores/claves: el producto
// es secretless (Managed Identity); eso es ops/backoffice del ciclo 6.
export default function Settings() {
  const { t } = useTranslation()
  const { user, isDevBypass, logout } = useAuth()
  const { theme, setTheme } = useTheme()

  const providerLabel = isDevBypass ? t('settings.account.localProvider') : t('settings.account.provider')
  const accountLine = user?.email ? `${user.email} · ${providerLabel}` : providerLabel

  return (
    <section className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-medium tracking-tight text-ink">{t('settings.title')}</h1>

      {/* Cuenta */}
      <div className="flex items-center gap-4 rounded-card border bg-card p-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-semibold text-accent-foreground">
          {user?.initials ?? '?'}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="text-base font-semibold text-ink">{user?.name ?? '—'}</span>
          <span className="truncate text-sm text-muted-foreground">{accountLine}</span>
        </div>
      </div>

      {/* Preferencias */}
      <div className="flex flex-col gap-3">
        <SectionLabel>{t('settings.prefs.title')}</SectionLabel>
        <div className="divide-y divide-border rounded-card border bg-card">
          <div className="flex flex-col gap-3 p-4">
            <span className="text-[0.95rem] font-medium text-ink">{t('settings.prefs.theme')}</span>
            <div className="flex gap-1.5 rounded-full border bg-surface p-1">
              <SegButton active={theme === 'light'} onClick={() => setTheme('light')}>
                {t('settings.prefs.themeLight')}
              </SegButton>
              <SegButton active={theme === 'dark'} onClick={() => setTheme('dark')}>
                {t('settings.prefs.themeDark')}
              </SegButton>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 p-4">
            <span className="text-[0.95rem] font-medium text-ink">{t('settings.prefs.language')}</span>
            <span className="text-sm text-muted-foreground">{t('settings.prefs.languageEs')}</span>
          </div>
        </div>
      </div>

      {/* Cuenta / cerrar sesión (no aplica en devBypass) */}
      {!isDevBypass && (
        <div className="flex flex-col gap-3">
          <SectionLabel>{t('settings.account.title')}</SectionLabel>
          <div className="rounded-card border bg-card">
            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center justify-between gap-3 p-4 text-[0.95rem] font-medium text-error transition-colors hover:bg-error/5"
            >
              <span>{t('settings.logout')}</span>
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">{t('settings.version', { v: APP_VERSION })}</p>
    </section>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[0.65rem] font-semibold uppercase tracking-widest text-muted-foreground">{children}</div>
  )
}

function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex-1 rounded-full py-2 text-sm font-semibold transition-colors',
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

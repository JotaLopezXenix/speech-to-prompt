import { Link } from 'react-router-dom'
import { Clock, LogOut, Moon, Settings as SettingsIcon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Wordmark } from '@/components/brand/Wordmark'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/theme/ThemeProvider'
import { useAuth } from '@/auth/authContext'
import { PATHS } from '@/routes/paths'

export function Header() {
  const { t } = useTranslation()
  const { theme, toggle } = useTheme()
  const { user, logout, isDevBypass } = useAuth()
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur">
      <Link to={PATHS.capture} aria-label="Speech-to-Prompt">
        <Wordmark />
      </Link>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label={t('nav.theme')} onClick={toggle}>
          {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </Button>
        <Button asChild variant="ghost" size="icon" aria-label={t('nav.history')}>
          <Link to={PATHS.history}>
            <Clock className="size-5" />
          </Link>
        </Button>
        <Button asChild variant="ghost" size="icon" aria-label={t('nav.settings')}>
          <Link to={PATHS.settings}>
            <SettingsIcon className="size-5" />
          </Link>
        </Button>
        <span
          className="ml-1 flex size-8 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground"
          title={user?.email ?? user?.name ?? undefined}
        >
          {user?.initials ?? '?'}
        </span>
        {!isDevBypass && (
          <Button variant="ghost" size="icon" aria-label={t('auth.logout')} onClick={logout}>
            <LogOut className="size-5" />
          </Button>
        )}
      </div>
    </header>
  )
}

import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PATHS, PHASES } from '@/routes/paths'

export function Stepper() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const activeIdx = PHASES.findIndex((p) => pathname.startsWith(PATHS[p]))

  return (
    <nav aria-label={t('nav.steps')} className="flex items-center gap-1 border-b bg-background px-4 py-3">
      {PHASES.map((phase, i) => {
        const state = i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'pending'
        return (
          <div key={phase} className="flex flex-1 items-center gap-1 last:flex-none">
            <Link
              to={PATHS[phase]}
              aria-current={state === 'active' ? 'step' : undefined}
              className="flex flex-col items-center gap-1 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span
                className={cn(
                  'flex size-6 items-center justify-center rounded-full border text-xs font-bold transition-colors',
                  state === 'active' && 'border-primary bg-primary text-primary-foreground',
                  state === 'done' && 'border-primary/40 bg-primary/10 text-primary',
                  state === 'pending' && 'border-border bg-background text-muted-foreground',
                )}
              >
                {state === 'done' ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span
                className={cn(
                  'text-[11px]',
                  state === 'active' ? 'font-semibold text-primary' : 'text-muted-foreground',
                )}
              >
                {t(`phases.${phase}`)}
              </span>
            </Link>
            {i < PHASES.length - 1 && (
              <span className={cn('mb-4 h-px flex-1', i < activeIdx ? 'bg-primary/40' : 'bg-border')} />
            )}
          </div>
        )
      })}
    </nav>
  )
}

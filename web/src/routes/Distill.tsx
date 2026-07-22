import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, HelpCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { api, unwrap } from '@/api/client'
import { PATHS } from '@/routes/paths'
import { useActiveSession } from '@/session/activeSessionContext'
import type { Session } from '@/session/activeSessionContext'
import { cn } from '@/lib/utils'

// Modos de destilado. Orden de UI; `limpio` es el default (documentado). El
// backend recibe solo `mode` (sin override de prompt en el front nuevo, SPEC-05).
const MODES = ['limpio', 'completo', 'ligero', 'literal'] as const
type DistillMode = (typeof MODES)[number]

function initialMode(m: string | null | undefined): DistillMode {
  return (MODES as readonly string[]).includes(m ?? '') ? (m as DistillMode) : 'limpio'
}

// Pantalla "Destilado" (SPEC-05): elegir modo y disparar la destilación. Los
// ajustes de formato y destino/formato son hueco "Próximamente" (ciclo 4).
export default function Distill() {
  const { session } = useActiveSession()
  if (!session) return <Navigate to={PATHS.capture} replace />
  return <DistillInner session={session} />
}

function DistillInner({ session }: { session: Session }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { setSession } = useActiveSession()

  const [mode, setMode] = useState<DistillMode>(() => initialMode(session.distill_mode))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onDistill() {
    setBusy(true)
    setError(null)
    try {
      const r = await unwrap(api.distill(session.id, { mode }))
      setSession(r.session)
      navigate(PATHS.result, { state: { truncated: r.truncated } })
    } catch (err) {
      setError(t('distill.error', { msg: (err as Error).message }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex h-full min-h-[60vh] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-medium tracking-tight text-ink">{t('distill.heading')}</h1>
        <Sheet>
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 self-start text-sm font-semibold text-primary hover:underline"
            >
              <HelpCircle className="size-4" />
              {t('distill.whatIs')}
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="gap-2 rounded-t-2xl">
            <SheetHeader>
              <SheetTitle className="font-display text-xl">{t('distill.whatIsTitle')}</SheetTitle>
              <SheetDescription className="whitespace-pre-line text-left text-sm leading-relaxed">
                {t('distill.whatIsBody')}
              </SheetDescription>
            </SheetHeader>
          </SheetContent>
        </Sheet>
      </div>

      {/* Modo de destilado */}
      <div className="flex flex-col gap-3">
        <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-muted-foreground">
          {t('distill.modeLabel')}
        </span>
        <div className="grid grid-cols-2 gap-2.5">
          {MODES.map((m) => (
            <ModeCard key={m} id={m} selected={mode === m} onSelect={() => setMode(m)} />
          ))}
        </div>
      </div>

      {/* Hueco "Próximamente" (ciclo 4/5): anticipación visual, no interactiva. */}
      <div aria-hidden className="pointer-events-none flex select-none flex-col gap-3 opacity-60">
        <div className="flex items-center gap-2">
          <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-muted-foreground">
            {t('distill.settingsTitle')}
          </span>
          <SoonBadge />
        </div>
        <div className="divide-y divide-border rounded-card border bg-surface">
          {[t('distill.settings.role'), t('distill.settings.constraints'), t('distill.settings.detail')].map((label) => (
            <div key={label} className="flex items-center justify-between px-4 py-3.5 text-sm text-muted-foreground">
              <span>{label}</span>
              <span className="h-6 w-10 rounded-full bg-hairline" />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-muted-foreground">
            {t('distill.futureTitle')}
          </span>
          <SoonBadge />
        </div>
        <div className="rounded-card border border-dashed bg-surface p-3.5 text-sm text-muted-foreground">
          {t('distill.futureHint')}
        </div>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      <div className="mt-auto flex pt-2">
        <Button className="flex-1 gap-2" size="lg" disabled={busy} onClick={onDistill}>
          {busy ? (
            <>
              <Loader2 className="size-4 motion-safe:animate-spin" />
              {t('distill.distilling', { mode: t(`distill.mode.${mode}.label`) })}
            </>
          ) : (
            <>
              {t('distill.cta')}
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>
    </section>
  )
}

function ModeCard({ id, selected, onSelect }: { id: DistillMode; selected: boolean; onSelect: () => void }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'flex flex-col gap-1 rounded-card border p-3.5 text-left transition-colors',
        selected ? 'border-primary bg-accent' : 'border-border bg-surface hover:bg-accent/50',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-ink">{t(`distill.mode.${id}.label`)}</span>
        <span
          className={cn(
            'size-4 shrink-0 rounded-full border-2',
            selected ? 'border-primary bg-primary' : 'border-muted-foreground/40',
          )}
        />
      </div>
      <span className="text-xs text-muted-foreground">{t(`distill.mode.${id}.desc`)}</span>
    </button>
  )
}

function SoonBadge() {
  const { t } = useTranslation()
  return (
    <Badge
      variant="outline"
      className="border-warning/40 bg-warning/10 text-[0.6rem] font-bold uppercase tracking-wider text-warning"
    >
      {t('distill.soon')}
    </Badge>
  )
}

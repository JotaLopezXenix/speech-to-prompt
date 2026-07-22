import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Check, Copy, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api, unwrap } from '@/api/client'
import { PATHS } from '@/routes/paths'
import { useActiveSession } from '@/session/activeSessionContext'
import type { Session } from '@/session/activeSessionContext'

function wordCount(s: string): number {
  const trimmed = s.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

// Pantalla "Resultado" (SPEC-05): mostrar el prompt destilado, copiarlo, editarlo
// y empezar un dictado nuevo. Opera sobre la sesión activa (ActiveSession).
export default function Result() {
  const { session } = useActiveSession()
  // Guardas de deep-link: sin sesión → Captura; sin prompt → Destilado.
  if (!session) return <Navigate to={PATHS.capture} replace />
  if (!session.prompt_distilled) return <Navigate to={PATHS.distill} replace />
  return <ResultInner session={session} />
}

function ResultInner({ session }: { session: Session }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { setSession, reset } = useActiveSession()

  const truncated = (location.state as { truncated?: boolean } | null)?.truncated === true

  const [text, setText] = useState(session.prompt_distilled ?? '')
  const savedRef = useRef(text)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current) }, [])

  const words = wordCount(text)
  const modeLabel = session.distill_mode
    ? t(`distill.mode.${session.distill_mode}.label`, { defaultValue: session.distill_mode })
    : '—'

  async function onCopy() {
    setCopyError(false)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 1900)
    } catch {
      setCopyError(true)
    }
  }

  async function onSave() {
    if (text !== savedRef.current) {
      setSaving(true)
      setSaveError(null)
      try {
        const updated = await unwrap(api.updateSession(session.id, { prompt_distilled: text }))
        savedRef.current = text
        setSession(updated)
      } catch (err) {
        setSaveError(t('review.saveError', { msg: (err as Error).message }))
        setSaving(false)
        return
      }
      setSaving(false)
    }
    setEditing(false)
  }

  function onNew() {
    reset()
    navigate(PATHS.capture)
  }

  return (
    <section className="flex h-full min-h-[60vh] flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-medium tracking-tight text-ink">{t('result.heading')}</h1>
        <p className="text-sm text-muted-foreground">{t('result.subtitle')}</p>
      </div>

      {truncated && (
        <div className="flex items-start gap-3 rounded-card border border-warning/40 bg-warning/10 p-3.5 text-sm text-ink">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <strong className="font-semibold">{t('result.truncatedTitle')}</strong> {t('result.truncatedBody')}
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-card border bg-card p-4">
        {editing ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck
            lang="es"
            className="min-h-40 flex-1 resize-none bg-transparent text-[0.95rem] leading-relaxed text-ink outline-none"
          />
        ) : (
          <div className="flex-1 overflow-y-auto whitespace-pre-wrap text-[0.95rem] leading-relaxed text-ink">{text}</div>
        )}
        <div className="flex items-center gap-3 border-t border-dashed pt-3 font-mono text-[0.72rem] text-muted-foreground">
          <span>{t('result.meta', { mode: modeLabel, words: t('review.words', { count: words }) })}</span>
        </div>
      </div>
      {saveError && <p className="text-sm text-error">{saveError}</p>}
      {copyError && <p className="text-sm text-error">{t('result.copyError')}</p>}

      {/* Coste: hueco "Próximamente" (ciclo 5). */}
      <div className="flex items-center justify-between gap-2 rounded-card border border-dashed bg-surface px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('result.cost')}</span>
          <Badge
            variant="outline"
            className="border-warning/40 bg-warning/10 text-[0.6rem] font-bold uppercase tracking-wider text-warning"
          >
            {t('result.soon')}
          </Badge>
        </div>
        <span className="font-mono text-sm text-muted-foreground/60">— · —</span>
      </div>

      <div className="mt-auto flex flex-col gap-2.5 pt-2">
        <Button size="lg" className="w-full gap-2" onClick={onCopy}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? t('result.copied') : t('result.copy')}
        </Button>
        <div className="flex gap-2.5">
          {editing ? (
            <Button variant="outline" className="flex-1 gap-2" disabled={saving} onClick={onSave}>
              {saving && <Loader2 className="size-4 motion-safe:animate-spin" />}
              {t('result.save')}
            </Button>
          ) : (
            <Button variant="outline" className="flex-1" onClick={() => setEditing(true)}>
              {t('result.edit')}
            </Button>
          )}
          <Button variant="outline" className="flex-1" onClick={onNew}>
            {t('result.newDictation')}
          </Button>
        </div>
      </div>
    </section>
  )
}

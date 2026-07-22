import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Loader2, Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api, unwrap } from '@/api/client'
import { PATHS } from '@/routes/paths'
import { useActiveSession } from '@/session/activeSessionContext'
import type { components } from '@/api/schema'
import { cn } from '@/lib/utils'

type SessionListItem = components['schemas']['SessionListItem']
type Status = 'completed' | 'distilling' | 'capturing' | 'draft'
type Filter = 'all' | 'inProgress' | 'completed'
type Group = 'today' | 'week' | 'earlier'

const FILTERS: Filter[] = ['all', 'inProgress', 'completed']
const GROUP_ORDER: Group[] = ['today', 'week', 'earlier']

function statusOf(s: SessionListItem): Status {
  if (s.has_prompt) return 'completed'
  if (s.has_transcription) return 'distilling'
  if (s.segment_count > 0) return 'capturing'
  return 'draft'
}

function matchesFilter(s: SessionListItem, f: Filter): boolean {
  if (f === 'completed') return s.has_prompt
  if (f === 'inProgress') return !s.has_prompt
  return true
}

function groupOf(ts: string | null | undefined): Group {
  if (!ts) return 'earlier'
  const d = new Date(ts)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (d >= startOfToday) return 'today'
  const weekAgo = new Date(startOfToday)
  weekAgo.setDate(weekAgo.getDate() - 7)
  if (d >= weekAgo) return 'week'
  return 'earlier'
}

function relTime(ts: string | null | undefined): string {
  if (!ts) return ''
  const secs = Math.round((Date.now() - new Date(ts).getTime()) / 1000)
  if (secs < 60) return 'ahora'
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })
  const min = Math.round(secs / 60)
  if (min < 60) return rtf.format(-min, 'minute')
  const h = Math.round(secs / 3600)
  if (h < 24) return rtf.format(-h, 'hour')
  const day = Math.round(secs / 86400)
  if (day < 7) return rtf.format(-day, 'day')
  return new Date(ts).toLocaleDateString('es')
}

// Pantalla "Historial" (SPEC-06): lista de sesiones del usuario, agrupadas y
// filtrables; reabrir carga la sesión en ActiveSession y navega a la fase correcta;
// "Reprocesar" rescata las que tienen audio sin transcribir.
export default function History() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { setSession, reset } = useActiveSession()

  const [items, setItems] = useState<SessionListItem[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [openingId, setOpeningId] = useState<number | null>(null)
  const [reprocessingId, setReprocessingId] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function load() {
    setLoadError(null)
    setItems(null)
    try {
      setItems(await unwrap(api.listSessions()))
    } catch (err) {
      setLoadError(t('history.loadError', { msg: (err as Error).message }))
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function reopen(s: SessionListItem) {
    if (openingId || reprocessingId) return
    setOpeningId(s.id)
    setActionError(null)
    try {
      const full = await unwrap(api.getSession(s.id))
      setSession(full)
      if (full.prompt_distilled) navigate(PATHS.result)
      else if (full.transcription_edited || full.transcription_raw) navigate(PATHS.review)
      else navigate(PATHS.capture)
    } catch (err) {
      setActionError(t('history.reopenError', { msg: (err as Error).message }))
      setOpeningId(null)
    }
  }

  async function reprocess(s: SessionListItem) {
    if (openingId || reprocessingId) return
    setReprocessingId(s.id)
    setActionError(null)
    try {
      const r = await unwrap(api.reprocess(s.id))
      setSession(r.session)
      navigate(PATHS.review)
    } catch (err) {
      setActionError(t('history.reprocessError', { msg: (err as Error).message }))
      setReprocessingId(null)
    }
  }

  function onNew() {
    reset()
    navigate(PATHS.capture)
  }

  const busy = openingId !== null || reprocessingId !== null
  const filtered = (items ?? []).filter((s) => matchesFilter(s, filter))
  const grouped: Record<Group, SessionListItem[]> = { today: [], week: [], earlier: [] }
  for (const s of filtered) grouped[groupOf(s.timestamp)].push(s)

  return (
    <section className="flex h-full min-h-[60vh] flex-col gap-4">
      <h1 className="font-display text-2xl font-medium tracking-tight text-ink">{t('history.title')}</h1>

      {/* Filtros */}
      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors',
              filter === f
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-surface text-muted-foreground hover:bg-accent/50',
            )}
          >
            {t(`history.filters.${f}`)}
          </button>
        ))}
      </div>

      {actionError && <p className="text-sm text-error">{actionError}</p>}

      {/* Contenido */}
      <div className="flex flex-1 flex-col gap-5">
        {loadError ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-error">{loadError}</p>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              {t('history.retry')}
            </Button>
          </div>
        ) : items === null ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <Loader2 className="size-5 motion-safe:animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('history.empty')}</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('history.emptyFilter')}</p>
        ) : (
          GROUP_ORDER.filter((g) => grouped[g].length > 0).map((g) => (
            <div key={g} className="flex flex-col gap-2">
              <div className="text-[0.65rem] font-semibold uppercase tracking-widest text-muted-foreground">
                {t(`history.groups.${g}`)}
              </div>
              {grouped[g].map((s) => (
                <SessionCard
                  key={s.id}
                  item={s}
                  busy={busy}
                  opening={openingId === s.id}
                  reprocessing={reprocessingId === s.id}
                  onOpen={() => void reopen(s)}
                  onReprocess={() => void reprocess(s)}
                />
              ))}
            </div>
          ))
        )}
      </div>

      {/* Nuevo dictado */}
      <div className="mt-auto pt-2">
        <Button size="lg" className="w-full gap-2" onClick={onNew}>
          <Plus className="size-5" />
          {t('history.newDictation')}
        </Button>
      </div>
    </section>
  )
}

function SessionCard({
  item,
  busy,
  opening,
  reprocessing,
  onOpen,
  onReprocess,
}: {
  item: SessionListItem
  busy: boolean
  opening: boolean
  reprocessing: boolean
  onOpen: () => void
  onReprocess: () => void
}) {
  const { t } = useTranslation()
  const status = statusOf(item)
  const title = item.preview ?? t('history.untitled')
  const canReprocess = item.has_audio && !item.has_transcription
  const metaTail =
    status === 'completed' ? t('history.meta.segments', { count: item.segment_count }) : t('history.meta.resume')

  return (
    <div className="overflow-hidden rounded-card border bg-card">
      <button
        type="button"
        onClick={onOpen}
        disabled={busy}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-accent/40 disabled:opacity-60"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="truncate text-[0.95rem] font-semibold text-ink">{title}</span>
          <div className="flex items-center gap-2">
            <StatusBadge status={status} />
            <span className="truncate text-xs text-muted-foreground">
              {relTime(item.timestamp)} · {metaTail}
            </span>
          </div>
        </div>
        {opening ? (
          <Loader2 className="size-4 shrink-0 text-muted-foreground motion-safe:animate-spin" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      {canReprocess && (
        <div className="border-t border-dashed px-4 py-2">
          <button
            type="button"
            onClick={onReprocess}
            disabled={busy}
            className="flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80 disabled:opacity-60"
          >
            {reprocessing ? (
              <Loader2 className="size-4 motion-safe:animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {reprocessing ? t('history.reprocessing') : t('history.reprocess')}
          </button>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: Status }) {
  const { t } = useTranslation()
  const tone: Record<Status, string> = {
    completed: 'bg-accent text-success',
    distilling: 'bg-accent text-primary',
    capturing: 'bg-warning/10 text-warning',
    draft: 'bg-muted text-muted-foreground',
  }
  return (
    <span
      className={cn('shrink-0 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold', tone[status])}
    >
      {t(`history.status.${status}`)}
    </span>
  )
}

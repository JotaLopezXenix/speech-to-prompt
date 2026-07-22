import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Check, Loader2, Pause, Play, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api, unwrap } from '@/api/client'
import { formatTime } from '@/capture/audio-recorder'
import { PATHS } from '@/routes/paths'
import { useActiveSession } from '@/session/activeSessionContext'
import type { Session } from '@/session/activeSessionContext'
import { cn } from '@/lib/utils'

function wordCount(s: string): number {
  const trimmed = s.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

// Pantalla "Revisión" (SPEC-05): revisar/editar la transcripción, reproducir el
// audio de cada tramo y avanzar a Destilado. Opera sobre la sesión activa
// (ActiveSession, SPEC-04); no vuelve a pedirla por id.
export default function Review() {
  const { session } = useActiveSession()
  // Guarda de deep-link: sin sesión activa no hay nada que revisar.
  if (!session) return <Navigate to={PATHS.capture} replace />
  return <ReviewInner session={session} />
}

function ReviewInner({ session }: { session: Session }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { setSession } = useActiveSession()

  const segments = session.segments ?? []
  const segCount = segments.length

  // Texto editable, sembrado de edited||raw. `savedRef` = último valor persistido.
  const [text, setText] = useState(() => session.transcription_edited || session.transcription_raw || '')
  const savedRef = useRef(text)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const words = wordCount(text)

  // Reproducción de audio por tramo (consume getSegmentAudio; diferido de SPEC-04).
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlCacheRef = useRef<Map<number, string>>(new Map())
  const [playing, setPlaying] = useState<number | null>(null)
  const [loadingAudio, setLoadingAudio] = useState<number | null>(null)
  const [audioError, setAudioError] = useState(false)

  useEffect(() => {
    const audio = new Audio()
    audio.onended = () => setPlaying(null)
    audioRef.current = audio
    const urls = urlCacheRef.current
    return () => {
      audio.pause()
      audio.onended = null
      urls.forEach((u) => URL.revokeObjectURL(u))
      urls.clear()
    }
  }, [])

  async function togglePlay(ordinal: number) {
    const audio = audioRef.current
    if (!audio) return
    if (playing === ordinal) {
      audio.pause()
      setPlaying(null)
      return
    }
    setAudioError(false)
    try {
      let url = urlCacheRef.current.get(ordinal)
      if (!url) {
        setLoadingAudio(ordinal)
        const blob = await unwrap(api.getSegmentAudio(session.id, ordinal))
        url = URL.createObjectURL(blob)
        urlCacheRef.current.set(ordinal, url)
      }
      audio.src = url
      audio.currentTime = 0
      await audio.play()
      setPlaying(ordinal)
    } catch {
      setAudioError(true)
      setPlaying(null)
    } finally {
      setLoadingAudio(null)
    }
  }

  // Persiste transcription_edited solo si cambió. Devuelve true si quedó a salvo
  // (o no había nada que guardar) para poder navegar sin perder la edición.
  async function persist(): Promise<boolean> {
    if (text === savedRef.current) return true
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await unwrap(api.updateSession(session.id, { transcription_edited: text }))
      savedRef.current = text
      setSession(updated)
      return true
    } catch (err) {
      setSaveError(t('review.saveError', { msg: (err as Error).message }))
      return false
    } finally {
      setSaving(false)
    }
  }

  async function onAddSegment() {
    if (await persist()) navigate(PATHS.capture)
  }
  async function onDistill() {
    if (await persist()) navigate(PATHS.distill)
  }

  return (
    <section className="flex h-full min-h-[60vh] flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-medium tracking-tight text-ink">{t('review.heading')}</h1>
        <p className="text-sm text-muted-foreground">{t('review.subtitle', { count: segCount })}</p>
      </div>

      {segCount > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {segments.map((s, i) => (
            <TramoChip
              key={i}
              n={i + 1}
              seconds={s.duration_seconds}
              imported={s.source === 'imported'}
              playable={!!s.audio_file}
              playing={playing === i + 1}
              loading={loadingAudio === i + 1}
              onToggle={() => togglePlay(i + 1)}
            />
          ))}
        </div>
      )}
      {audioError && <p className="text-sm text-error">{t('review.audioError')}</p>}

      <div className="flex items-center justify-between">
        <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-muted-foreground">
          {t('review.transcript')}
        </span>
        <span className="font-mono text-xs text-muted-foreground">{t('review.words', { count: words })}</span>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => void persist()}
        spellCheck
        lang="es"
        placeholder={t('review.empty')}
        className="min-h-40 flex-1 resize-none rounded-card border bg-card p-4 text-[0.95rem] leading-relaxed text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      />
      {saveError && <p className="text-sm text-error">{saveError}</p>}

      <div className="mt-auto flex gap-3 pt-2">
        <Button variant="outline" className="gap-2" disabled={saving} onClick={onAddSegment}>
          <Plus className="size-4" />
          {t('review.addSegment')}
        </Button>
        <Button className="flex-1 gap-2" disabled={words === 0 || saving} onClick={onDistill}>
          {saving ? <Loader2 className="size-4 motion-safe:animate-spin" /> : null}
          {t('review.distill')}
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </section>
  )
}

function TramoChip({
  n,
  seconds,
  imported,
  playable,
  playing,
  loading,
  onToggle,
}: {
  n: number
  seconds?: number | null
  imported: boolean
  playable: boolean
  playing: boolean
  loading: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()
  const label = `${t('review.tramo', { n })}${imported ? ` · ${t('review.imported')}` : ''}`
  const icon = loading ? (
    <Loader2 className="size-2.5 motion-safe:animate-spin" />
  ) : playing ? (
    <Pause className="size-2.5" />
  ) : playable ? (
    <Play className="size-2.5" />
  ) : (
    <Check className="size-2.5" />
  )
  const inner = (
    <>
      <span className="flex size-4 items-center justify-center rounded-full bg-accent text-success">{icon}</span>
      <span className="text-[0.8rem] font-medium text-ink">{label}</span>
      <span className="font-mono text-[0.72rem] text-muted-foreground">{seconds ? formatTime(seconds) : '—'}</span>
    </>
  )
  const base = 'flex shrink-0 items-center gap-2 rounded-full border bg-surface px-3 py-1.5'
  if (!playable) return <div className={base}>{inner}</div>
  return (
    <button
      type="button"
      aria-label={playing ? t('review.pause', { n }) : t('review.play', { n })}
      onClick={onToggle}
      className={cn(base, 'transition-colors hover:bg-accent')}
    >
      {inner}
    </button>
  )
}

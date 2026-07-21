import { useRef, type ChangeEvent, type MouseEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Check, Loader2, Mic, Pause, Play, Square, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatTime } from '@/capture/audio-recorder'
import { useCapture } from '@/capture/useCapture'
import { cn } from '@/lib/utils'

// Variación estática de las barras del waveform (semilla del diseño 2a). La altura
// real la modula el nivel de micro en vivo (useCapture.liveLevel), así que el
// waveform refleja audio real; sin animación decorativa → reduce-motion-safe.
const WAVE_SEED = [
  7, 3, 6, 9, 4, 8, 5, 2, 7, 9, 3, 6, 8, 4, 9, 5, 7, 3, 8, 6, 4, 9, 7, 5, 3, 8, 6, 9, 4, 7, 5, 2, 6, 8, 3, 9, 5, 7, 4, 6,
]

export default function Capture() {
  const { t } = useTranslation()
  const c = useCapture()
  const fileRef = useRef<HTMLInputElement>(null)

  const recording = c.status === 'recording'
  const paused = c.status === 'paused'
  const idle = !recording && !paused && !c.busy
  const live = c.segments.length > 0 || recording || paused || c.busy
  const tramoNum = c.segments.length + 1

  function onImportChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) c.importFile(f)
  }

  const mainLabel = c.busy ? t('capture.transcribing') : recording || paused ? t('capture.stop') : t('capture.record')

  return (
    <section className="flex h-full min-h-[60vh] flex-col gap-4">
      {/* ---- Contenido ---- */}
      <div className="flex flex-1 flex-col gap-4">
        {/* Banners (canal compartido, como el warnBox viejo) */}
        {c.banner?.kind === 'safeguard' && (
          <WarnCard tone="warning" title={t('capture.safeguard.title')} message={c.banner.message}>
            <Button variant="outline" onClick={c.dismissBanner}>
              {t('capture.safeguard.discard')}
            </Button>
            <Button onClick={c.confirmBanner}>{t('capture.safeguard.keep')}</Button>
          </WarnCard>
        )}
        {c.banner?.kind === 'retry' && (
          <WarnCard tone="warning" title={t('capture.retry.title')} message={c.banner.message}>
            <Button variant="outline" onClick={c.discardRetry}>
              {t('capture.retry.discard')}
            </Button>
            <Button onClick={c.retryUpload}>{t('capture.retry.retry')}</Button>
          </WarnCard>
        )}
        {c.banner?.kind === 'suspect' && (
          <WarnCard tone="warning" title={t('capture.guard.suspectTitle')} message={c.banner.message}>
            <Button variant="outline" onClick={c.dismissBanner}>
              {t('capture.guard.discard')}
            </Button>
            <Button onClick={c.confirmBanner}>{t('capture.guard.send')}</Button>
          </WarnCard>
        )}
        {recording && c.noSignal && (
          <div className="flex items-start gap-3 rounded-card border border-warning/40 bg-warning/10 p-3 text-sm text-ink">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>{t('capture.warn.noSignal')}</span>
          </div>
        )}
        {c.error && <p className="text-sm text-error">{c.error}</p>}

        {/* Selector de micro + medidor: SOLO escritorio y en reposo (pre-grabación) */}
        {c.isDesktop && idle && (
          <MicControls
            devices={c.micDevices}
            selected={c.selectedDeviceId}
            level={c.liveLevel}
            status={c.micStatus}
            label={t('capture.mic.label')}
            onChange={c.setDevice}
          />
        )}

        {!live ? (
          // ---- Estado Listo ----
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <h1 className="max-w-[18rem] text-balance font-display text-3xl font-medium leading-tight tracking-tight text-ink">
              {t('capture.hero.title')}
            </h1>
            <p className="max-w-[17rem] text-muted-foreground">{t('capture.hero.subtitle')}</p>
          </div>
        ) : (
          // ---- Estado en vivo (grabando / transcribiendo / con tramos) ----
          <div className="flex flex-1 flex-col gap-4">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  'font-mono text-5xl font-medium tabular-nums',
                  recording ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {formatTime(c.elapsed)}
              </div>
              <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {recording
                  ? t('capture.live.recording', { n: tramoNum })
                  : c.busy
                    ? t('capture.live.processing', { n: tramoNum })
                    : paused
                      ? t('capture.live.paused')
                      : t('capture.live.ready')}
              </div>
            </div>

            <Waveform level={c.liveLevel} active={recording} />

            <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-card border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-muted-foreground">
                  {t('capture.transcript')}
                </span>
                <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('capture.segmentsCount', { count: c.segments.length })}
                </span>
              </div>
              <p className="overflow-y-auto whitespace-pre-wrap text-[0.95rem] leading-relaxed text-ink">
                {c.mergedTranscript || t('capture.transcriptEmpty')}
              </p>
              {recording && (
                <div className="mt-auto flex items-center gap-2 border-t border-dashed pt-2.5">
                  <span className="size-2 shrink-0 rounded-full bg-primary motion-safe:animate-pulse" />
                  <span className="text-sm text-muted-foreground">{t('capture.live.listening', { n: tramoNum })}</span>
                </div>
              )}
              {c.busy && (
                <div className="mt-auto flex items-center gap-2 border-t border-dashed pt-2.5">
                  <Loader2 className="size-3.5 shrink-0 text-primary motion-safe:animate-spin" />
                  <span className="text-sm text-muted-foreground">{t('capture.live.processing', { n: tramoNum })}</span>
                </div>
              )}
            </div>

            {c.segments.length > 0 && (
              <div>
                <div className="mb-2 text-[0.65rem] font-semibold uppercase tracking-widest text-muted-foreground">
                  {t('capture.tramos')}
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {c.segments.map((s, i) => (
                    <TramoChip key={i} index={i + 1} seconds={s.duration_seconds} imported={s.source === 'imported'} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---- Barra de controles (al fondo) ---- */}
      <div className="flex flex-col items-center gap-3 pt-2">
        {live ? (
          <div className="flex items-center justify-center gap-6">
            <Button
              variant="outline"
              size="icon-lg"
              className="rounded-full"
              aria-label={paused ? t('capture.resume') : t('capture.pause')}
              disabled={!recording && !paused}
              onClick={c.pauseResume}
            >
              {paused ? <Play className="size-5" /> : <Pause className="size-5" />}
            </Button>

            <RecordButton label={mainLabel} busy={c.busy} stopIcon={recording || paused} onClick={c.toggleRecord} />

            <Button
              variant="outline"
              size="icon-lg"
              className="rounded-full"
              aria-label={t('capture.finalize')}
              disabled={!idle || !c.canFinalize}
              onClick={c.finalize}
            >
              <Check className="size-5" />
            </Button>
          </div>
        ) : (
          <>
            <RecordButton label={mainLabel} busy={c.busy} stopIcon={false} onClick={c.toggleRecord} />
            <span className="text-sm text-muted-foreground">{t('capture.cta.start')}</span>
          </>
        )}

        {/* Importar (control secundario, siempre disponible en reposo) */}
        <Button variant="ghost" size="sm" className="gap-2" disabled={!idle} onClick={() => fileRef.current?.click()}>
          <Upload className="size-4" />
          {t('capture.import')}
        </Button>
        <input ref={fileRef} type="file" accept="audio/*" hidden onChange={onImportChange} />
      </div>
    </section>
  )
}

// ---- Subcomponentes -------------------------------------------------------

function RecordButton({
  label,
  busy,
  stopIcon,
  onClick,
}: {
  label: string
  busy: boolean
  stopIcon: boolean
  onClick: (e: MouseEvent) => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={busy}
      onClick={onClick}
      className="relative flex size-[88px] items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform disabled:opacity-70 motion-safe:active:scale-95"
    >
      {busy ? (
        <Loader2 className="size-8 motion-safe:animate-spin" />
      ) : stopIcon ? (
        <Square className="size-7" fill="currentColor" />
      ) : (
        <Mic className="size-8" />
      )}
    </button>
  )
}

function Waveform({ level, active }: { level: number; active: boolean }) {
  return (
    <div className="flex h-16 items-center justify-center gap-[3px]" aria-hidden>
      {WAVE_SEED.map((seed, i) => {
        const base = 4 + seed
        const h = active ? Math.max(4, Math.min(56, level * 90 * (0.5 + seed / 12))) : Math.min(10, base)
        return (
          <span
            key={i}
            className={cn('w-[3px] rounded-full transition-[height] duration-100', active ? 'bg-primary' : 'bg-hairline')}
            style={{ height: `${h}px` }}
          />
        )
      })}
    </div>
  )
}

function TramoChip({ index, seconds, imported }: { index: number; seconds?: number | null; imported?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-full border bg-surface px-3 py-1.5">
      <span className="flex size-4 items-center justify-center rounded-full bg-accent text-[0.6rem] font-extrabold text-success">
        <Check className="size-2.5" />
      </span>
      <span className="text-[0.8rem] font-medium text-ink">
        {t('capture.tramo', { n: index })}
        {imported ? ` · ${t('capture.imported')}` : ''}
      </span>
      <span className="font-mono text-[0.72rem] text-muted-foreground">{seconds ? formatTime(seconds) : '—'}</span>
    </div>
  )
}

function WarnCard({
  tone,
  title,
  message,
  children,
}: {
  tone: 'warning'
  title: string
  message: string
  children: ReactNode
}) {
  return (
    <div className={cn('flex flex-col gap-3 rounded-card border p-3.5', 'border-warning/40 bg-warning/10')}>
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-primary-foreground',
            tone === 'warning' && 'bg-warning',
          )}
        >
          !
        </span>
        <div className="text-sm leading-relaxed text-ink">
          <strong className="font-semibold">{title}</strong> {message}
        </div>
      </div>
      <div className="flex gap-2">{children}</div>
    </div>
  )
}

function MicControls({
  devices,
  selected,
  level,
  status,
  label,
  onChange,
}: {
  devices: { deviceId: string; label: string }[]
  selected: string
  level: number
  status: { text: string; error: boolean } | null
  label: string
  onChange: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-2 rounded-card border bg-surface p-3">
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <Mic className="size-4 shrink-0" />
        <span className="shrink-0">{label}</span>
        <select
          value={selected}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 rounded-input border bg-card px-2 py-1 text-sm text-ink"
        >
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
      </label>
      <div className="h-1.5 overflow-hidden rounded-full bg-hairline">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-100"
          style={{ width: `${Math.min(100, level * 300)}%` }}
        />
      </div>
      {status && <div className={cn('text-xs', status.error ? 'text-error' : 'text-muted-foreground')}>{status.text}</div>}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { components } from '@/api/schema'
import { api, unwrap } from '@/api/client'
import { PATHS } from '@/routes/paths'
import { useActiveSession } from '@/session/activeSessionContext'
import { AudioRecorder, type ExternalStopMeta } from './audio-recorder'
import { checkAudio } from './audio-guards'
import { MicMeter } from './mic-meter'
import { diag } from './diagnostics'
import { CAPTURE_EVENTS as EV } from './events'

// Re-expresión (SPEC-04) de la orquestación de public/js/phases/phase1-capture.js
// como hook React, preservando su comportamiento (R1). El estado mutable que leen
// los callbacks cableados una sola vez (onExternalStop) vive en refs, como el
// closure `let` del viejo; el estado de render se refleja con setState.

type Segment = components['schemas']['Segment']

const PREFERRED_MIC_KEY = 'stp.preferredMicId'
const PEAK_MIN = 0.01 // RMS mínimo para considerar que hay señal
const SILENCE_ARM_MS = 3000 // margen antes de avisar "sin señal" durante la grabación
const PREVIEW_ARM_MS = 3000 // margen del preview pre-grabación (escritorio)

export type CaptureStatus = 'idle' | 'recording' | 'paused'
export type BannerKind = 'suspect' | 'safeguard' | 'retry'
export type MicStatus = { text: string; error: boolean }
export type MicDevice = { deviceId: string; label: string }

export type CaptureController = {
  // Estado de render
  status: CaptureStatus
  busy: boolean
  elapsed: number
  liveLevel: number
  noSignal: boolean
  segments: Segment[]
  mergedTranscript: string
  banner: { kind: BannerKind; message: string } | null
  error: string | null
  canFinalize: boolean
  isDesktop: boolean
  micDevices: MicDevice[]
  selectedDeviceId: string
  micStatus: MicStatus | null
  // Acciones
  toggleRecord: (e?: { nativeEvent?: Event; detail?: number }) => void
  pauseResume: () => void
  finalize: () => void
  importFile: (file: File) => void
  setDevice: (id: string) => void
  confirmBanner: () => void // suspect: enviar / safeguard: guardar
  dismissBanner: () => void // suspect/safeguard: descartar
  retryUpload: () => void
  discardRetry: () => void
}

type CommitOpts = { source?: 'recorded' | 'imported'; seconds?: number; filename?: string; skipGuard?: boolean }

export function useCapture(): CaptureController {
  const navigate = useNavigate()
  const active = useActiveSession()
  const { t } = useTranslation()

  // --- Instancias imperativas (una sola vez) --------------------------------
  const recorderRef = useRef<AudioRecorder | null>(null)
  if (!recorderRef.current) recorderRef.current = new AudioRecorder()
  const recorder = recorderRef.current
  const meterRef = useRef<MicMeter | null>(null)
  if (!meterRef.current) meterRef.current = new MicMeter()
  const meter = meterRef.current

  // --- Estado de render ------------------------------------------------------
  const [status, setStatus] = useState<CaptureStatus>('idle')
  const [busy, setBusyState] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [liveLevel, setLiveLevel] = useState(0)
  const [noSignal, setNoSignal] = useState(false)
  const [segments, setSegments] = useState<Segment[]>([])
  const [mergedTranscript, setMergedTranscript] = useState('')
  const [banner, setBanner] = useState<{ kind: BannerKind; message: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [micDevices, setMicDevices] = useState<MicDevice[]>([])
  const [selectedDeviceId, setSelectedDeviceIdState] = useState(() => localStorage.getItem(PREFERRED_MIC_KEY) || '')
  const [micStatus, setMicStatus] = useState<MicStatus | null>(null)
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches,
  )

  // --- Estado de lógica (refs; lo leen callbacks cableados una vez) ----------
  const sessionIdRef = useRef<number | null>(null)
  const busyRef = useRef(false)
  const selectedDeviceIdRef = useRef(selectedDeviceId)
  const pendingRetryRef = useRef<{ blob: Blob; opts: CommitOpts } | null>(null)
  const bannerResolveRef = useRef<((v: boolean) => void) | null>(null)
  // Candado de reentrada: cubre toda la operación async de toggleRecord (parar +
  // commit + banner suspect, o arrancar). Reemplaza el `btnRecord.disabled=true`
  // que el viejo mantenía durante stop()/commit; evita que un 2º clic (o Grabar
  // durante el banner suspect) arranque una grabación espuria o cuelgue el commit.
  const transitioningRef = useRef(false)
  const signalDetectedRef = useRef(false)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previewStreamRef = useRef<MediaStream | null>(null)
  const previewStartedAtRef = useRef(0)
  const isDesktopRef = useRef(isDesktop)
  const handleExternalStopRef = useRef<(blob: Blob, meta: ExternalStopMeta) => void>(() => {})

  const setBusy = (v: boolean) => {
    busyRef.current = v
    setBusyState(v)
  }
  const setSelectedDeviceId = (v: string) => {
    selectedDeviceIdRef.current = v
    setSelectedDeviceIdState(v)
  }

  // Nivel del waveform cuantizado: el analyser dispara ~60 veces/s; solo re-render
  // cuando el nivel redondeado cambia (el viejo actualizaba un ancho de DOM directo).
  const lastLevelRef = useRef(0)
  function pushLevel(rms: number) {
    const q = Math.min(1, Math.round(rms / 0.02) * 0.02)
    if (q !== lastLevelRef.current) {
      lastLevelRef.current = q
      setLiveLevel(q)
    }
  }
  function resetLevel() {
    lastLevelRef.current = 0
    setLiveLevel(0)
  }

  // --- Banners con promesa (suspect / safeguard) -----------------------------
  function askBanner(kind: BannerKind, message: string): Promise<boolean> {
    return new Promise((resolve) => {
      bannerResolveRef.current = resolve
      setBanner({ kind, message })
    })
  }
  function resolveBanner(value: boolean) {
    const r = bannerResolveRef.current
    bannerResolveRef.current = null
    setBanner(null)
    r?.(value)
  }

  // --- Preview / medición del micrófono --------------------------------------
  function stopPreview() {
    meter.stop()
    if (previewStreamRef.current) {
      previewStreamRef.current.getTracks().forEach((t) => t.stop())
      previewStreamRef.current = null
    }
    resetLevel()
  }

  async function startPreview(deviceId: string) {
    if (!isDesktopRef.current) return // preview pre-grabación solo en escritorio
    stopPreview()
    let stream: MediaStream
    try {
      const constraints = deviceId ? { deviceId: { exact: deviceId } } : true
      stream = await navigator.mediaDevices.getUserMedia({ audio: constraints })
    } catch (err) {
      setMicStatus({ text: t('capture.mic.openError', { msg: (err as Error).message }), error: true })
      return
    }
    previewStreamRef.current = stream
    setMicStatus({ text: t('capture.mic.checkLevel'), error: false })
    previewStartedAtRef.current = Date.now()
    meter.resetPeak()
    meter.onLevel = (rms) => {
      pushLevel(rms)
      const peak = meter.peakSinceReset
      if (!recorder.isRecording && Date.now() - previewStartedAtRef.current > PREVIEW_ARM_MS && peak < PEAK_MIN) {
        setMicStatus({ text: t('capture.mic.noSignalPreview'), error: true })
      } else if (peak >= PEAK_MIN && !recorder.isRecording) {
        setMicStatus({ text: t('capture.mic.detected'), error: false })
      }
    }
    meter.start(stream)
  }

  // Medición EN VIVO durante la grabación (todas las plataformas): alimenta el
  // waveform y arma el aviso "sin señal" (latcheado al primer pico → inmune a pausas).
  function attachLiveMeter(stream: MediaStream) {
    signalDetectedRef.current = false
    setNoSignal(false)
    meter.resetPeak()
    meter.onLevel = (rms) => {
      pushLevel(rms)
      if (rms >= PEAK_MIN && !signalDetectedRef.current) {
        signalDetectedRef.current = true
        setNoSignal(false)
      }
    }
    meter.start(stream)
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    silenceTimerRef.current = setTimeout(() => {
      if (!signalDetectedRef.current) setNoSignal(true)
    }, SILENCE_ARM_MS)
  }

  function stopLiveMeter() {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    meter.stop()
    setNoSignal(false)
    resetLevel()
  }

  async function populateDeviceList() {
    let tmpStream: MediaStream | null = null
    try {
      tmpStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      setError(
        (err as Error).name === 'NotAllowedError'
          ? t('capture.error.micDenied')
          : t('capture.error.micAccess', { msg: (err as Error).message }),
      )
      return
    } finally {
      if (tmpStream) tmpStream.getTracks().forEach((t) => t.stop())
    }

    const devices = await navigator.mediaDevices.enumerateDevices()
    const mics = devices
      .filter((d) => d.kind === 'audioinput')
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Micrófono ${i + 1}` }))
    setMicDevices(mics)

    let chosen = selectedDeviceIdRef.current
    if (!(chosen && mics.some((m) => m.deviceId === chosen)) && mics.length > 0) {
      chosen = mics[0].deviceId
    }
    setSelectedDeviceId(chosen)
    await startPreview(chosen)
  }

  // --- Sonda de Media Session (log-only, H1) ---------------------------------
  function startMediaSessionProbe() {
    const ms = navigator.mediaSession
    if (!ms?.setActionHandler) return
    for (const action of ['play', 'pause', 'stop'] as const) {
      try {
        ms.setActionHandler(action, () => diag.logEvent(EV.mediasessionAction, { action }))
      } catch {
        /* algunos navegadores no soportan ciertas acciones */
      }
    }
  }
  function stopMediaSessionProbe() {
    const ms = navigator.mediaSession
    if (!ms?.setActionHandler) return
    for (const action of ['play', 'pause', 'stop'] as const) {
      try {
        ms.setActionHandler(action, null)
      } catch {
        /* idem */
      }
    }
  }

  // --- Confirmar y subir un segmento -----------------------------------------
  async function commitSegment(blob: Blob, opts: CommitOpts = {}) {
    const { source = 'recorded', seconds = 0, filename = 'audio.webm', skipGuard = false } = opts
    setError(null)

    // Guard solo para grabaciones; un import es deliberado. `skipGuard` lo usan la
    // salvaguarda de corte externo y el reintento: ese audio ya se confirmó.
    if (source === 'recorded' && !skipGuard) {
      const verdict = checkAudio(blob.size, seconds)
      if (verdict.level !== 'ok') {
        const send = await askBanner('suspect', verdict.message!)
        if (!send) return
      }
    }

    setBusy(true)
    stopPreview()

    try {
      if (sessionIdRef.current == null) {
        const session = await unwrap(api.createSession())
        sessionIdRef.current = session.id
        active.setSession(session)
        diag.setSessionId(session.id)
      }
      const res = await unwrap(api.addSegment(sessionIdRef.current, blob, { source, filename }))
      setSegments((prev) => res.session.segments ?? prev)
      setMergedTranscript((prev) => res.transcription_raw || prev)
      active.setSession(res.session)
      clearRetry() // éxito: descarta cualquier slot/banner de un intento previo
    } catch (err) {
      // No perder el audio: retenerlo y ofrecer reintentar (cold-start de la BD, etc.).
      pendingRetryRef.current = { blob, opts }
      setBanner({ kind: 'retry', message: t('capture.retry.message', { msg: (err as Error).message }) })
    } finally {
      setBusy(false)
      void startPreview(selectedDeviceIdRef.current)
    }
  }

  // --- Salvaguarda ante stop EXTERNO -----------------------------------------
  async function handleExternalStop(blob: Blob, meta: ExternalStopMeta) {
    stopMediaSessionProbe()
    stopLiveMeter()
    setStatus('idle')
    setElapsed(0)
    diag.logEvent(EV.chunksPreserved, { chunkCount: meta?.chunkCount, totalBytes: meta?.totalBytes })

    if (blob && blob.size > 0) {
      const keep = await askBanner('safeguard', t('capture.safeguard.message'))
      if (keep) {
        diag.logEvent(EV.recoveredSegmentKept, { totalBytes: blob.size })
        await commitSegment(blob, { source: 'recorded', seconds: meta?.elapsedSeconds || 0, skipGuard: true })
      } else {
        diag.logEvent(EV.recoveredSegmentDiscarded, {})
        void startPreview(selectedDeviceIdRef.current)
      }
    } else {
      diag.logEvent(EV.recoveredSegmentEmpty, {})
      void startPreview(selectedDeviceIdRef.current)
    }
    diag.endCaptureRun()
  }
  handleExternalStopRef.current = handleExternalStop

  // --- Reintento de subida (slot único, no idempotente = A2) -----------------
  function clearRetry() {
    pendingRetryRef.current = null
    setBanner((b) => (b?.kind === 'retry' ? null : b))
  }
  function retryUpload() {
    const pending = pendingRetryRef.current
    if (!pending) return
    setBanner(null)
    diag.logEvent(EV.uploadRetry, { totalBytes: pending.blob?.size ?? 0 })
    void commitSegment(pending.blob, { ...pending.opts, skipGuard: true })
  }
  function discardRetry() {
    diag.logEvent(EV.uploadRetryDiscarded, {})
    clearRetry()
  }

  // --- Acciones principales --------------------------------------------------
  async function toggleRecord(e?: { nativeEvent?: Event; detail?: number }) {
    const native = e?.nativeEvent as (Event & { detail?: number; pointerType?: string }) | undefined
    const detail = native?.detail ?? e?.detail ?? 0
    diag.logEvent(EV.recordButtonActivated, {
      isTrusted: native?.isTrusted ?? false,
      detail,
      pointerType: native?.pointerType ?? null,
      viaKeyboard: detail === 0,
      activeElement: document.activeElement?.id || null,
      recorderState: recorder.mediaRecorder?.state || 'inactive',
    })

    // Candado de reentrada: bloquea un 2º clic (o Grabar durante el banner suspect)
    // mientras la operación async está en vuelo. `busyRef` cubre la transcripción.
    if (busyRef.current || transitioningRef.current) return
    setError(null)
    transitioningRef.current = true
    try {
      if (recorder.isRecording || recorder.isPaused) {
        // Detener segmento → transcribir
        const seconds = recorder.getElapsedSeconds()
        const blob = await recorder.stop()
        stopMediaSessionProbe()
        stopLiveMeter()
        setStatus('idle')
        setElapsed(0)
        if (blob && blob.size > 0) {
          await commitSegment(blob, { source: 'recorded', seconds })
        } else {
          void startPreview(selectedDeviceIdRef.current)
        }
        diag.endCaptureRun()
      } else {
        // Empezar un nuevo segmento
        api.warmup() // despierta la BD mientras se graba (robustez-coldstart-sql)
        stopPreview()
        diag.startCaptureRun()
        diag.logEvent(EV.captureStarted, {
          deviceId: selectedDeviceIdRef.current || null,
          userAgent: navigator.userAgent,
          visibilityState: document.visibilityState,
        })
        try {
          await recorder.start(selectedDeviceIdRef.current || null)
          startMediaSessionProbe()
          setStatus('recording')
          if (recorder.stream) attachLiveMeter(recorder.stream)
        } catch (err) {
          diag.endCaptureRun() // el run no llegó a arrancar: ciérralo (evita visibility_change huérfanos)
          setError(
            (err as Error).name === 'NotAllowedError'
              ? t('capture.error.mic')
              : t('capture.error.start', { msg: (err as Error).message }),
          )
          void startPreview(selectedDeviceIdRef.current)
        }
      }
    } finally {
      transitioningRef.current = false
    }
  }

  function pauseResume() {
    if (recorder.isRecording) {
      recorder.pause()
      setStatus('paused')
    } else if (recorder.isPaused) {
      recorder.resume()
      setStatus('recording')
    }
  }

  function importFile(file: File) {
    void commitSegment(file, { source: 'imported', filename: file.name || 'import.webm' })
  }

  function finalize() {
    if (segments.length === 0 || sessionIdRef.current == null) return
    stopPreview()
    navigate(PATHS.review)
  }

  function setDevice(id: string) {
    setSelectedDeviceId(id)
    localStorage.setItem(PREFERRED_MIC_KEY, id)
    void startPreview(id)
  }

  // --- Cableado (una vez) + bootstrap ---------------------------------------
  useEffect(() => {
    recorder.onTimeUpdate = (s) => setElapsed(s)
    recorder.onDiag = (type, payload) => diag.logEvent(type, payload)
    recorder.onExternalStop = (blob, meta) => handleExternalStopRef.current(blob, meta)

    // Hidratación (SPEC-05): si llegamos con una sesión activa y con tramos (p. ej.
    // "Añadir tramo" desde Revisión), reanudamos la MISMA sesión en vez de crear
    // otra. Solo siembra si aún no hay sesión local → idempotente en StrictMode. No
    // toca recorder/guards/diagnostics: las salvaguardas R1 quedan intactas.
    if (sessionIdRef.current == null && active.session && active.session.segments?.length) {
      sessionIdRef.current = active.session.id
      setSegments(active.session.segments)
      setMergedTranscript(active.session.transcription_edited || active.session.transcription_raw || '')
      diag.setSessionId(active.session.id)
    }

    api.warmup() // warm-up al montar la Captura (robustez-coldstart-sql)

    if (isDesktopRef.current) void populateDeviceList()

    if (import.meta.env.DEV) {
      ;(window as unknown as { __stpCapture?: unknown }).__stpCapture = { recorder, diag }
    }

    return () => {
      // Soltamos los handlers de render (evita setState sobre un árbol desmontado).
      recorder.onTimeUpdate = null
      recorder.onExternalStop = null
      // Si se navega fuera GRABANDO (la SPA lo permite: nav/stepper del AppShell),
      // liberamos el micro con una parada INTENCIONAL: no dispara salvaguarda (el
      // handler ya está anulado) y el audio en curso no commiteado se descarta a
      // propósito (el usuario salió sin cerrar el tramo). Evita el micro colgado.
      if (recorder.isRecording || recorder.isPaused) void recorder.stop()
      stopPreview()
      stopLiveMeter()
      // Resuelve una promesa de banner pendiente para no dejar un closure colgado.
      bannerResolveRef.current?.(false)
      bannerResolveRef.current = null
      diag.endCaptureRun()
      if (import.meta.env.DEV) delete (window as unknown as { __stpCapture?: unknown }).__stpCapture
    }
    // Cableado imperativo de instancias estables: se ejecuta una sola vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reacciona al cruce del breakpoint md (reactivo para el render del selector).
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const onChange = () => {
      isDesktopRef.current = mq.matches
      setIsDesktop(mq.matches)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return {
    status,
    busy,
    elapsed,
    liveLevel,
    noSignal,
    segments,
    mergedTranscript,
    banner,
    error,
    canFinalize: segments.length > 0 && sessionIdRef.current != null,
    isDesktop,
    micDevices,
    selectedDeviceId,
    micStatus,
    toggleRecord,
    pauseResume,
    finalize,
    importFile,
    setDevice,
    confirmBanner: () => resolveBanner(true),
    dismissBanner: () => resolveBanner(false),
    retryUpload,
    discardRetry,
  }
}

export class AudioRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.stream = null;
    this.chunks = [];
    this.startTime = null;
    this._elapsedBeforePause = 0; // acumulado antes de pausar
    this._timerInterval = null;
    this.onTimeUpdate = null; // callback(seconds)

    // Instrumentación (cambio grabacion-stop-espontaneo). Hooks opcionales:
    //  - onDiag(type, payload): el recorder reporta eventos del navegador.
    //  - onExternalStop(blob, meta): se invoca SOLO si el recorder para sin que
    //    se haya llamado a stop() (track muerto, error, suspensión). Es la palanca
    //    de la salvaguarda: el blob lleva el audio capturado hasta el corte.
    this.onDiag = null;
    this.onExternalStop = null;
    this._intentionalStop = false; // lo pone stop() antes del stop() nativo
    this._stopResolve = null;      // resuelve la promesa de stop()
  }

  async start(deviceId = null) {
    const audioConstraints = deviceId ? { deviceId: { exact: deviceId } } : true;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });

    // Prefer WebM/Opus for Groq compatibility
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : 'audio/ogg;codecs=opus';

    // 32 kbps Opus: transparente para Whisper (que reduce a 16 kHz mono de todas
    // formas) pero ~4x más ligero que el bitrate por defecto del navegador (~128 kbps).
    // Evita superar el límite de tamaño de Groq en grabaciones largas: ~1,8 h
    // de voz caben holgadamente bajo los 25 MB del tier gratuito.
    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType, audioBitsPerSecond: 32000 });
    this.chunks = [];
    this._elapsedBeforePause = 0;
    this.startTime = Date.now();
    this._intentionalStop = false;

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    // onstop ÚNICO y persistente: distingue el stop intencional (vía stop()) del
    // externo (el navegador para el recorder solo). En ambos casos el navegador
    // ya emitió un último ondataavailable, así que `this.chunks` lleva el audio.
    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: this.mediaRecorder.mimeType });
      const meta = {
        elapsedSeconds: this.getElapsedSeconds(),
        chunkCount: this.chunks.length,
        totalBytes: blob.size,
        visibilityState: document.visibilityState,
      };
      if (this._intentionalStop) {
        this._cleanup();
        const resolve = this._stopResolve;
        this._stopResolve = null;
        resolve?.(blob);
      } else {
        this.onDiag?.('recorder_stop_external', meta);
        this._cleanup();
        this.onExternalStop?.(blob, meta);
      }
    };

    this.mediaRecorder.onerror = (e) => {
      this.onDiag?.('recorder_error', { name: e.error?.name || null, message: e.error?.message || String(e.error || 'error') });
    };

    // El track del micro muriendo/silenciándose es la firma de la hipótesis H2.
    this.stream.getAudioTracks().forEach((track) => {
      track.onended = () => this.onDiag?.('track_ended', { label: track.label, readyState: track.readyState });
      track.onmute = () => this.onDiag?.('track_muted', { label: track.label, muted: track.muted });
      track.onunmute = () => this.onDiag?.('track_unmuted', { label: track.label, muted: track.muted });
    });

    this.mediaRecorder.start(250); // collect chunks every 250ms
    this.onDiag?.('recorder_started', { mimeType });

    this._timerInterval = setInterval(() => {
      if (this.onTimeUpdate && !this.isPaused) {
        this.onTimeUpdate(this._elapsedBeforePause + Math.floor((Date.now() - this.startTime) / 1000));
      }
    }, 1000);
  }

  pause() {
    if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') return;
    // Accumulate elapsed time before pausing
    this._elapsedBeforePause += Math.floor((Date.now() - this.startTime) / 1000);
    this.mediaRecorder.pause();
  }

  resume() {
    if (!this.mediaRecorder || this.mediaRecorder.state !== 'paused') return;
    this.startTime = Date.now(); // reset reference point for new segment
    this.mediaRecorder.resume();
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        resolve(null);
        return;
      }

      // Marca el stop como intencional para que el onstop persistente resuelva
      // ESTA promesa (en vez de tratarlo como corte externo y disparar la salvaguarda).
      this._intentionalStop = true;
      this._stopResolve = resolve;
      this.mediaRecorder.stop();
    });
  }

  _cleanup() {
    clearInterval(this._timerInterval);
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  }

  get isRecording() {
    return this.mediaRecorder?.state === 'recording';
  }

  get isPaused() {
    return this.mediaRecorder?.state === 'paused';
  }

  getElapsedSeconds() {
    if (!this.startTime) return 0;
    // En pausa, el tramo en curso ya se acumuló en `_elapsedBeforePause`; sumar el
    // delta contra `startTime` contaría doble (y añadiría el tiempo de pausa).
    if (this.isPaused) return this._elapsedBeforePause;
    return this._elapsedBeforePause + Math.floor((Date.now() - this.startTime) / 1000);
  }
}

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

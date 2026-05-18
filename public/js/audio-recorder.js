export class AudioRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.stream = null;
    this.chunks = [];
    this.startTime = null;
    this._elapsedBeforePause = 0; // acumulado antes de pausar
    this._timerInterval = null;
    this.onTimeUpdate = null; // callback(seconds)
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

    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
    this.chunks = [];
    this._elapsedBeforePause = 0;
    this.startTime = Date.now();

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    this.mediaRecorder.start(250); // collect chunks every 250ms

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

      this.mediaRecorder.onstop = () => {
        const mimeType = this.mediaRecorder.mimeType;
        const blob = new Blob(this.chunks, { type: mimeType });
        this._cleanup();
        resolve(blob);
      };

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
    return this._elapsedBeforePause + Math.floor((Date.now() - this.startTime) / 1000);
  }
}

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

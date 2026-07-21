// Medidor de nivel de micrófono (SPEC-04). Extrae la lógica de analyser/RMS que
// en el viejo vivía en startPreview/attachMeterToStream de phase1-capture.js.
// Agnóstico de UI: NO posee el MediaStream (el llamador lo gestiona); solo el
// AudioContext y el bucle de animación. Usos: (a) preview pre-grabación en
// escritorio, (b) medición en vivo durante la grabación (aviso "sin señal").

type AudioContextCtor = typeof AudioContext

export class MicMeter {
  onLevel: ((rms: number) => void) | null = null
  private ctx: AudioContext | null = null
  private rafId: number | null = null
  private _peak = 0

  get peakSinceReset(): number {
    return this._peak
  }

  resetPeak(): void {
    this._peak = 0
  }

  start(stream: MediaStream): void {
    this.stop()
    const Ctor: AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: AudioContextCtor }).webkitAudioContext
    this.ctx = new Ctor()
    const source = this.ctx.createMediaStreamSource(stream)
    const analyser = this.ctx.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    const data = new Uint8Array(analyser.frequencyBinCount)
    this._peak = 0

    const tick = () => {
      analyser.getByteTimeDomainData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) {
        const x = (data[i] - 128) / 128
        sum += x * x
      }
      const rms = Math.sqrt(sum / data.length)
      if (rms > this._peak) this._peak = rms
      this.onLevel?.(rms)
      this.rafId = requestAnimationFrame(tick)
    }
    tick()
  }

  stop(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    if (this.ctx) {
      void this.ctx.close().catch(() => {})
      this.ctx = null
    }
  }
}

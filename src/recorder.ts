export interface RecorderOptions {
  maxDurationMs: number;
  onLevel: (level: number) => void;
  onTimeLeft: (remainingMs: number) => void;
  onStop: (blob: Blob) => void;
}

export class Recorder {
  private stream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private analyserCtx: AudioContext | null = null;
  private chunks: Blob[] = [];
  private maxTimer: ReturnType<typeof setTimeout> | null = null;
  private rafId: number | null = null;
  private startedAt = 0;

  async start(opts: RecorderOptions): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });

    this.analyserCtx = new AudioContext();
    const src = this.analyserCtx.createMediaStreamSource(this.stream);
    const analyser = this.analyserCtx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    const timeBuf = new Uint8Array(analyser.frequencyBinCount);

    this.chunks = [];
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";
    this.mediaRecorder = new MediaRecorder(
      this.stream,
      mimeType ? { mimeType } : {},
    );
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.chunks, {
        type: this.mediaRecorder?.mimeType ?? "audio/webm",
      });
      this.analyserCtx?.close();
      this.analyserCtx = null;
      opts.onStop(blob);
    };
    this.mediaRecorder.start(100);
    this.startedAt = Date.now();

    const tick = () => {
      analyser.getByteTimeDomainData(timeBuf);
      let sum = 0;
      for (const v of timeBuf) sum += Math.abs(v - 128);
      opts.onLevel(Math.min(1, sum / timeBuf.length / 40));
      const elapsed = Date.now() - this.startedAt;
      opts.onTimeLeft(Math.max(0, opts.maxDurationMs - elapsed));
      if (this.mediaRecorder?.state === "recording") {
        this.rafId = requestAnimationFrame(tick);
      }
    };
    this.rafId = requestAnimationFrame(tick);
    this.maxTimer = setTimeout(() => this.stop(), opts.maxDurationMs);
  }

  stop(): void {
    if (this.maxTimer) {
      clearTimeout(this.maxTimer);
      this.maxTimer = null;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.mediaRecorder?.state === "recording") this.mediaRecorder.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  get isRecording(): boolean {
    return (
      this.mediaRecorder !== null && this.mediaRecorder.state === "recording"
    );
  }
}

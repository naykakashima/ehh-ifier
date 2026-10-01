// Handles getUserMedia + MediaRecorder
export interface RecorderOptions {
  maxDurationMs: number;
  onLevel: (level: number) => void;
  onStop: (blob: Blob) => void;
}

export class Recorder {
  private stream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  async start(opts: RecorderOptions): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Level metering via AnalyserNode
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(this.stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      if (!this.mediaRecorder || this.mediaRecorder.state !== "recording")
        return;
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += Math.abs(v - 128);
      opts.onLevel(Math.min(1, sum / buf.length / 40));
      requestAnimationFrame(tick);
    };
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
        type: this.mediaRecorder?.mimeType || "audio/webm",
      });
      opts.onStop(blob);
      ctx.close();
    };
    this.mediaRecorder.start(100);
    tick();
    this.timer = setTimeout(() => this.stop(), opts.maxDurationMs);
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.mediaRecorder?.state === "recording") this.mediaRecorder.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
  }

  get isRecording(): boolean {
    return (
      this.mediaRecorder !== null && this.mediaRecorder.state === "recording"
    );
  }
}

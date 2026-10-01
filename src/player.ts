// Plays stitched audio and fires the ehh event at the right time
export class Player {
  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private startTime = 0;
  private ehhTimer?: ReturnType<typeof setTimeout>;

  play(
    buffer: AudioBuffer,
    ehhStartS: number,
    onEhh: () => void,
    onEnd: () => void,
  ) {
    this.stop();
    this.ctx = new AudioContext();
    this.source = this.ctx.createBufferSource();
    this.source.buffer = buffer;
    this.source.connect(this.ctx.destination);
    this.startTime = this.ctx.currentTime;
    this.source.onended = () => onEnd();
    this.source.start();
    const delay = Math.max(0, ehhStartS * 1000);
    this.ehhTimer = setTimeout(() => onEhh(), delay);
  }

  stop() {
    if (this.ehhTimer) {
      clearTimeout(this.ehhTimer);
      this.ehhTimer = undefined;
    }
    try {
      this.source?.stop();
    } catch {}
    this.source = null;
    this.ctx?.close();
    this.ctx = null;
  }

  get currentTime(): number {
    if (!this.ctx) return 0;
    return this.ctx.currentTime - this.startTime;
  }
}

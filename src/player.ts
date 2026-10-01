export interface PlayerOptions {
  buffer: AudioBuffer;
  ehhStartS: number;
  onEhh: () => void;
  onProgress: (fraction: number) => void;
  onEnd: () => void;
}

export class Player {
  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private ehhTimer?: ReturnType<typeof setTimeout>;
  private rafId?: number;

  play(opts: PlayerOptions): void {
    this.stop();
    this.ctx = new AudioContext();
    this.source = this.ctx.createBufferSource();
    this.source.buffer = opts.buffer;
    this.source.connect(this.ctx.destination);
    const duration = opts.buffer.duration;
    const startTime = this.ctx.currentTime;

    this.source.onended = () => {
      if (this.rafId !== undefined) cancelAnimationFrame(this.rafId);
      opts.onEnd();
    };
    this.source.start();
    // resume in case browser suspended the context (iOS)
    void this.ctx.resume();

    this.ehhTimer = setTimeout(
      () => opts.onEhh(),
      Math.max(0, opts.ehhStartS * 1000),
    );

    const tick = () => {
      if (!this.ctx || !this.source) return;
      opts.onProgress(
        Math.min(1, (this.ctx.currentTime - startTime) / duration),
      );
      this.rafId = requestAnimationFrame(tick);
    };
    tick();
  }

  stop(): void {
    if (this.ehhTimer !== undefined) {
      clearTimeout(this.ehhTimer);
      this.ehhTimer = undefined;
    }
    if (this.rafId !== undefined) {
      cancelAnimationFrame(this.rafId);
      this.rafId = undefined;
    }
    try {
      this.source?.stop();
    } catch {
      /* already stopped */
    }
    this.source = null;
    this.ctx?.close();
    this.ctx = null;
  }

  get isPlaying(): boolean {
    return this.ctx !== null && this.ctx.state !== "closed";
  }
}

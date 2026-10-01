import { RECORD, STITCH, ASSETS } from "./config";
import { Recorder } from "./recorder";
import { createTranscriber } from "./transcribe";
import { findCutPoint, energyFallback } from "./cutPoint";
import { stitch } from "./stitch";
import { Player } from "./player";
import { createFrame, getVideoElement, updateProgress } from "./frame";
import { triggerEhhEffects, type EffectsHandle } from "./effects";
import {
  canExportVideo,
  exportVideo,
  downloadWav,
  triggerDownload,
} from "./exporter";

// SVG circle r=46, circumference = 2π×46 ≈ 289
const RING_CIRCUMFERENCE = 289;

export function initUI(root: HTMLElement) {
  root.innerHTML = `
    <h1 class="title">The <span>Ehh</span>-ifier</h1>
    <div id="frame-mount"></div>
    <div class="controls">
      <div class="status" id="status">Tap the mic and say something</div>
      <div class="mic-area">
        <svg class="countdown-ring" viewBox="0 0 100 100" aria-hidden="true">
          <circle class="countdown-track" cx="50" cy="50" r="46"/>
          <circle class="countdown-fill" id="countdown-fill" cx="50" cy="50" r="46"/>
        </svg>
        <button class="mic-btn" id="mic-btn" aria-label="Record">🎤</button>
      </div>
      <div class="level-meter"><div class="level-meter-fill" id="level-fill"></div></div>
      <canvas class="waveform-canvas hidden" id="waveform"></canvas>
      <div class="transcript hidden" id="transcript"></div>
      <div class="slider-row hidden" id="pitch-row">
        <span>Ehh pitch</span>
        <input type="range" id="pitch"
          min="${STITCH.EHH_PITCH_MIN}" max="${STITCH.EHH_PITCH_MAX}"
          step="0.05" value="${STITCH.EHH_PITCH_DEFAULT}">
        <span id="pitch-val">${STITCH.EHH_PITCH_DEFAULT.toFixed(2)}×</span>
      </div>
      <div class="toggle-row hidden" id="fry-row">
        <input type="checkbox" id="deep-fry">
        <label for="deep-fry">🔥 Deep fried</label>
      </div>
      <div class="btn-row">
        <button class="btn hidden" id="btn-preview">Preview</button>
        <button class="btn hidden" id="btn-replay">Replay</button>
        <button class="btn hidden" id="btn-rerecord">Re-record</button>
        <button class="btn primary hidden" id="btn-download">Download video</button>
      </div>
      <div class="progress-bar-wrap hidden" id="export-progress-wrap">
        <div class="progress-bar" id="export-progress"></div>
      </div>
    </div>
  `;

  const frame = createFrame();
  document.getElementById("frame-mount")!.appendChild(frame);

  const recorder = new Recorder();
  const player = new Player();
  const transcriber = createTranscriber((p) => {
    setStatus(
      p.percent != null ? `${p.stage} ${Math.round(p.percent)}%` : p.stage,
    );
  });
  transcriber.preload();

  let activeEffects: EffectsHandle | null = null;
  let exportSeed = 0;
  let ehhArrayBuffer: ArrayBuffer | null = null;
  let ehhBuffer: AudioBuffer | null = null;
  let recordingBuffer: AudioBuffer | null = null;
  let stitchResult: { buffer: AudioBuffer; ehhStartS: number } | null = null;
  let cutPointS = 0;
  let sharedCtx: AudioContext | null = null;

  // Prefetch ehh bytes immediately — no AudioContext needed for a fetch
  fetch(ASSETS.EHH_MP3)
    .then(async (res) => {
      if (!res.ok) throw new Error("ehh.mp3 not found");
      ehhArrayBuffer = await res.arrayBuffer();
    })
    .catch((err: unknown) => {
      console.warn("[DEV] ehh.mp3 failed to prefetch:", err);
      setStatus("⚠️ DEV: ehh.mp3 missing from /public");
    });

  function getCtx(): AudioContext {
    if (!sharedCtx || sharedCtx.state === "closed")
      sharedCtx = new AudioContext();
    if (sharedCtx.state === "suspended") void sharedCtx.resume();
    return sharedCtx;
  }

  async function getEhhBuffer(): Promise<AudioBuffer | null> {
    if (ehhBuffer) return ehhBuffer;
    if (!ehhArrayBuffer) return null;
    // slice() to avoid detaching the original ArrayBuffer
    ehhBuffer = await getCtx().decodeAudioData(ehhArrayBuffer.slice(0));
    return ehhBuffer;
  }

  function setStatus(msg: string) {
    document.getElementById("status")!.textContent = msg;
  }

  // ── Mic button ──────────────────────────────────────────────────────────────
  const micBtn = document.getElementById("mic-btn") as HTMLButtonElement;
  const levelFill = document.getElementById("level-fill") as HTMLElement;
  const countdownFill = document.getElementById(
    "countdown-fill",
  ) as SVGCircleElement & HTMLElement;

  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let holdMode = false;
  let pointerDownTime = 0;

  function setRing(remainingMs: number) {
    const fraction = remainingMs / RECORD.MAX_DURATION_MS;
    countdownFill.style.strokeDashoffset = String(
      (1 - fraction) * RING_CIRCUMFERENCE,
    );
  }

  async function startRecording() {
    if (recorder.isRecording) return;
    setStatus("Recording… tap again to stop");
    micBtn.classList.add("recording");
    micBtn.textContent = "⏹";
    countdownFill.style.strokeDashoffset = "0";
    try {
      await recorder.start({
        maxDurationMs: RECORD.MAX_DURATION_MS,
        onLevel: (l) => {
          levelFill.style.width = `${l * 100}%`;
        },
        onTimeLeft: (ms) => setRing(ms),
        onStop: handleRecordingDone,
      });
    } catch (err: unknown) {
      micBtn.classList.remove("recording");
      micBtn.textContent = "🎤";
      countdownFill.style.strokeDashoffset = String(RING_CIRCUMFERENCE);
      if (err instanceof Error && err.name === "NotAllowedError") {
        setStatus("Mic access denied — please allow mic in browser settings");
      } else if (err instanceof Error && err.name === "NotFoundError") {
        setStatus("No mic found — plug one in and try again");
      } else {
        setStatus("Could not start: " + String(err));
      }
    }
  }

  function stopRecording() {
    if (!recorder.isRecording) return;
    recorder.stop();
    micBtn.classList.remove("recording");
    micBtn.textContent = "🎤";
    countdownFill.style.strokeDashoffset = String(RING_CIRCUMFERENCE);
    levelFill.style.width = "0%";
  }

  micBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    pointerDownTime = Date.now();
    holdMode = false;
    if (!recorder.isRecording) {
      // Hold for 400 ms → hold-to-record mode; shorter press falls through to click
      holdTimer = setTimeout(async () => {
        holdMode = true;
        await startRecording();
      }, 400);
    }
  });

  micBtn.addEventListener("pointerup", () => {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (holdMode && recorder.isRecording) {
      holdMode = false;
      stopRecording();
    }
  });

  micBtn.addEventListener("pointercancel", () => {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (holdMode) stopRecording();
    holdMode = false;
  });

  micBtn.addEventListener("click", async () => {
    // Ignore clicks that were part of a hold gesture
    if (holdMode || Date.now() - pointerDownTime > 400) return;
    if (recorder.isRecording) stopRecording();
    else await startRecording();
  });

  // ── Recording done ──────────────────────────────────────────────────────────
  async function handleRecordingDone(blob: Blob) {
    levelFill.style.width = "0%";
    micBtn.classList.remove("recording");
    micBtn.textContent = "🎤";

    // Decode ehh now — we're definitely inside a user-gesture chain
    await getEhhBuffer();

    setStatus("Finding your last word…");

    try {
      const ctx = getCtx();
      const ab = await blob.arrayBuffer();
      recordingBuffer = await ctx.decodeAudioData(ab);

      if (recordingBuffer.duration < 0.3) {
        // Too short — whole thing becomes the ehh
        cutPointS = 0;
        await doStitch();
        showControls();
        setStatus("That was short — the whole thing is now the ehh!");
        return;
      }

      const mono16k = await downsampleToMono16k(recordingBuffer);
      const result = await transcriber.transcribe(mono16k);

      if (result.words.length > 0) {
        cutPointS = findCutPoint(result.words, recordingBuffer.duration);
        setStatus("Got it! Drag the red marker to adjust the cut point.");
      } else {
        cutPointS = energyFallback(recordingBuffer);
        setStatus(
          cutPointS > 0
            ? "No transcript — used audio energy for cut point. Adjust if needed."
            : "Couldn't detect speech — try again a bit louder",
        );
      }

      showTranscript(result.text, result.words);
      drawWaveform(recordingBuffer, cutPointS);
      await doStitch();
      showControls();
    } catch (err) {
      setStatus("Error: " + String(err));
      console.error(err);
    }
  }

  // ── Stitch ──────────────────────────────────────────────────────────────────
  async function doStitch() {
    if (!recordingBuffer) return;
    const ehh = await getEhhBuffer();
    if (!ehh) {
      setStatus("⚠️ DEV: ehh.mp3 missing — cannot stitch");
      return;
    }
    const pitch = parseFloat(
      (document.getElementById("pitch") as HTMLInputElement).value,
    );
    const deepFried = (document.getElementById("deep-fry") as HTMLInputElement)
      .checked;
    stitchResult = await stitch({
      recordingBuffer,
      ehhBuffer: ehh,
      cutPointS,
      ehhPitch: pitch,
      deepFried,
    });
  }

  // ── Transcript ──────────────────────────────────────────────────────────────
  function showTranscript(
    text: string,
    words: Array<{ word: string; start: number; end: number }>,
  ) {
    const el = document.getElementById("transcript")!;
    show("transcript");
    if (!words.length || !text.trim()) {
      el.textContent = text || "(no transcript)";
      return;
    }
    const real = words.filter(
      (w) => w.word.replace(/[^a-zA-Z]/g, "").length > 0,
    );
    if (!real.length) {
      el.textContent = text;
      return;
    }
    const lastWord = real[real.length - 1].word.trim();
    const idx = text.lastIndexOf(lastWord);
    if (idx === -1) {
      el.textContent = text;
      return;
    }
    el.innerHTML =
      esc(text.slice(0, idx)) +
      `<span class="last-word">${esc(lastWord)}</span>` +
      esc(text.slice(idx + lastWord.length));
  }

  // ── Waveform ─────────────────────────────────────────────────────────────────
  // Drag state lives outside drawWaveform so re-draws don't reset it.
  let waveformDragging = false;

  function drawWaveform(buf: AudioBuffer, cut: number) {
    const canvas = document.getElementById("waveform") as HTMLCanvasElement;
    show("waveform");
    const dpr = window.devicePixelRatio || 1;
    const displayW =
      canvas.getBoundingClientRect().width || canvas.offsetWidth || 400;
    const displayH = 80;
    canvas.width = Math.round(displayW * dpr);
    canvas.height = Math.round(displayH * dpr);
    canvas.style.height = displayH + "px";

    const ctx2d = canvas.getContext("2d")!;
    ctx2d.scale(dpr, dpr);
    const w = displayW,
      h = displayH;
    const data = buf.getChannelData(0);

    ctx2d.fillStyle = "#1a1a1a";
    ctx2d.fillRect(0, 0, w, h);
    ctx2d.strokeStyle = "#555";
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    const step = Math.ceil(data.length / w);
    for (let i = 0; i < w; i++) {
      let min = 1,
        max = -1;
      for (let j = i * step; j < (i + 1) * step && j < data.length; j++) {
        if (data[j] < min) min = data[j];
        if (data[j] > max) max = data[j];
      }
      ctx2d.moveTo(i, ((1 + min) * h) / 2);
      ctx2d.lineTo(i, ((1 + max) * h) / 2);
    }
    ctx2d.stroke();

    const cutX = (cut / buf.duration) * w;
    ctx2d.strokeStyle = "#E8141C";
    ctx2d.lineWidth = 2;
    ctx2d.beginPath();
    ctx2d.moveTo(cutX, 0);
    ctx2d.lineTo(cutX, h);
    ctx2d.stroke();
    ctx2d.fillStyle = "#E8141C";
    ctx2d.font = `${10}px system-ui`;
    ctx2d.fillText("✂", Math.min(cutX + 4, w - 16), 14);

    // Attach pointer-event drag handlers once (guard against re-registration).
    if (canvas.dataset.dragInit) return;
    canvas.dataset.dragInit = "1";

    const getF = (clientX: number) => {
      const r = canvas.getBoundingClientRect();
      return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    };

    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      waveformDragging = true;
      cutPointS = getF(e.clientX) * buf.duration;
      drawWaveform(buf, cutPointS);
    });

    canvas.addEventListener("pointermove", (e) => {
      if (!waveformDragging) return;
      cutPointS = getF(e.clientX) * buf.duration;
      drawWaveform(buf, cutPointS);
    });

    const endDrag = () => {
      if (waveformDragging) {
        waveformDragging = false;
        void doStitch();
      }
    };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
  }

  // ── Controls ─────────────────────────────────────────────────────────────────
  function showControls() {
    show("pitch-row");
    show("fry-row");
    show("btn-preview");
    show("btn-replay");
    show("btn-rerecord");
    show("btn-download");
  }

  document.getElementById("pitch")!.addEventListener("input", (e) => {
    const v = (e.target as HTMLInputElement).value;
    document.getElementById("pitch-val")!.textContent =
      `${parseFloat(v).toFixed(2)}×`;
    void doStitch();
  });
  document
    .getElementById("deep-fry")!
    .addEventListener("change", () => void doStitch());

  document.getElementById("btn-preview")!.addEventListener("click", () => {
    if (!stitchResult) return;
    player.stop();
    player.play({
      buffer: stitchResult.buffer,
      ehhStartS: stitchResult.ehhStartS,
      onEhh: () => {},
      onProgress: () => {},
      onEnd: () => {},
    });
  });

  document.getElementById("btn-replay")!.addEventListener("click", () => {
    if (!stitchResult) return;
    // Clear any previous effects run
    activeEffects?.clear();
    activeEffects = null;
    player.stop();
    const vid = getVideoElement(frame);
    vid.currentTime = 0;
    void vid.play();
    // New seed each replay so oval/arrow jitter varies; export reuses the last seed
    exportSeed = (Date.now() % 10000) / 10000;
    player.play({
      buffer: stitchResult.buffer,
      ehhStartS: stitchResult.ehhStartS,
      onEhh: () => {
        activeEffects = triggerEhhEffects(frame, 0, exportSeed);
      },
      onProgress: (f) => updateProgress(frame, f),
      onEnd: () => {
        updateProgress(frame, 0);
      },
    });
  });

  // Swap to audio-only download if canvas capture isn't available
  const dlBtn = document.getElementById("btn-download") as HTMLButtonElement;
  const videoExport = canExportVideo();
  if (!videoExport) dlBtn.textContent = "Download audio";

  dlBtn.addEventListener("click", async () => {
    if (!stitchResult) return;
    if (!videoExport) {
      downloadWav(stitchResult.buffer);
      return;
    }
    // Stop any active playback/effects so the export canvas has a clean state
    player.stop();
    activeEffects?.clear();
    activeEffects = null;

    const allBtns = document.querySelectorAll<HTMLButtonElement>(".btn");
    allBtns.forEach((b) => (b.disabled = true));
    show("export-progress-wrap");
    const bar = document.getElementById("export-progress") as HTMLElement;
    bar.style.width = "0%";
    setStatus("Rendering video…");

    try {
      const blob = await exportVideo({
        videoEl: getVideoElement(frame),
        stitchedBuffer: stitchResult.buffer,
        ehhStartS: stitchResult.ehhStartS,
        seed: exportSeed,
        onProgress: (f) => {
          bar.style.width = `${f * 100}%`;
          setStatus(`Rendering… ${Math.round(f * 100)}%`);
        },
      });
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      triggerDownload(blob, `ehh-ifier.${ext}`);
      setStatus("Done! Check your downloads.");
    } catch (err) {
      setStatus("Export failed: " + String(err));
      console.error(err);
    } finally {
      allBtns.forEach((b) => (b.disabled = false));
      hide("export-progress-wrap");
      bar.style.width = "0%";
    }
  });

  document.getElementById("btn-rerecord")!.addEventListener("click", () => {
    player.stop();
    activeEffects?.clear();
    activeEffects = null;
    recordingBuffer = null;
    stitchResult = null;
    hide("waveform");
    hide("transcript");
    hide("pitch-row");
    hide("fry-row");
    hide("btn-preview");
    hide("btn-replay");
    hide("btn-rerecord");
    hide("btn-download");
    setStatus("Tap the mic and say something");
  });

  function show(id: string) {
    document.getElementById(id)?.classList.remove("hidden");
  }
  function hide(id: string) {
    document.getElementById(id)?.classList.add("hidden");
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function downsampleToMono16k(buffer: AudioBuffer): Promise<Float32Array> {
  const SR = 16000;
  const off = new OfflineAudioContext(1, Math.ceil(buffer.duration * SR), SR);
  const src = off.createBufferSource();
  src.buffer = buffer;
  src.connect(off.destination);
  src.start();
  return (await off.startRendering()).getChannelData(0);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

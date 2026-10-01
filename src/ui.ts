// Main UI orchestration
import { RECORD, STITCH } from "./config";
import { Recorder } from "./recorder";
import { createTranscriber } from "./transcribe";
import { findCutPoint, energyFallback } from "./cutPoint";
import { stitch } from "./stitch";
import { Player } from "./player";
import { createFrame, getVideoElement, updateProgress } from "./frame";

export function initUI(root: HTMLElement) {
  root.innerHTML = `
    <h1 class="title">The <span>Ehh</span>-ifier</h1>
    <div id="frame-mount"></div>
    <div class="controls">
      <div class="status" id="status">Tap the mic and say something</div>
      <div style="position:relative;width:80px;margin:0 auto;">
        <button class="mic-btn" id="mic-btn">🎤</button>
      </div>
      <div class="level-meter"><div class="level-meter-fill" id="level-fill"></div></div>
      <canvas class="waveform-canvas hidden" id="waveform" width="400" height="80"></canvas>
      <div class="transcript hidden" id="transcript"></div>
      <div class="slider-row hidden" id="pitch-row">
        <span>Ehh pitch</span>
        <input type="range" id="pitch" min="0.7" max="1.4" step="0.05" value="1.0">
        <span id="pitch-val">1.0×</span>
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
  // Start preloading model immediately
  transcriber.preload();

  // suppress unused-variable warning — STITCH used via doStitch options
  void STITCH;

  let recordingBlob: Blob | null = null;
  let recordingBuffer: AudioBuffer | null = null;
  let ehhBuffer: AudioBuffer | null = null;
  let stitchResult: { buffer: AudioBuffer; ehhStartS: number } | null = null;
  let cutPointS = 0;
  let audioCtx: AudioContext | null = null;

  function setStatus(msg: string) {
    const el = document.getElementById("status")!;
    el.textContent = msg;
  }

  function getAudioCtx() {
    if (!audioCtx || audioCtx.state === "closed") audioCtx = new AudioContext();
    return audioCtx;
  }

  // Load ehh.mp3
  async function loadEhh() {
    try {
      const res = await fetch("/ehh.mp3");
      if (!res.ok) throw new Error("ehh.mp3 not found");
      const ab = await res.arrayBuffer();
      const ctx = getAudioCtx();
      ehhBuffer = await ctx.decodeAudioData(ab);
    } catch (err) {
      console.warn("[DEV] ehh.mp3 failed to load:", err);
      setStatus("⚠️ DEV: ehh.mp3 missing");
    }
  }
  loadEhh();

  const micBtn = document.getElementById("mic-btn") as HTMLButtonElement;
  const levelFill = document.getElementById("level-fill") as HTMLElement;

  micBtn.addEventListener("click", async () => {
    if (recorder.isRecording) {
      recorder.stop();
      micBtn.classList.remove("recording");
      micBtn.textContent = "🎤";
      return;
    }
    try {
      setStatus("Recording… tap again to stop");
      micBtn.classList.add("recording");
      micBtn.textContent = "⏹";
      await recorder.start({
        maxDurationMs: RECORD.MAX_DURATION_MS,
        onLevel: (l) => {
          levelFill.style.width = `${l * 100}%`;
        },
        onStop: handleRecordingDone,
      });
    } catch (err: unknown) {
      micBtn.classList.remove("recording");
      micBtn.textContent = "🎤";
      if (err instanceof Error && err.name === "NotAllowedError") {
        setStatus("Mic access denied — please allow mic in browser settings");
      } else if (err instanceof Error && err.name === "NotFoundError") {
        setStatus("No mic found — plug one in and try again");
      } else {
        setStatus("Could not start recording: " + String(err));
      }
    }
  });

  async function handleRecordingDone(blob: Blob) {
    levelFill.style.width = "0%";
    micBtn.classList.remove("recording");
    micBtn.textContent = "🎤";
    recordingBlob = blob;
    void recordingBlob; // referenced for future export
    setStatus("Finding your last word…");

    try {
      const ctx = getAudioCtx();
      const ab = await blob.arrayBuffer();
      recordingBuffer = await ctx.decodeAudioData(ab);

      // Downmix to mono, resample to 16kHz for Whisper
      const mono16k = await downsampleToMono16k(recordingBuffer);

      const result = await transcriber.transcribe(mono16k);
      setStatus(
        result.words.length > 0
          ? "Got it! Adjust the cut point if needed."
          : "Transcription done.",
      );

      cutPointS =
        result.words.length > 0
          ? findCutPoint(result.words, recordingBuffer.duration)
          : energyFallback(recordingBuffer);

      // Show transcript
      showTranscript(result.text, result.words);
      drawWaveform(recordingBuffer, cutPointS);

      // Auto-stitch
      await doStitch();

      show("pitch-row");
      show("fry-row");
      show("btn-preview");
      show("btn-replay");
      show("btn-rerecord");
      show("btn-download");
    } catch (err) {
      setStatus("Error: " + String(err));
      console.error(err);
    }
  }

  async function doStitch() {
    if (!recordingBuffer || !ehhBuffer) return;
    const pitch = parseFloat(
      (document.getElementById("pitch") as HTMLInputElement).value,
    );
    const deepFried = (document.getElementById("deep-fry") as HTMLInputElement)
      .checked;
    stitchResult = await stitch({
      recordingBuffer,
      ehhBuffer,
      cutPointS,
      ehhPitch: pitch,
      deepFried,
    });
  }

  function showTranscript(
    text: string,
    words: Array<{ word: string; start: number; end: number }>,
  ) {
    const el = document.getElementById("transcript")!;
    show("transcript");
    if (!words.length) {
      el.textContent = text || "(no transcript)";
      return;
    }
    const lastWord = words[words.length - 1].word;
    const before = text.slice(0, text.lastIndexOf(lastWord));
    el.innerHTML = `${before}<span class="last-word">${lastWord}</span>`;
  }

  function drawWaveform(buf: AudioBuffer, cut: number) {
    const canvas = document.getElementById("waveform") as HTMLCanvasElement;
    show("waveform");
    const ctx = canvas.getContext("2d")!;
    const w = canvas.width;
    const h = canvas.height;
    const data = buf.getChannelData(0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#888";
    ctx.beginPath();
    const step = Math.ceil(data.length / w);
    for (let i = 0; i < w; i++) {
      let min = 1;
      let max = -1;
      for (let j = i * step; j < (i + 1) * step && j < data.length; j++) {
        if (data[j] < min) min = data[j];
        if (data[j] > max) max = data[j];
      }
      ctx.moveTo(i, ((1 + min) * h) / 2);
      ctx.lineTo(i, ((1 + max) * h) / 2);
    }
    ctx.stroke();
    // Cut marker
    const cutX = (cut / buf.duration) * w;
    ctx.strokeStyle = "#E8141C";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cutX, 0);
    ctx.lineTo(cutX, h);
    ctx.stroke();

    // Drag
    let dragging = false;
    canvas.onmousedown = (e) => {
      dragging = true;
      updateCut(e);
    };
    canvas.onmousemove = (e) => {
      if (dragging) updateCut(e);
    };
    canvas.onmouseup = () => {
      if (dragging) {
        dragging = false;
        doStitch();
      }
    };
    function updateCut(e: MouseEvent) {
      const rect = canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      cutPointS = x * buf.duration;
      drawWaveform(buf, cutPointS);
    }
  }

  document.getElementById("pitch")!.addEventListener("input", (e) => {
    const v = (e.target as HTMLInputElement).value;
    document.getElementById("pitch-val")!.textContent =
      `${parseFloat(v).toFixed(2)}×`;
    doStitch();
  });
  document
    .getElementById("deep-fry")!
    .addEventListener("change", () => doStitch());

  document
    .getElementById("btn-preview")!
    .addEventListener("click", async () => {
      if (!stitchResult) return;
      player.stop();
      player.play(
        stitchResult.buffer,
        stitchResult.ehhStartS,
        () => {},
        () => {},
      );
    });

  document.getElementById("btn-replay")!.addEventListener("click", async () => {
    if (!stitchResult) return;
    player.stop();
    getVideoElement(frame).currentTime = 0;
    getVideoElement(frame).play();
    player.play(
      stitchResult.buffer,
      stitchResult.ehhStartS,
      () => {
        // fire ehh moment — effects stub
      },
      () => {
        updateProgress(frame, 0);
      },
    );
  });

  document.getElementById("btn-rerecord")!.addEventListener("click", () => {
    player.stop();
    recordingBlob = null;
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

async function downsampleToMono16k(buffer: AudioBuffer): Promise<Float32Array> {
  const targetSR = 16000;
  const offCtx = new OfflineAudioContext(
    1,
    Math.ceil(buffer.duration * targetSR),
    targetSR,
  );
  const src = offCtx.createBufferSource();
  src.buffer = buffer;
  src.connect(offCtx.destination);
  src.start();
  const rendered = await offCtx.startRendering();
  return rendered.getChannelData(0);
}

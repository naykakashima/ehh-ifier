import { FRAME, EXPORT, EFFECTS, ASSETS } from "./config";
import { buildEffectScene, type EffectScene } from "./effects";

// ── Capability checks ─────────────────────────────────────────────────────────

export function canExportVideo(): boolean {
  const c = document.createElement("canvas");
  return typeof c.captureStream === "function";
}

// ── MIME selection ────────────────────────────────────────────────────────────

function bestMime(): string {
  const candidates = [
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

// ── SVG path length measurement ───────────────────────────────────────────────

function svgPathLen(d: string): number {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg") as SVGSVGElement;
  svg.style.cssText =
    "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;";
  const p = document.createElementNS(ns, "path") as SVGPathElement;
  p.setAttribute("d", d);
  svg.appendChild(p);
  document.body.appendChild(svg);
  const len = p.getTotalLength();
  document.body.removeChild(svg);
  return len;
}

// ── Image loader ──────────────────────────────────────────────────────────────

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error(`[DEV] Failed to load image: ${src}`));
    img.src = src;
  });
}

// ── Canvas TikTok UI ──────────────────────────────────────────────────────────

function drawUI(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  progress: number,
) {
  // Bottom gradient
  const grad = ctx.createLinearGradient(0, H * 0.62, 0, H);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.65)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, H * 0.62, W, H * 0.38);

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.7)";
  ctx.shadowBlur = 6;

  // Username
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.round(W * 0.037)}px system-ui,sans-serif`;
  ctx.fillText("@funkyehh_official", W * 0.028, H * 0.855);

  // Sound line
  ctx.font = `${Math.round(W * 0.03)}px system-ui,sans-serif`;
  ctx.fillText("♫ original sound · funkyehh", W * 0.028, H * 0.876);

  ctx.restore();

  // Progress bar
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.fillRect(0, H - 5, W, 5);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillRect(0, H - 5, W * progress, 5);

  // Action column
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 4;
  const ax = W * 0.875;
  const iconR = W * 0.062;
  let ay = H * 0.5;

  // Avatar
  ctx.beginPath();
  ctx.arc(ax, ay, iconR, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(ax, ay - iconR * 0.3, 0, ax, ay, iconR);
  g.addColorStop(0, "#ff8c69");
  g.addColorStop(1, "#e8141c");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = Math.round(W * 0.006);
  ctx.stroke();
  ay += H * 0.072;

  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";

  const items: [string, string][] = [
    ["♥", "1.2M"],
    ["💬", "43K"],
    ["🔖", "89K"],
  ];
  for (const [icon, count] of items) {
    ctx.font = `${Math.round(W * 0.072)}px system-ui,sans-serif`;
    ctx.fillText(icon, ax, ay);
    ctx.font = `bold ${Math.round(W * 0.028)}px system-ui,sans-serif`;
    ctx.fillText(count, ax, ay + Math.round(W * 0.042));
    ay += H * 0.072;
  }
  ctx.textAlign = "left";
  ctx.restore();
}

// ── Canvas effect drawing ─────────────────────────────────────────────────────

function drawEffects(
  ctx: CanvasRenderingContext2D,
  W: number,
  scene: EffectScene,
  faceImg: HTMLImageElement,
  ehhElapsedMs: number,
  ov1Len: number,
  ov2Len: number,
  arrLen: number,
) {
  const {
    OVAL_DRAW_MS: OD,
    ARROW_DRAW_MS: AD,
    OVAL_STROKE_COLOR: SC,
    OVAL_STROKE_WIDTH: SW,
    ARROW_STROKE_WIDTH: ASW,
  } = EFFECTS;
  const scale = W / 360; // stroke widths were designed for 360px-wide frame

  // Face — clip to ellipse then draw image
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(
    scene.faceX + scene.faceW / 2,
    scene.faceY + scene.faceH / 2,
    scene.faceW / 2,
    (scene.faceH / 2) * 0.96,
    0,
    0,
    Math.PI * 2,
  );
  ctx.clip();
  ctx.drawImage(faceImg, scene.faceX, scene.faceY, scene.faceW, scene.faceH);
  ctx.restore();

  const ov1p = Math.min(1, ehhElapsedMs / OD);
  const ov2p = Math.min(1, Math.max(0, (ehhElapsedMs - 20) / OD));
  const arrDelay = OD + 40;
  const arrp = Math.min(1, Math.max(0, (ehhElapsedMs - arrDelay) / AD));
  const showHead = ehhElapsedMs >= arrDelay + AD + 16;

  // Oval 1
  ctx.save();
  ctx.setLineDash([ov1p * ov1Len, ov1Len]);
  ctx.strokeStyle = SC;
  ctx.lineWidth = SW * scale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke(new Path2D(scene.ovalPath1));
  ctx.restore();

  // Oval 2
  ctx.save();
  ctx.setLineDash([ov2p * ov2Len, ov2Len]);
  ctx.strokeStyle = "#ff3a40";
  ctx.lineWidth = (SW - 1) * scale;
  ctx.lineCap = "round";
  ctx.stroke(new Path2D(scene.ovalPath2));
  ctx.restore();

  // Arrow
  ctx.save();
  ctx.setLineDash([arrp * arrLen, arrLen]);
  ctx.strokeStyle = SC;
  ctx.lineWidth = ASW * scale;
  ctx.lineCap = "round";
  ctx.stroke(new Path2D(scene.arrowPath));
  ctx.restore();

  // Arrowhead
  if (showHead) {
    ctx.fillStyle = SC;
    ctx.fill(new Path2D(scene.headPath));
  }
}

// ── WAV fallback ──────────────────────────────────────────────────────────────

export function downloadWav(buffer: AudioBuffer): void {
  const ch = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const n = buffer.length;
  const bps = 2; // 16-bit
  const ab = new ArrayBuffer(44 + ch * n * bps);
  const v = new DataView(ab);
  const ws = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  ws(0, "RIFF");
  v.setUint32(4, 36 + ch * n * bps, true);
  ws(8, "WAVE");
  ws(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, ch, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * ch * bps, true);
  v.setUint16(32, ch * bps, true);
  v.setUint16(34, 16, true);
  ws(36, "data");
  v.setUint32(40, ch * n * bps, true);
  let off = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      v.setInt16(
        off,
        Math.max(-1, Math.min(1, buffer.getChannelData(c)[i])) * 0x7fff,
        true,
      );
      off += 2;
    }
  }
  triggerDownload(new Blob([ab], { type: "audio/wav" }), "ehh-ifier.wav");
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface ExportOptions {
  videoEl: HTMLVideoElement;
  stitchedBuffer: AudioBuffer;
  ehhStartS: number;
  seed: number;
  onProgress: (fraction: number) => void;
}

export async function exportVideo(opts: ExportOptions): Promise<Blob> {
  const { videoEl, stitchedBuffer, ehhStartS, seed, onProgress } = opts;
  const W = FRAME.WIDTH,
    H = FRAME.HEIGHT;
  const duration = stitchedBuffer.duration;

  const faceImg = await loadImg(ASSETS.FACE_IMG);
  const scene = buildEffectScene(W, H, seed);

  // Measure path lengths via temp SVG (needed for canvas setLineDash)
  const ov1Len = svgPathLen(scene.ovalPath1);
  const ov2Len = svgPathLen(scene.ovalPath2);
  const arrLen = svgPathLen(scene.arrowPath);

  // Canvas
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Audio routing: stitched buffer → MediaStreamDestinationNode (captured, not played)
  const audioCtx = new AudioContext();
  const src = audioCtx.createBufferSource();
  src.buffer = stitchedBuffer;
  const dest = audioCtx.createMediaStreamDestination();
  src.connect(dest);

  // Combined stream
  const mime = bestMime();
  const videoStream = canvas.captureStream(EXPORT.FPS);
  const combined = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);
  const recorder = new MediaRecorder(combined, mime ? { mimeType: mime } : {});
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  // Reset & play gameplay video
  videoEl.currentTime = 0;
  void videoEl.play();

  return new Promise((resolve, reject) => {
    recorder.onstop = () => {
      void audioCtx.close();
      resolve(new Blob(chunks, { type: recorder.mimeType || "video/webm" }));
    };
    recorder.onerror = (e) => reject(new Error(String(e)));
    recorder.start(100);

    const startTime = audioCtx.currentTime;
    src.start();

    let rafId: number;
    const draw = () => {
      const elapsed = audioCtx.currentTime - startTime;
      const fraction = Math.min(1, elapsed / duration);
      onProgress(fraction);

      ctx.drawImage(videoEl, 0, 0, W, H);
      drawUI(ctx, W, H, fraction);

      const ehhElapsed = elapsed - ehhStartS;
      if (ehhElapsed >= 0) {
        drawEffects(
          ctx,
          W,
          scene,
          faceImg,
          ehhElapsed * 1000,
          ov1Len,
          ov2Len,
          arrLen,
        );
      }

      if (fraction < 1) {
        rafId = requestAnimationFrame(draw);
      } else {
        cancelAnimationFrame(rafId);
        // Small buffer to ensure last frames are captured
        setTimeout(() => recorder.stop(), 150);
      }
    };
    rafId = requestAnimationFrame(draw);

    src.onended = () => {
      cancelAnimationFrame(rafId);
      setTimeout(() => recorder.stop(), 150);
    };
  });
}

// ── Trigger browser download ──────────────────────────────────────────────────

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

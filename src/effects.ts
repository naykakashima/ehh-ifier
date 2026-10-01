import { ASSETS, EFFECTS } from "./config";

// ── Seeded RNG ────────────────────────────────────────────────────────────────

function mkRng(seed: number): () => number {
  let s = (seed * 1664525 + 1013904223) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// ── Path generators ───────────────────────────────────────────────────────────

function jitteredEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  jitter: number,
  turns: number,
  rng: () => number,
): string {
  const N = 48;
  const pts: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const angle = (i / N) * Math.PI * 2 * turns;
    const jr = (rng() - 0.5) * jitter * 2;
    const ja = (rng() - 0.5) * jitter * 2;
    pts.push([
      cx + (rx + jr) * Math.cos(angle),
      cy + (ry + ja) * Math.sin(angle),
    ]);
  }
  // Smooth through midpoints using quadratic beziers — looks hand-drawn
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const mx = ((pts[i - 1][0] + pts[i][0]) / 2).toFixed(1);
    const my = ((pts[i - 1][1] + pts[i][1]) / 2).toFixed(1);
    d += ` Q ${pts[i - 1][0].toFixed(1)} ${pts[i - 1][1].toFixed(1)} ${mx} ${my}`;
  }
  return d;
}

interface Pt {
  x: number;
  y: number;
}

function wobblyCubic(
  from: Pt,
  to: Pt,
  rng: () => number,
): { d: string; cp2: Pt } {
  const dx = to.x - from.x,
    dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  const jScale = len * 0.2;
  const cp1: Pt = {
    x: from.x + dx * 0.3 + (rng() - 0.5) * jScale * 2,
    y: from.y + dy * 0.3 + (rng() - 0.5) * jScale * 2,
  };
  const cp2: Pt = {
    x: from.x + dx * 0.72 + (rng() - 0.5) * jScale * 2,
    y: from.y + dy * 0.72 + (rng() - 0.5) * jScale * 2,
  };
  return {
    d: `M ${f(from.x)} ${f(from.y)} C ${f(cp1.x)} ${f(cp1.y)} ${f(cp2.x)} ${f(cp2.y)} ${f(to.x)} ${f(to.y)}`,
    cp2,
  };
}

function arrowheadPoly(tip: Pt, cp2: Pt, size: number): string {
  const angle = Math.atan2(tip.y - cp2.y, tip.x - cp2.x);
  const spread = 0.44;
  const p1 = {
    x: tip.x - size * Math.cos(angle - spread),
    y: tip.y - size * Math.sin(angle - spread),
  };
  const p2 = {
    x: tip.x - size * Math.cos(angle + spread),
    y: tip.y - size * Math.sin(angle + spread),
  };
  return `M ${f(tip.x)} ${f(tip.y)} L ${f(p1.x)} ${f(p1.y)} L ${f(p2.x)} ${f(p2.y)} Z`;
}

function f(n: number): string {
  return n.toFixed(1);
}

// ── Draw-on animation (stroke-dashoffset) ─────────────────────────────────────

function animateDash(
  el: SVGPathElement,
  durationMs: number,
  delayMs: number,
  instant: boolean,
) {
  const len = el.getTotalLength();
  el.style.strokeDasharray = String(len);
  el.style.strokeDashoffset = String(instant ? 0 : len);
  if (instant) return;
  let start: number | null = null;
  const step = (ts: number) => {
    if (start === null) start = ts;
    const progress = Math.min(
      1,
      Math.max(0, ts - start - delayMs) / durationMs,
    );
    el.style.strokeDashoffset = String(len * (1 - progress));
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ── Screen shake ──────────────────────────────────────────────────────────────

function shake(frame: HTMLElement) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const { SHAKE_MAGNITUDE_PX: mag, SHAKE_DURATION_MS: dur } = EFFECTS;
  const steps = 8;
  let i = 0;
  const tick = () => {
    if (i >= steps) {
      frame.style.transform = "";
      return;
    }
    const decay = 1 - i / steps;
    frame.style.transform = `translate(${(Math.random() - 0.5) * mag * 2 * decay}px,${(Math.random() - 0.5) * mag * 2 * decay}px)`;
    i++;
    setTimeout(tick, dur / steps);
  };
  tick();
}

// ── SVG helper ────────────────────────────────────────────────────────────────

function svgPath(attrs: Record<string, string>): SVGPathElement {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface EffectsHandle {
  clear(): void;
}

export function triggerEhhEffects(
  frame: HTMLElement,
  ehhDurationS: number,
  seed: number,
): EffectsHandle {
  const instant = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rng = mkRng(Math.round(seed * 0xffffff) | 1);
  const fw = frame.clientWidth;
  const fh = frame.clientHeight;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const later = (fn: () => void, ms: number) => {
    timers.push(setTimeout(fn, ms));
  };

  // ── Face ──────────────────────────────────────────────────────────────────
  const fs = Math.round(fw * EFFECTS.FACE_SIZE_FRACTION);
  // bottomClear: keep face above the username bar (bottom ~16% of frame)
  const bottomClear = Math.round(fh * 0.16);
  const faceTop = fh - bottomClear - fs;
  const side = rng() > 0.5 ? "right" : "left";
  // right-side face stays left of the action column (~80px wide on right edge)
  const faceLeft = side === "left" ? 8 : fw - 80 - fs;

  const faceEl = document.createElement("div");
  faceEl.style.cssText =
    `position:absolute;left:${faceLeft}px;top:${faceTop}px;` +
    `width:${fs}px;height:${fs}px;overflow:hidden;` +
    `border-radius:52% 48% / 50% 46%;z-index:10;` +
    `transform:scale(0);` +
    `transition:transform ${EFFECTS.POPIN_DURATION_MS}ms cubic-bezier(0.34,1.56,0.64,1);`;
  const img = document.createElement("img");
  img.src = ASSETS.FACE_IMG;
  img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;";
  img.addEventListener("error", () =>
    console.warn("[DEV] face.jpg failed to load"),
  );
  faceEl.appendChild(img);
  frame.appendChild(faceEl);
  // Trigger pop-in after two frames so the transition fires
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      faceEl.style.transform = "scale(1)";
    }),
  );

  // ── Oval ──────────────────────────────────────────────────────────────────
  const svg = frame.querySelector(".effects-svg") as SVGSVGElement;
  const cx = faceLeft + fs / 2;
  const cy = faceTop + fs / 2;
  const rx = (fs / 2) * 1.2;
  const ry = (fs / 2) * 1.14;
  const {
    OVAL_JITTER: J,
    OVAL_STROKE_COLOR: SC,
    OVAL_STROKE_WIDTH: SW,
    OVAL_DRAW_MS: OD,
    POPIN_DURATION_MS: PD,
  } = EFFECTS;

  const rng1 = mkRng(Math.round(seed * 0xffffff));
  const rng2 = mkRng(Math.round(seed * 0xffffff) + 7);

  const oval1 = svgPath({
    d: jitteredEllipse(cx, cy, rx, ry, J, 1.15, rng1),
    fill: "none",
    stroke: SC,
    "stroke-width": String(SW),
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  });
  const oval2 = svgPath({
    d: jitteredEllipse(
      cx + (rng() - 0.5) * 4,
      cy + (rng() - 0.5) * 4,
      rx + 1,
      ry + 1,
      J + 2,
      1.1,
      rng2,
    ),
    fill: "none",
    stroke: "#ff3a40",
    "stroke-width": String(SW - 1),
    "stroke-linecap": "round",
  });

  svg.appendChild(oval1);
  svg.appendChild(oval2);
  animateDash(oval1, OD, instant ? 0 : PD, instant);
  animateDash(oval2, OD, instant ? 0 : PD + 20, instant);

  // ── Arrow ─────────────────────────────────────────────────────────────────
  // Start from the inward-facing edge of the oval
  const arrowFrom: Pt = {
    x: side === "left" ? cx + rx * 1.05 : cx - rx * 1.05,
    y: cy - fs * 0.06,
  };
  // Target: upper/middle safe zone, keeping away from face and UI
  const minLen = fh * 0.28,
    maxLen = fh * 0.45;
  const arrowRng = mkRng(Math.round(seed * 0xffffff) + 99);
  let tx = fw * 0.1 + arrowRng() * fw * 0.8;
  let ty = fh * 0.08 + arrowRng() * fh * 0.38;
  const raw = Math.hypot(tx - arrowFrom.x, ty - arrowFrom.y);
  // clamp length
  const clampLen = Math.min(maxLen, Math.max(minLen, raw));
  if (Math.abs(clampLen - raw) > 1) {
    const scale = clampLen / raw;
    tx = arrowFrom.x + (tx - arrowFrom.x) * scale;
    ty = arrowFrom.y + (ty - arrowFrom.y) * scale;
  }

  const { d: arrowD, cp2 } = wobblyCubic(arrowFrom, { x: tx, y: ty }, arrowRng);
  const { ARROW_DRAW_MS: AD, ARROW_STROKE_WIDTH: ASW } = EFFECTS;
  const arrowEl = svgPath({
    d: arrowD,
    fill: "none",
    stroke: SC,
    "stroke-width": String(ASW),
    "stroke-linecap": "round",
  });
  svg.appendChild(arrowEl);

  const headEl = svgPath({
    d: arrowheadPoly({ x: tx, y: ty }, cp2, fw * 0.055),
    fill: SC,
    stroke: SC,
    "stroke-width": "2",
    "stroke-linejoin": "round",
  });
  headEl.style.opacity = "0";
  svg.appendChild(headEl);

  const arrowDelay = instant ? 0 : PD + OD + 40;
  animateDash(arrowEl, AD, arrowDelay, instant);

  const headDelay = instant ? 0 : arrowDelay + AD + 16;
  later(() => {
    headEl.style.opacity = "1";
    shake(frame);
  }, headDelay);

  // ── Fade-out ──────────────────────────────────────────────────────────────
  const holdUntil = ehhDurationS * 1000 + EFFECTS.HOLD_AFTER_EHH_MS;
  later(() => {
    const fade = `opacity ${EFFECTS.FADE_OUT_MS}ms ease`;
    faceEl.style.transition = fade;
    faceEl.style.opacity = "0";
    for (const el of [oval1, oval2, arrowEl, headEl] as SVGElement[]) {
      el.style.transition = fade;
      el.style.opacity = "0";
    }
    later(() => {
      faceEl.remove();
      for (const el of [oval1, oval2, arrowEl, headEl]) el.remove();
    }, EFFECTS.FADE_OUT_MS);
  }, holdUntil);

  return {
    clear() {
      for (const t of timers) clearTimeout(t);
      frame.style.transform = "";
      faceEl.remove();
      for (const el of [oval1, oval2, arrowEl, headEl]) el.remove();
    },
  };
}

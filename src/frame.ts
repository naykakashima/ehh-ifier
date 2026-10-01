import { ASSETS } from "./config";

export function createFrame(): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "tiktok-wrapper";

  // ── Gameplay video ────────────────────────────────────────────────────────
  const video = document.createElement("video");
  video.src = ASSETS.GAMEPLAY_MP4;
  video.loop = true;
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.style.cssText =
    "width:100%;height:100%;object-fit:cover;position:absolute;inset:0;";
  video.addEventListener("error", () => {
    console.warn("[DEV] gameplay.mp4 failed to load");
    wrapper.style.background =
      "linear-gradient(160deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%)";
  });

  // ── Fake TikTok UI overlay ────────────────────────────────────────────────
  const ui = document.createElement("div");
  ui.className = "tiktok-ui";
  ui.innerHTML = `
    <!-- Right action column -->
    <div class="tt-actions">
      <div class="tt-avatar">
        <div class="tt-avatar-inner"></div>
        <div class="tt-plus">+</div>
      </div>
      <div class="tt-action-item">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.27 2 8.5 2 5.41 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.08C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.41 22 8.5c0 3.77-3.4 6.86-8.55 11.53L12 21.35z"/></svg>
        <span>1.2M</span>
      </div>
      <div class="tt-action-item">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>
        <span>43K</span>
      </div>
      <div class="tt-action-item">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>
        <span>89K</span>
      </div>
      <div class="tt-action-item">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.15c-.05.21-.08.43-.08.66 0 1.61 1.31 2.91 2.92 2.91s2.92-1.3 2.92-2.91-1.31-2.92-2.92-2.92z"/></svg>
        <span>201K</span>
      </div>
    </div>

    <!-- Bottom info bar -->
    <div class="tt-info">
      <div class="tt-username">@funkyehh_official</div>
      <div class="tt-sound">♬ original sound · funkyehh</div>
    </div>

    <!-- Progress bar -->
    <div class="tt-progress-track">
      <div class="progress-fill"></div>
    </div>
  `;

  // ── SVG overlay — effects draw here ──────────────────────────────────────
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("effects-svg");

  wrapper.appendChild(video);
  wrapper.appendChild(ui);
  wrapper.appendChild(svg);

  return wrapper;
}

export function getVideoElement(frame: HTMLElement): HTMLVideoElement {
  return frame.querySelector("video")!;
}

export function updateProgress(frame: HTMLElement, fraction: number) {
  const fill = frame.querySelector(".progress-fill") as HTMLElement | null;
  if (fill) fill.style.width = `${fraction * 100}%`;
}

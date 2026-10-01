// Fake TikTok frame with gameplay video and UI overlay
import { ASSETS } from "./config";

export function createFrame(): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "tiktok-wrapper";

  const video = document.createElement("video");
  video.src = ASSETS.GAMEPLAY_MP4;
  video.loop = true;
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.style.cssText =
    "width:100%;height:100%;object-fit:cover;position:absolute;inset:0;";
  video.addEventListener("error", () => {
    console.warn("[DEV] gameplay.mp4 failed to load");
    wrapper.style.background = "#111";
  });

  // Fake TikTok UI overlay
  const ui = document.createElement("div");
  ui.style.cssText = "position:absolute;inset:0;pointer-events:none;";
  ui.innerHTML = `
    <div style="position:absolute;right:10px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:18px;align-items:center;">
      <div style="width:44px;height:44px;border-radius:50%;background:#888;border:2px solid #fff;overflow:hidden;">
        <div style="width:100%;height:100%;background:linear-gradient(135deg,#e8141c,#ff6b6b);"></div>
      </div>
      ${["❤️ 1.2M", "💬 43K", "🔖 89K", "↗️ 201K"].map((x) => `<div style="text-align:center;font-size:11px;color:#fff;text-shadow:0 1px 2px #000;">${x}</div>`).join("")}
    </div>
    <div style="position:absolute;bottom:50px;left:12px;right:80px;">
      <div style="font-weight:700;font-size:13px;color:#fff;text-shadow:0 1px 2px #000;">@funkyehh_official</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.8);margin-top:2px;text-shadow:0 1px 2px #000;">♬ original sound - funkyehh</div>
    </div>
    <div style="position:absolute;bottom:0;left:0;right:0;height:3px;background:rgba(255,255,255,0.3);">
      <div class="progress-fill" style="height:100%;background:#fff;width:0%;transition:width 0.1s;"></div>
    </div>
  `;

  // SVG overlay for effects
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;";
  svg.setAttribute("class", "effects-svg");

  // Face image container
  const faceContainer = document.createElement("div");
  faceContainer.className = "face-container";
  faceContainer.style.cssText = "position:absolute;display:none;";

  wrapper.appendChild(video);
  wrapper.appendChild(ui);
  wrapper.appendChild(svg);
  wrapper.appendChild(faceContainer);

  return wrapper;
}

export function getVideoElement(frame: HTMLElement): HTMLVideoElement {
  return frame.querySelector("video")!;
}

export function updateProgress(frame: HTMLElement, fraction: number) {
  const fill = frame.querySelector(".progress-fill") as HTMLElement;
  if (fill) fill.style.width = `${fraction * 100}%`;
}

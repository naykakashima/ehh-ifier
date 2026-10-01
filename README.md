# The Ehh-ifier

> Record yourself saying anything. The last word gets replaced by the **funky ehh**. A cursed meme editor that runs entirely in your browser.

![screenshot placeholder — replace with a GIF of the app in action](docs/screenshot.png)

---

## What it does

1. **Record** — tap the mic button and say a short sentence (up to 10 seconds)
2. **Transcribe** — Whisper (running locally in a Web Worker) finds word-level timestamps
3. **Cut** — the app finds where the last real word starts and slices the recording there
4. **Stitch** — your clipped recording + the ehh sound clip are fused into one audio buffer
5. **Play** — a fake TikTok frame plays gameplay footage while your audio plays; at the exact moment the ehh hits, a reaction face pops in with a hand-drawn red scribble oval and a wobbly arrow pointing at the gameplay
6. **Download** — exports as MP4/WebM with audio baked in

---

## Run locally

```bash
git clone https://github.com/naykakashima/ehh-ifier.git
cd ehh-ifier
npm install
npm run dev
```

Open `http://localhost:5173` in Chrome or Safari.

> **HTTPS required for mic access.** `localhost` is exempt, so local dev works fine. Any Vercel/Netlify deployment also works out of the box.

On first use the app downloads the Whisper model (~40 MB). It is cached by the browser so subsequent visits are instant.

---

## How it works

```
getUserMedia → MediaRecorder → AudioBuffer
                                    ↓
              OfflineAudioContext (16 kHz mono) → Whisper (transformers.js Web Worker)
                                    ↓
                         word timestamps → last word start − 60 ms = cut point
                                    ↓
              OfflineAudioContext: [recording 0→cut | fade] + [ehh.mp3 at pitch]
                                    ↓
                         Player (AudioContext) fires onEhh callback
                                    ↓
                    effects.ts draws face + scribble oval + arrow on SVG overlay
                                    ↓
              canvas.captureStream(30) + MediaStreamAudioDestinationNode → MediaRecorder → MP4/WebM
```

**Whisper model:** `onnx-community/whisper-tiny.en` via `@huggingface/transformers`. Runs on WebGPU if available, otherwise falls back to WASM. The Web Worker keeps the UI thread responsive during inference.

**Cut point fallback:** if Whisper returns no usable word timestamps, the app falls back to RMS energy analysis to find the last voiced segment.

**Scribble oval & arrow:** paths are generated procedurally using a seeded LCG RNG. Each replay seeds from the current timestamp so the jitter varies slightly. The export canvas reuses the same seed as the last replay so the downloaded video matches what you saw.

---

## Browser support

| Browser       | Record | Transcribe          | Export video |
| ------------- | ------ | ------------------- | ------------ |
| Chrome 112+   | ✅     | ✅ (WebGPU or WASM) | ✅ WebM      |
| Safari 17+    | ✅     | ✅ (WASM)           | ✅ MP4       |
| Firefox 115+  | ✅     | ✅ (WASM)           | ✅ WebM      |
| Mobile Chrome | ✅     | ✅                  | ✅           |
| Mobile Safari | ✅     | ✅                  | ✅           |

If `canvas.captureStream` is unavailable the Download button falls back to a WAV audio download.

---

## Media assets

`public/ehh.mp3`, `public/face.jpg`, and `public/gameplay.mp4` are user-supplied meme content and are **not covered by the MIT license** on the code. They are included solely to make the joke work and are not redistributed for any other purpose.

---

## License

MIT — see [LICENSE](LICENSE). The media files in `public/` are excluded.

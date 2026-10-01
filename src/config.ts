// src/config.ts — all tunables in one place

export const ASSETS = {
  EHH_MP3: "/ehh.mp3",
  FACE_IMG: "/face.jpg",
  GAMEPLAY_MP4: "/gameplay.mp4",
} as const;

export const WHISPER = {
  MODEL_ID: "Xenova/whisper-tiny.en",
  SAMPLE_RATE: 16000,
  FILLERS: ["uh", "um", "ah", "er", "like", "you know"],
} as const;

export const CUT = {
  WHISPER_OFFSET_MS: -40, // small lead-in before the last word's anchor point
  ENERGY_FRAME_MS: 20, // RMS frame size for energy fallback
  ENERGY_SILENCE_THRESHOLD: 0.01,
} as const;

export const STITCH = {
  FADE_OUT_MS: 20, // fade-out on recording before ehh
  EHH_OVERLAP_MS: 0, // 0 = seamless join at cut point
  EHH_PITCH_DEFAULT: 1.0, // playbackRate
  EHH_PITCH_MIN: 0.7,
  EHH_PITCH_MAX: 1.4,
  DEEP_FRY_BASS_GAIN_DB: 8,
  DEEP_FRY_BASS_FREQ: 200,
} as const;

export const RECORD = {
  MAX_DURATION_MS: 10000,
  SAMPLE_RATE: 44100,
} as const;

export const FRAME = {
  WIDTH: 720,
  HEIGHT: 1280,
  ASPECT: 9 / 16,
} as const;

export const EFFECTS = {
  FACE_SIZE_FRACTION: 0.4, // fraction of frame width
  POPIN_DURATION_MS: 150,
  OVAL_DRAW_MS: 200,
  OVAL_STROKE_COLOR: "#E8141C",
  OVAL_STROKE_WIDTH: 5,
  OVAL_JITTER: 8, // px of wobbly randomness
  ARROW_DRAW_MS: 250,
  ARROW_STROKE_WIDTH: 6,
  SHAKE_MAGNITUDE_PX: 6,
  SHAKE_DURATION_MS: 300,
  HOLD_AFTER_EHH_MS: 500,
  FADE_OUT_MS: 400,
} as const;

export const EXPORT = {
  FPS: 30,
  PREFER_MP4: true,
} as const;

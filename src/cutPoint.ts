// Finds the cut point in an AudioBuffer
import { CUT, WHISPER } from "./config";

export interface WordTimestamp {
  word: string;
  start: number; // seconds
  end: number;
}

export function findCutPoint(
  words: WordTimestamp[],
  audioDurationS: number,
): number {
  const real = words.filter((w) => {
    const clean = w.word.replace(/[^a-zA-Z]/g, "").toLowerCase();
    return (
      clean.length > 0 &&
      !(WHISPER.FILLERS as readonly string[]).includes(clean)
    );
  });
  if (real.length === 0) return audioDurationS * 0.8; // fallback
  const last = real[real.length - 1];
  return Math.max(0, last.start + CUT.WHISPER_OFFSET_MS / 1000);
}

export function energyFallback(buffer: AudioBuffer): number {
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const frameSize = Math.round((CUT.ENERGY_FRAME_MS / 1000) * sr);
  const frames: number[] = [];
  for (let i = 0; i < data.length; i += frameSize) {
    let sum = 0;
    const end = Math.min(i + frameSize, data.length);
    for (let j = i; j < end; j++) sum += data[j] * data[j];
    frames.push(Math.sqrt(sum / (end - i)));
  }
  // Find last frame above threshold preceded by silence
  let lastVoiced = frames.length - 1;
  for (let i = frames.length - 1; i >= 1; i--) {
    if (
      frames[i] > CUT.ENERGY_SILENCE_THRESHOLD &&
      frames[i - 1] < CUT.ENERGY_SILENCE_THRESHOLD
    ) {
      lastVoiced = i;
      break;
    }
  }
  return (lastVoiced * frameSize) / sr;
}

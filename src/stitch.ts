// Stitches recording + ehh into one AudioBuffer
import { STITCH } from "./config";

export interface StitchOptions {
  recordingBuffer: AudioBuffer;
  ehhBuffer: AudioBuffer;
  cutPointS: number;
  ehhPitch: number;
  deepFried: boolean;
}

export interface StitchResult {
  buffer: AudioBuffer;
  ehhStartS: number; // when ehh starts in the result
}

export async function stitch(opts: StitchOptions): Promise<StitchResult> {
  const { recordingBuffer, ehhBuffer, cutPointS, ehhPitch, deepFried } = opts;
  const sr = recordingBuffer.sampleRate;
  const fadeOutFrames = Math.round((STITCH.FADE_OUT_MS / 1000) * sr);
  const overlapFrames = Math.round((STITCH.EHH_OVERLAP_MS / 1000) * sr);
  const cutFrames = Math.round(cutPointS * sr);
  const ehhFrames = Math.round((ehhBuffer.duration * sr) / ehhPitch);
  const totalFrames = cutFrames - overlapFrames + ehhFrames;

  const ctx = new OfflineAudioContext(1, totalFrames, sr);

  // Recording portion (0 → cutPoint with fade-out)
  const recSlice = ctx.createBuffer(1, cutFrames, sr);
  const recData = recordingBuffer.getChannelData(0);
  const sliceData = recSlice.getChannelData(0);
  for (let i = 0; i < cutFrames && i < recData.length; i++) {
    let gain = 1;
    const fadeStart = cutFrames - fadeOutFrames;
    if (i >= fadeStart) gain = 1 - (i - fadeStart) / fadeOutFrames;
    sliceData[i] = recData[i] * gain;
  }
  const recSrc = ctx.createBufferSource();
  recSrc.buffer = recSlice;
  recSrc.connect(ctx.destination);
  recSrc.start(0);

  // Ehh portion
  const ehhStart = (cutFrames - overlapFrames) / sr;
  const ehhSrc = ctx.createBufferSource();
  ehhSrc.buffer = ehhBuffer;
  ehhSrc.playbackRate.value = ehhPitch;
  if (deepFried) {
    const bass = ctx.createBiquadFilter();
    bass.type = "lowshelf";
    bass.frequency.value = STITCH.DEEP_FRY_BASS_FREQ;
    bass.gain.value = STITCH.DEEP_FRY_BASS_GAIN_DB;
    ehhSrc.connect(bass);
    bass.connect(ctx.destination);
  } else {
    ehhSrc.connect(ctx.destination);
  }
  ehhSrc.start(ehhStart);

  const rendered = await ctx.startRendering();
  return { buffer: rendered, ehhStartS: ehhStart };
}

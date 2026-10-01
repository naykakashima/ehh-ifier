// Whisper transcription worker
import { pipeline, env } from "@huggingface/transformers";
import { WHISPER } from "../config";

env.allowLocalModels = false;

let transcriber: Awaited<ReturnType<typeof pipeline>> | null = null;

async function loadModel(
  onProgress: (p: { stage: string; percent?: number }) => void,
) {
  if (transcriber) return transcriber;
  onProgress({ stage: "Downloading model (~40MB, cached after first run)…" });
  transcriber = await pipeline(
    "automatic-speech-recognition",
    WHISPER.MODEL_ID,
    {
      dtype: "fp32",
      device: "webgpu" as never, // will fall back to wasm if unavailable
      progress_callback: (p: { status: string; progress?: number }) => {
        if (p.status === "downloading" || p.status === "loading") {
          onProgress({ stage: p.status, percent: p.progress });
        }
      },
    },
  );
  return transcriber;
}

self.onmessage = async (e) => {
  const { type, payload } = e.data;

  if (type === "preload") {
    try {
      await loadModel(() => {});
    } catch {}
    return;
  }

  if (type === "transcribe") {
    try {
      const model = await loadModel((p) =>
        self.postMessage({ type: "progress", payload: p }),
      );
      self.postMessage({
        type: "progress",
        payload: { stage: "Transcribing…" },
      });
      const result = await (model as any)(payload as Float32Array, {
        sampling_rate: WHISPER.SAMPLE_RATE,
        return_timestamps: "word",
        chunk_length_s: 30,
      });
      const chunks = (result as any).chunks ?? [];
      const words = chunks.map((c: any) => ({
        word: c.text,
        start: c.timestamp[0] ?? 0,
        end: c.timestamp[1] ?? 0,
      }));
      self.postMessage({
        type: "result",
        payload: { words, text: (result as any).text ?? "" },
      });
    } catch (err) {
      self.postMessage({ type: "error", payload: String(err) });
    }
  }
};

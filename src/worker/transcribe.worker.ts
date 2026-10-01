import { pipeline, env } from "@huggingface/transformers";
import { WHISPER } from "../config";

env.allowLocalModels = false;

type ASRPipeline = Awaited<ReturnType<typeof pipeline>>;
let asr: ASRPipeline | null = null;

async function detectDevice(): Promise<"webgpu" | "wasm"> {
  try {
    if (typeof navigator === "undefined" || !("gpu" in navigator))
      return "wasm";
    const adapter = await (
      navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } }
    ).gpu.requestAdapter();
    return adapter ? "webgpu" : "wasm";
  } catch {
    return "wasm";
  }
}

async function loadModel(
  onProgress: (p: { stage: string; percent?: number }) => void,
): Promise<ASRPipeline> {
  if (asr) return asr;
  const device = await detectDevice();
  onProgress({
    stage: `Loading model (${device === "webgpu" ? "GPU" : "CPU"})…`,
  });
  asr = await pipeline("automatic-speech-recognition", WHISPER.MODEL_ID, {
    dtype: "fp32",
    device,
    progress_callback: (p: Record<string, unknown>) => {
      const status = p["status"] as string;
      const progress = p["progress"] as number | undefined;
      if (
        status === "downloading" ||
        status === "loading" ||
        status === "progress"
      ) {
        onProgress({
          stage: "Downloading model (~40MB, cached after first run)…",
          percent: progress,
        });
      }
    },
  });
  return asr;
}

self.onmessage = async (
  e: MessageEvent<{ type: string; payload: Float32Array }>,
) => {
  const { type, payload } = e.data;

  if (type === "preload") {
    try {
      await loadModel(() => {});
    } catch {
      /* silent preload fail is fine */
    }
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
      const result = await (
        model as (
          input: Float32Array,
          opts: Record<string, unknown>,
        ) => Promise<Record<string, unknown>>
      )(payload, {
        sampling_rate: WHISPER.SAMPLE_RATE,
        return_timestamps: "word",
        chunk_length_s: 30,
      });
      const chunks =
        (result["chunks"] as Array<{
          text: string;
          timestamp: [number, number];
        }>) ?? [];
      const words = chunks.map((c) => ({
        word: c.text,
        start: c.timestamp[0] ?? 0,
        end: c.timestamp[1] ?? 0,
      }));
      self.postMessage({
        type: "result",
        payload: { words, text: (result["text"] as string) ?? "" },
      });
    } catch (err) {
      self.postMessage({ type: "error", payload: String(err) });
    }
  }
};

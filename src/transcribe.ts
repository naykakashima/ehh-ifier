// Manages the transcribe worker
export interface TranscribeResult {
  words: Array<{ word: string; start: number; end: number }>;
  text: string;
}

export type TranscribeProgressCallback = (progress: {
  stage: string;
  percent?: number;
}) => void;

export function createTranscriber(onProgress: TranscribeProgressCallback) {
  const worker = new Worker(
    new URL("./worker/transcribe.worker.ts", import.meta.url),
    { type: "module" },
  );

  return {
    transcribe(audioData: Float32Array): Promise<TranscribeResult> {
      return new Promise((resolve, reject) => {
        worker.onmessage = (e) => {
          if (e.data.type === "progress") onProgress(e.data.payload);
          else if (e.data.type === "result") resolve(e.data.payload);
          else if (e.data.type === "error") reject(new Error(e.data.payload));
        };
        worker.postMessage({ type: "transcribe", payload: audioData }, [
          audioData.buffer,
        ]);
      });
    },
    preload() {
      worker.postMessage({ type: "preload" });
    },
    terminate() {
      worker.terminate();
    },
  };
}

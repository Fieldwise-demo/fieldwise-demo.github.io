import { createSyntheticSnapshot } from "./synthetic.js";

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  const error = new Error("Snapshot request was cancelled");
  error.name = "AbortError";
  throw error;
}

export function createDemoProvider() {
  return {
    async loadSnapshot(request, { signal } = {}) {
      throwIfAborted(signal);
      const snapshot = createSyntheticSnapshot(request);
      throwIfAborted(signal);
      return snapshot;
    }
  };
}

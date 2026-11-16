import { normalizeSnapshot } from "../domain/snapshot.js";

export function createSnapshotLoader(provider) {
  if (!provider || typeof provider.loadSnapshot !== "function") {
    throw new TypeError("A data provider with loadSnapshot(request, options) is required");
  }

  let generation = 0;
  let activeController = null;
  return {
    async load(request) {
      const current = ++generation;
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;
      try {
        const result = await provider.loadSnapshot(request, { signal: controller.signal });
        const snapshot = normalizeSnapshot(result);
        if (current !== generation) return { status: "stale" };
        return { status: "success", snapshot };
      } catch (error) {
        if (current !== generation || controller.signal.aborted) return { status: "stale" };
        return { status: "error", error };
      } finally {
        if (current === generation) activeController = null;
      }
    },
    cancel() {
      generation += 1;
      activeController?.abort();
      activeController = null;
    }
  };
}

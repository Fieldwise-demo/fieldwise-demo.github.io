const DEFAULT_TIMEOUT_MS = 15000;

export function initializeContactForm(documentRef, { fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("Contact request timeout must be a positive finite number");
  }
  const dialog = documentRef.querySelector("#contact-dialog");
  const form = documentRef.querySelector("#contact-form");
  const status = documentRef.querySelector("#contact-status");
  const submit = documentRef.querySelector("#contact-submit");
  const controller = new AbortController();
  const { signal } = controller;
  let generation = 0;
  let activeRequest = null;
  let submitting = false;
  let disposed = false;

  function resetSubmit() {
    submitting = false;
    submit.disabled = false;
    submit.textContent = "Send inquiry";
  }

  function invalidateRequest() {
    generation += 1;
    if (activeRequest) {
      clearTimeout(activeRequest.timer);
      activeRequest.controller.abort();
      activeRequest = null;
    }
    resetSubmit();
  }

  documentRef.querySelector("#contact-open").addEventListener("click", () => {
    invalidateRequest();
    status.className = "form-status";
    status.textContent = "";
    if (!dialog.open) dialog.showModal();
  }, { signal });
  documentRef.querySelector("#contact-close").addEventListener("click", () => {
    invalidateRequest();
    dialog.close();
  }, { signal });
  documentRef.querySelector("#contact-cancel").addEventListener("click", () => {
    invalidateRequest();
    dialog.close();
  }, { signal });
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !dialog.open) return;
    event.preventDefault();
    invalidateRequest();
    dialog.close();
  }, { signal });
  dialog.addEventListener("cancel", invalidateRequest, { signal });
  dialog.addEventListener("close", () => {
    if (!dialog.open) invalidateRequest();
  }, { signal });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (disposed || submitting || !form.checkValidity()) {
      form.reportValidity();
      return;
    }

    submitting = true;
    const requestId = ++generation;
    const requestController = new AbortController();
    let timedOut = false;
    submit.disabled = true;
    submit.textContent = "Sending…";
    status.className = "form-status";
    status.textContent = "";

    const current = () => !disposed && generation === requestId && dialog.open;
    const fetchRequest = fetchImpl || ((...args) => documentRef.defaultView.fetch(...args));
    let timer;
    const timeoutRequest = new Promise((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        requestController.abort();
        reject(new Error("Contact request timed out"));
      }, timeoutMs);
    });
    const abortRequest = new Promise((_, reject) => {
      requestController.signal.addEventListener("abort", () => {
        reject(new Error("Contact request was cancelled"));
      }, { once: true });
    });
    activeRequest = { controller: requestController, timer };
    try {
      const response = await Promise.race([
        fetchRequest(form.action, {
          method: "POST",
          body: new documentRef.defaultView.FormData(form),
          headers: { Accept: "application/json" },
          signal: requestController.signal
        }),
        timeoutRequest,
        abortRequest
      ]);
      if (!response.ok) throw new Error("Submission failed");
      if (!current()) return;
      form.reset();
      status.className = "form-status success";
      status.textContent = "Thanks — your inquiry was sent successfully.";
    } catch {
      if (!current()) return;
      status.className = "form-status failure";
      status.textContent = timedOut
        ? "The request timed out. Please try again."
        : "We couldn’t send your inquiry. Please try again.";
    } finally {
      clearTimeout(timer);
      if (generation === requestId) {
        activeRequest = null;
        resetSubmit();
      }
    }
  }, { signal });

  return () => {
    if (disposed) return;
    disposed = true;
    invalidateRequest();
    controller.abort();
    if (dialog.open) dialog.close();
  };
}

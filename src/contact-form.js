export function initializeContactForm(documentRef) {
  const dialog = documentRef.querySelector("#contact-dialog");
  const form = documentRef.querySelector("#contact-form");
  const status = documentRef.querySelector("#contact-status");
  const submit = documentRef.querySelector("#contact-submit");
  let submitting = false;

  documentRef.querySelector("#contact-open").addEventListener("click", () => {
    status.className = "form-status";
    status.textContent = "";
    dialog.showModal();
  });
  documentRef.querySelector("#contact-close").addEventListener("click", () => dialog.close());
  documentRef.querySelector("#contact-cancel").addEventListener("click", () => dialog.close());
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting || !form.checkValidity()) {
      form.reportValidity();
      return;
    }
    submitting = true;
    submit.disabled = true;
    submit.textContent = "Sending…";
    status.className = "form-status";
    status.textContent = "";
    try {
      const response = await fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error("Submission failed");
      form.reset();
      status.className = "form-status success";
      status.textContent = "Thanks — your inquiry was sent successfully.";
    } catch {
      status.className = "form-status failure";
      status.textContent = "We couldn’t send your inquiry. Please try again.";
    } finally {
      submitting = false;
      submit.disabled = false;
      submit.textContent = "Send inquiry";
    }
  });
}

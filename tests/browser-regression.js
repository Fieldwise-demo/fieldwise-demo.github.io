import { initializeContactForm } from "../src/contact-form.js";
import { runReplayRegression } from "./replay-regression.mjs";

const results = document.querySelector("#test-results");
const summary = document.querySelector("#test-summary");
let assertions = 0;
let skipped = 0;

function assert(condition, message) {
  assertions += 1;
  const item = document.createElement("li");
  item.className = condition ? "passed" : "failed";
  item.textContent = `${condition ? "PASS" : "FAIL"} ${message}`;
  results.append(item);
  if (!condition) throw new Error(message);
}

function skip(message) {
  skipped += 1;
  const item = document.createElement("li");
  item.className = "skipped";
  item.textContent = `SKIP ${message}`;
  results.append(item);
}

function wait(milliseconds = 0) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(predicate, message, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await wait(20);
  }
  throw new Error(`Timed out: ${message}`);
}

function raiseInput(element, value, type = "input") {
  element.value = value;
  element.dispatchEvent(new Event(type, { bubbles: true }));
}

async function runContactLifecycleTests() {
  const fixture = document.createElement("section");
  fixture.id = "contact-test-fixture";
  fixture.innerHTML = `
    <button id="contact-open" type="button">Open contact form</button>
    <dialog id="contact-dialog">
      <form id="contact-form" action="/test-contact">
        <input id="contact-name" name="name" required>
        <input id="contact-email" name="email" type="email" required>
        <textarea id="contact-message" name="message" required></textarea>
        <div id="contact-status" role="status"></div>
        <button id="contact-close" type="button">Close</button>
        <button id="contact-cancel" type="button">Cancel</button>
        <button id="contact-submit" type="submit">Send inquiry</button>
      </form>
    </dialog>`;
  document.body.append(fixture);
  const dialog = fixture.querySelector("#contact-dialog");
  const form = fixture.querySelector("#contact-form");
  const status = fixture.querySelector("#contact-status");
  const openButton = fixture.querySelector("#contact-open");
  let fetchImpl;
  const dispose = initializeContactForm(document, {
    fetchImpl: (...args) => fetchImpl(...args),
    timeoutMs: 120
  });
  const setValidForm = () => {
    form.elements.namedItem("name").value = "Release test";
    form.elements.namedItem("email").value = "test@example.invalid";
    form.elements.namedItem("message").value = "Automated local browser test";
  };
  const submit = () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

  let resolveStale;
  let staleSignal;
  fetchImpl = (_url, options) => {
    staleSignal = options.signal;
    return new Promise((resolve) => { resolveStale = resolve; });
  };
  openButton.click();
  setValidForm();
  submit();
  await waitFor(() => Boolean(staleSignal), "contact request starts");
  const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  dialog.dispatchEvent(escape);
  assert(escape.defaultPrevented && staleSignal.aborted && !dialog.open,
    "Escape closes the dialog and aborts its pending request");
  openButton.click();
  resolveStale({ ok: true });
  await wait(0);
  assert(dialog.open && !status.textContent.includes("successfully") &&
    form.elements.namedItem("name").value === "Release test",
  "A stale response cannot update or reset a reopened form");
  fixture.querySelector("#contact-cancel").click();

  let timeoutSignal;
  fetchImpl = (_url, options) => {
    timeoutSignal = options.signal;
    return new Promise(() => {});
  };
  openButton.click();
  setValidForm();
  submit();
  await waitFor(() => status.textContent.includes("timed out"), "contact timeout is announced", 5000);
  assert(timeoutSignal.aborted, "Contact request timeout aborts the request");
  assert(!fixture.querySelector("#contact-submit").disabled,
    "Contact submit control is restored after timeout");
  dispose();
  openButton.click();
  assert(!dialog.open, "Disposed contact handlers no longer open the dialog");
  fixture.remove();
}

async function run() {
  const regression = await runReplayRegression();
  const repeatedRegression = await runReplayRegression();
  assert(regression.passed === repeatedRegression.passed &&
    regression.replayCases === repeatedRegression.replayCases &&
    regression.assertions === repeatedRegression.assertions &&
    regression.nonDomAssertions === repeatedRegression.nonDomAssertions &&
    regression.domAssertions === repeatedRegression.domAssertions,
  "Repeated replay suite invocations report stable assertion-category counts");
  assert(regression.passed,
    `Replay regression passed (${regression.replayCases} replay cases per invocation; two invocations)`);
  assert(regression.domAssertions > 0, `DOM regression assertions executed (${regression.domAssertions})`);

  const frame = document.querySelector("#app-frame");
  frame.style.width = "1440px";
  const loaded = new Promise((resolve, reject) => {
    frame.addEventListener("load", resolve, { once: true });
    frame.addEventListener("error", reject, { once: true });
  });
  frame.src = new URL("../index.html", location.href).href;
  await loaded;
  const appDocument = frame.contentDocument;
  const appWindow = frame.contentWindow;
  await waitFor(() => appDocument.querySelector("#page-title")?.textContent === "Overview" &&
    !appDocument.querySelector("#app").hasAttribute("aria-busy"), "application startup");
  assert(appDocument.title === "Fieldwise | Operations demo", "Application entry page loads");
  const appBase = new URL("../", location.href).href;
  const resources = appWindow.performance.getEntriesByType("resource").map((entry) => entry.name);
  assert(resources.some((resource) => resource === `${appBase}src/main.js`) &&
    resources.some((resource) => resource === `${appBase}styles.css`),
  "Module entry and stylesheet load from relative hosting paths");

  for (const width of [320, 390, 768, 1440]) {
    frame.style.width = `${width}px`;
    await waitFor(() => appWindow.matchMedia("(max-width: 760px)").matches === (width <= 760),
      `${width}px viewport resize`);
    await wait(50);
    for (const view of ["Overview", "Asset Detail", "Incidents", "Device Health", "Insights"]) {
      if (width <= 760 && !appDocument.querySelector("#sidebar").classList.contains("open")) {
        appDocument.querySelector("#mobile-menu").click();
      }
      appDocument.querySelector(`#nav button[data-view="${view}"]`).click();
      await waitFor(() => appDocument.querySelector("#page-title")?.textContent === view &&
        !appDocument.querySelector("#app").hasAttribute("aria-busy"), `${width}px ${view} rendering`);
      assert(appDocument.documentElement.scrollWidth <= appDocument.documentElement.clientWidth,
        `${width}px ${view} has no page-level horizontal overflow`);
      if (view === "Incidents") {
        const cards = appWindow.getComputedStyle(appDocument.querySelector(".incident-cards")).display !== "none";
        assert(cards === (width <= 760), `${width}px incidents use the responsive presentation`);
      }
    }
  }

  frame.style.width = "1440px";
  await waitFor(() => !appWindow.matchMedia("(max-width: 760px)").matches, "desktop layout restored");
  appDocument.querySelector("#nav button[data-view='Overview']").click();
  await waitFor(() => !appDocument.querySelector("#app").hasAttribute("aria-busy"), "overview ready");
  appDocument.querySelector("[data-unit='°F']").click();
  await waitFor(() => appDocument.querySelector(".stat-value")?.textContent.includes("°F"), "Fahrenheit display");
  assert(appDocument.querySelector(".stat-value").textContent === "37.0 °F",
    "Overview Fahrenheit conversion is preserved");
  appDocument.querySelector("#nav button[data-view='Insights']").click();
  await waitFor(() => appDocument.querySelector("#page-title")?.textContent === "Insights", "insights ready");
  assert([...appDocument.querySelectorAll(".insight")].some((item) => item.textContent.includes(" °F across")),
    "Insights temperature changes use the selected unit");
  appDocument.querySelector("#timezone").value = "UTC";
  appDocument.querySelector("#timezone").dispatchEvent(new Event("change", { bubbles: true }));
  await waitFor(() => appDocument.querySelector(".notice")?.textContent.includes("UTC"), "timezone change");
  assert(appDocument.querySelector(".notice").textContent.includes("UTC"),
    "Timezone control updates displayed timestamps");
  appDocument.querySelector("#scenario").value = "Building environment";
  appDocument.querySelector("#scenario").dispatchEvent(new Event("change", { bubbles: true }));
  await waitFor(() => !appDocument.querySelector("#app").hasAttribute("aria-busy") &&
    appDocument.querySelector(".notice")?.textContent.includes("Building environment"),
    "building environment scenario");
  assert(appDocument.querySelector(".notice").textContent.includes("Building environment"),
    "Scenario control updates the demo data");
  appDocument.querySelector("#nav button[data-view='Overview']").click();
  await waitFor(() => appDocument.querySelector(".card h3")?.textContent === "Main workspace",
    "building environment overview");
  appDocument.querySelector("#scenario").value = "Refrigeration";
  appDocument.querySelector("#scenario").dispatchEvent(new Event("change", { bubbles: true }));
  await waitFor(() => appDocument.querySelector(".card h3")?.textContent === "Walk-in cooler",
    "refrigeration scenario restored");

  appDocument.querySelector("#nav button[data-view='Incidents']").click();
  await waitFor(() => appDocument.querySelector("#incident-status"), "incident filter");
  const filter = appDocument.querySelector("#incident-status");
  raiseInput(filter, "Active", "change");
  await waitFor(() => appDocument.querySelectorAll(".incident-table tbody tr").length === 1,
    "active incident filter");
  assert(appDocument.querySelectorAll(".incident-table tbody tr.active").length === 1,
    "Active incident filter shows only the active incident");
  appDocument.querySelector("[data-unit='°C']").click();
  await waitFor(() => appDocument.querySelector("#incident-status")?.value === "Active",
    "incident filter state persistence");
  assert(appDocument.querySelector("#incident-status").value === "Active",
    "Incident filter selection persists after a rerender");

  frame.scrollIntoView({ block: "start" });
  frame.style.width = "390px";
  await waitFor(() => appWindow.matchMedia("(max-width: 760px)").matches, "mobile navigation viewport");
  await wait(50);
  const menu = appDocument.querySelector("#mobile-menu");
  if (!appDocument.querySelector("#sidebar").classList.contains("open")) {
    menu.focus();
    menu.click();
  }
  const navigation = appDocument.querySelector("#nav button[aria-current='page']");
  await waitFor(() => appDocument.activeElement === navigation, "focus enters the open navigation drawer");
  assert(appDocument.activeElement === navigation, "Opening navigation moves focus into the drawer");
  const firstControl = appDocument.querySelector("#nav button");
  firstControl.focus();
  const backwardTab = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
  appDocument.dispatchEvent(backwardTab);
  assert(backwardTab.defaultPrevented && appDocument.activeElement === menu,
    "Mobile navigation traps backward keyboard focus");
  const forwardTab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
  appDocument.dispatchEvent(forwardTab);
  assert(forwardTab.defaultPrevented && appDocument.activeElement === firstControl,
    "Mobile navigation traps forward keyboard focus");
  const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  appDocument.dispatchEvent(escape);
  assert(escape.defaultPrevented && !appDocument.querySelector("#sidebar").classList.contains("open") &&
    appDocument.activeElement === menu && appDocument.querySelector("#sidebar").inert,
  "Escape closes navigation, restores focus, and makes the drawer inert");

  const motionQuery = appWindow.matchMedia("(prefers-reduced-motion: reduce)");
  if (motionQuery.matches) {
    const sidebarStyle = appWindow.getComputedStyle(appDocument.querySelector("#sidebar"));
    const duration = Number.parseFloat(sidebarStyle.transitionDuration);
    assert(duration * 1000 <= 0.01 && sidebarStyle.transitionProperty === "none",
      "Reduced-motion preference disables drawer transitions");
  } else {
    skip("Reduced-motion preference is not emulated; rerun with browser reducedMotion=reduce");
  }

  await runContactLifecycleTests();
  assert(!appWindow.document.querySelector("#contact-dialog").open,
    "Main application contact dialog remains closed after isolated form tests");

  summary.className = "passed";
  summary.textContent = `PASS — ${assertions} browser interaction assertions; ${regression.nonDomAssertions * 2} non-DOM regression assertions across two runs; ${regression.domAssertions * 2} DOM regression assertions across two runs; ${skipped} skipped checks.`;
  document.documentElement.dataset.testResult = skipped ? "passed-with-skips" : "passed";
  document.documentElement.dataset.assertions = String(assertions + regression.assertions + repeatedRegression.assertions);
}

run().catch((error) => {
  const item = document.createElement("li");
  item.className = "failed";
  item.textContent = `FAIL ${error.stack || error.message}`;
  results.append(item);
  summary.className = "failed";
  summary.textContent = `FAIL — ${assertions} browser interaction assertions completed; ${skipped} skipped checks.`;
  document.documentElement.dataset.testResult = "failed";
  document.documentElement.dataset.assertions = String(assertions);
});

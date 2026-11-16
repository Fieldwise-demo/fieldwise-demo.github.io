import { createSnapshotLoader } from "./data/provider.js";
import { filterIncidents } from "./domain/incidents.js";
import { formatDateTime } from "./format/date-time.js";
import { escapeHtml } from "./views/html.js";
import { renderView } from "./views/render.js";
import { initializeContactForm } from "./contact-form.js";

const VIEWS = ["Overview", "Asset Detail", "Incidents", "Device Health", "Insights"];
const STAGES = { 24: "Normal operation", 38: "Temperature excursion", 48: "Recovery", 60: "Missing reports" };

function getStageName(stage) {
  return STAGES[stage] || (stage < 30 ? "Normal operation"
    : stage <= 42 ? "Temperature excursion"
      : stage <= 48 ? "Recovery" : "Missing reports");
}

function required(root, selector) {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`Required Fieldwise element is missing: ${selector}`);
  return element;
}

export function createAppController({ provider, documentRef = document, windowRef = window }) {
  const app = required(documentRef, "#app");
  const sidebar = required(documentRef, "#sidebar");
  const mobileMenu = required(documentRef, "#mobile-menu");
  const mobileBackdrop = required(documentRef, "#mobile-backdrop");
  const viewStatus = required(documentRef, "#view-status");
  const mobileLayout = windowRef.matchMedia("(max-width: 760px)");
  const snapshotLoader = createSnapshotLoader(provider);
  const state = {
    view: "Overview",
    scenario: required(documentRef, "#scenario").value,
    stage: Number(required(documentRef, "#stage").value),
    unit: "°C",
    timezone: required(documentRef, "#timezone").value,
    asset: "demo-1",
    incidentStatus: "All"
  };
  let currentSnapshot = null;
  let navigationReturnFocus = mobileMenu;
  let started = false;

  function syncNavigation() {
    const open = mobileLayout.matches && sidebar.classList.contains("open");
    sidebar.inert = mobileLayout.matches && !open;
    required(documentRef, "#main-content").inert = open;
    documentRef.body.classList.toggle("navigation-open", open);
    mobileBackdrop.hidden = !open;
  }

  function setNavigationOpen(open, restoreFocus = true) {
    open = open && mobileLayout.matches;
    sidebar.classList.toggle("open", open);
    mobileMenu.setAttribute("aria-expanded", String(open));
    mobileMenu.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    mobileBackdrop.hidden = !open;
    syncNavigation();
    if (open) {
      navigationReturnFocus = documentRef.activeElement || mobileMenu;
      documentRef.querySelector("#nav [aria-current='page']")?.focus();
    } else if (restoreFocus && navigationReturnFocus?.focus) {
      navigationReturnFocus.focus();
    }
  }

  function closeNavigation() {
    if (sidebar.classList.contains("open")) setNavigationOpen(false);
  }

  async function render(focusHeading = false) {
    const focusedId = app.contains(documentRef.activeElement) ? documentRef.activeElement.id : null;
    const stageName = getStageName(state.stage);
    required(documentRef, "#stage-name").textContent = stageName;
    required(documentRef, "#stage").setAttribute("aria-valuetext", stageName);
    documentRef.querySelectorAll("[data-unit]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.unit === state.unit));
    });
    documentRef.querySelectorAll("#nav button").forEach((button) => {
      const active = button.dataset.view === state.view;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });

    app.setAttribute("aria-busy", "true");
    if (!currentSnapshot) app.innerHTML = '<p class="caption" role="status">Loading demonstration data…</p>';
    const result = await snapshotLoader.load({ scenario: state.scenario, stage: state.stage });
    if (result.status === "stale") return;
    app.removeAttribute("aria-busy");
    if (result.status === "error") {
      currentSnapshot = null;
      app.innerHTML = '<div class="warning" role="alert">Monitoring data is unavailable.</div><button class="secondary-button" id="retry-load" type="button">Try again</button>';
      viewStatus.textContent = "Monitoring data is unavailable.";
      return;
    }

    const snapshot = result.snapshot;
    currentSnapshot = snapshot;
    const stageNotice = snapshot.source === "simulated"
      ? "Demonstration using simulated data.</strong> · " + escapeHtml(snapshot.scenario) +
        " · " + stageName + " · Scenario clock: " + formatDateTime(snapshot.asOf, state.timezone) +
        ". These are illustrative readings, not live measurements."
      : "Data supplied by the configured provider.</strong> · Data as of: " + formatDateTime(snapshot.asOf, state.timezone);
    app.innerHTML = '<div class="demo-tag">OPERATIONS WORKSPACE</div><h1 id="page-title" tabindex="-1">' +
      state.view + '</h1><p class="subtitle">Know what needs attention. Keep your operation moving.</p><div class="notice"><strong>' +
      stageNotice + '</div>' + renderView(snapshot, state);
    viewStatus.textContent = state.view + ". " + snapshot.scenario + ". " + stageName +
      (state.view === "Incidents" ? ". " + filterIncidents(snapshot.incidents, state.incidentStatus).length + " matching incidents." : ".");
    const incidentFilter = documentRef.querySelector("#incident-status");
    if (incidentFilter) incidentFilter.value = state.incidentStatus;
    if (focusHeading) documentRef.querySelector("#page-title")?.focus();
    else if (focusedId) documentRef.getElementById(focusedId)?.focus();
  }

  function start() {
    if (started) return;
    started = true;
    VIEWS.forEach((view) => {
      const button = documentRef.createElement("button");
      button.dataset.view = view;
      button.textContent = view;
      button.setAttribute("aria-current", "false");
      button.addEventListener("click", () => {
        state.view = view;
        closeNavigation();
        render(true);
      });
      required(documentRef, "#nav").append(button);
    });
    required(documentRef, "#scenario").addEventListener("change", (event) => {
      state.scenario = event.target.value;
      state.asset = "demo-1";
      render();
    });
    required(documentRef, "#stage").addEventListener("input", (event) => {
      state.stage = Number(event.target.value);
      render();
    });
    required(documentRef, "#timezone").addEventListener("change", (event) => {
      state.timezone = event.target.value;
      render();
    });
    documentRef.querySelectorAll("[data-unit]").forEach((button) => button.addEventListener("click", () => {
      state.unit = button.dataset.unit;
      documentRef.querySelectorAll("[data-unit]").forEach((item) => item.classList.toggle("active", item === button));
      render();
    }));
    app.addEventListener("change", (event) => {
      if (event.target.id === "asset-select") {
        state.asset = event.target.value;
        render();
      } else if (event.target.id === "incident-status") {
        state.incidentStatus = event.target.value;
        render();
      }
    });
    app.addEventListener("click", (event) => {
      if (event.target.closest("#retry-load")) render();
    });
    mobileMenu.addEventListener("click", () => setNavigationOpen(!sidebar.classList.contains("open")));
    mobileBackdrop.addEventListener("click", closeNavigation);
    documentRef.addEventListener("keydown", (event) => {
      if (!mobileLayout.matches || !sidebar.classList.contains("open")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeNavigation();
      }
      if (event.key === "Tab") {
        const controls = [...sidebar.querySelectorAll("button, select, input"), mobileMenu];
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && documentRef.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && documentRef.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
    mobileLayout.addEventListener("change", () => {
      const focusWasInSidebar = sidebar.contains(documentRef.activeElement);
      setNavigationOpen(false, false);
      if (mobileLayout.matches && focusWasInSidebar) mobileMenu.focus();
      else if (!mobileLayout.matches && documentRef.activeElement === mobileMenu) {
        documentRef.querySelector("#nav [aria-current='page']")?.focus();
      }
    });
    syncNavigation();
    initializeContactForm(documentRef);
    render();
  }

  return { start, render, state, dispose: () => snapshotLoader.cancel() };
}

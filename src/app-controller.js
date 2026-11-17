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
  let listenerController = null;
  let contactFormDispose = null;
  let navigationButtons = [];
  let navigationFocusTimer = null;
  let navigationFocusListener = null;

  function syncNavigation() {
    const open = mobileLayout.matches && sidebar.classList.contains("open");
    sidebar.inert = mobileLayout.matches && !open;
    required(documentRef, "#main-content").inert = open;
    documentRef.body.classList.toggle("navigation-open", open);
    mobileBackdrop.hidden = !open;
  }

  function cancelPendingNavigationFocus() {
    if (navigationFocusTimer !== null) {
      clearTimeout(navigationFocusTimer);
      navigationFocusTimer = null;
    }
    if (navigationFocusListener) {
      sidebar.removeEventListener("transitionend", navigationFocusListener);
      navigationFocusListener = null;
    }
  }

  function focusNavigationItem() {
    cancelPendingNavigationFocus();
    if (mobileLayout.matches && sidebar.classList.contains("open")) {
      documentRef.querySelector("#nav [aria-current='page']")?.focus();
    }
  }

  function scheduleNavigationFocus() {
    cancelPendingNavigationFocus();
    const duration = windowRef.getComputedStyle?.(sidebar).transitionDuration || "0s";
    const durationMs = duration.split(",").reduce((maximum, value) => {
      const time = Number.parseFloat(value);
      const milliseconds = value.trim().endsWith("ms") ? time : time * 1000;
      return Number.isFinite(milliseconds) ? Math.max(maximum, milliseconds) : maximum;
    }, 0);
    if (durationMs <= 0) {
      focusNavigationItem();
      return;
    }
    navigationFocusListener = (event) => {
      if (event.target === sidebar && event.propertyName === "transform") focusNavigationItem();
    };
    sidebar.addEventListener("transitionend", navigationFocusListener);
    navigationFocusTimer = setTimeout(focusNavigationItem, durationMs + 50);
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
      scheduleNavigationFocus();
    } else {
      cancelPendingNavigationFocus();
      if (restoreFocus && navigationReturnFocus?.focus) navigationReturnFocus.focus();
    }
  }

  function closeNavigation() {
    if (sidebar.classList.contains("open")) setNavigationOpen(false);
  }

  function showUnavailable() {
    currentSnapshot = null;
    app.removeAttribute("aria-busy");
    app.innerHTML = '<div class="warning" role="alert">Monitoring data is unavailable.</div><button class="secondary-button" id="retry-load" type="button">Try again</button>';
    viewStatus.textContent = "Monitoring data is unavailable.";
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
      showUnavailable();
      return;
    }

    const snapshot = result.snapshot;
    try {
      const stageNotice = snapshot.source === "simulated"
        ? "Demonstration using simulated data.</strong> · " + escapeHtml(snapshot.scenario) +
          " · " + stageName + " · Scenario clock: " + formatDateTime(snapshot.asOf, state.timezone) +
          ". These are illustrative readings, not live measurements."
        : "Data supplied by the configured provider.</strong> · Data as of: " + formatDateTime(snapshot.asOf, state.timezone);
      const markup = '<div class="demo-tag">OPERATIONS WORKSPACE</div><h1 id="page-title" tabindex="-1">' +
        state.view + '</h1><p class="subtitle">Know what needs attention. Keep your operation moving.</p><div class="notice"><strong>' +
        stageNotice + '</div>' + renderView(snapshot, state);
      app.innerHTML = markup;
      currentSnapshot = snapshot;
      viewStatus.textContent = state.view + ". " + snapshot.scenario + ". " + stageName +
        (state.view === "Incidents" ? ". " + filterIncidents(snapshot.incidents, state.incidentStatus).length + " matching incidents." : ".");
      const incidentFilter = documentRef.querySelector("#incident-status");
      if (incidentFilter) incidentFilter.value = state.incidentStatus;
      if (focusHeading) documentRef.querySelector("#page-title")?.focus();
      else if (focusedId) documentRef.getElementById(focusedId)?.focus();
    } catch (error) {
      documentRef.defaultView?.console?.error("Fieldwise view rendering failed", error);
      showUnavailable();
    }
  }

  function start() {
    if (started) return;
    started = true;
    listenerController = new AbortController();
    const { signal } = listenerController;
    const listen = (target, type, listener) => target.addEventListener(type, listener, { signal });
    VIEWS.forEach((view) => {
      const button = documentRef.createElement("button");
      button.dataset.view = view;
      button.textContent = view;
      button.setAttribute("aria-current", "false");
      listen(button, "click", () => {
        state.view = view;
        closeNavigation();
        render(true);
      });
      required(documentRef, "#nav").append(button);
      navigationButtons.push(button);
    });
    listen(required(documentRef, "#scenario"), "change", (event) => {
      state.scenario = event.target.value;
      state.asset = "demo-1";
      render();
    });
    listen(required(documentRef, "#stage"), "input", (event) => {
      state.stage = Number(event.target.value);
      render();
    });
    listen(required(documentRef, "#timezone"), "change", (event) => {
      state.timezone = event.target.value;
      render();
    });
    documentRef.querySelectorAll("[data-unit]").forEach((button) => listen(button, "click", () => {
      state.unit = button.dataset.unit;
      documentRef.querySelectorAll("[data-unit]").forEach((item) => item.classList.toggle("active", item === button));
      render();
    }));
    listen(app, "change", (event) => {
      if (event.target.id === "asset-select") {
        state.asset = event.target.value;
        render();
      } else if (event.target.id === "incident-status") {
        state.incidentStatus = event.target.value;
        render();
      }
    });
    listen(app, "click", (event) => {
      if (event.target.closest("#retry-load")) render();
    });
    listen(mobileMenu, "click", () => setNavigationOpen(!sidebar.classList.contains("open")));
    listen(mobileBackdrop, "click", closeNavigation);
    listen(documentRef, "keydown", (event) => {
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
    listen(mobileLayout, "change", () => {
      const focusWasInSidebar = sidebar.contains(documentRef.activeElement);
      setNavigationOpen(false, false);
      if (mobileLayout.matches && focusWasInSidebar) mobileMenu.focus();
      else if (!mobileLayout.matches && documentRef.activeElement === mobileMenu) {
        documentRef.querySelector("#nav [aria-current='page']")?.focus();
      }
    });
    syncNavigation();
    contactFormDispose = initializeContactForm(documentRef);
    render();
  }

  function dispose() {
    if (!started) return;
    snapshotLoader.cancel();
    cancelPendingNavigationFocus();
    listenerController.abort();
    listenerController = null;
    contactFormDispose?.();
    contactFormDispose = null;
    navigationButtons.forEach((button) => button.remove());
    navigationButtons = [];
    sidebar.classList.remove("open");
    sidebar.inert = false;
    required(documentRef, "#main-content").inert = false;
    documentRef.body.classList.remove("navigation-open");
    mobileBackdrop.hidden = true;
    mobileMenu.setAttribute("aria-expanded", "false");
    mobileMenu.setAttribute("aria-label", "Open navigation");
    app.removeAttribute("aria-busy");
    started = false;
  }

  return { start, render, state, dispose };
}

import { createDemoProvider } from "./src/data/demo-provider.js";
import { createSnapshotLoader } from "./src/data/provider.js";
import { filterIncidents, getFreshness, latestMeasurement } from "./src/domain/incidents.js";
import { formatDateTime, formatShortTime } from "./src/format/date-time.js";
import { convertTemperature, formatTemperature } from "./src/format/temperature.js";
import { escapeHtml } from "./src/views/html.js";

const STAGES = { 24: "Normal operation", 38: "Temperature excursion", 48: "Recovery", 60: "Missing reports" };
const VIEWS = ["Overview", "Asset Detail", "Incidents", "Device Health", "Insights"];
const state = { view: "Overview", scenario: "Refrigeration", stage: 60, unit: "°C", timezone: "America/New_York", asset: "demo-1", incidentStatus: "All" };
const app = document.querySelector("#app");
const $ = (selector) => document.querySelector(selector);
const sidebar = $("#sidebar");
const mobileMenu = $("#mobile-menu");
const mobileBackdrop = $("#mobile-backdrop");
let navigationReturnFocus = mobileMenu;
const mobileLayout = window.matchMedia("(max-width: 760px)");
const snapshotLoader = createSnapshotLoader(createDemoProvider());
let currentSnapshot = null;

function syncNavigation() {
    const open = mobileLayout.matches && sidebar.classList.contains("open");
    sidebar.inert = mobileLayout.matches && !open;
    $("#main-content").inert = open;
    document.body.classList.toggle("navigation-open", open);
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
      navigationReturnFocus = document.activeElement || mobileMenu;
      $("#nav [aria-current='page']")?.focus();
    } else if (restoreFocus && navigationReturnFocus?.focus) {
      navigationReturnFocus.focus();
    }
}

function closeNavigation() {
  if (sidebar.classList.contains("open")) setNavigationOpen(false);
}

const escape = escapeHtml;
function toTemp(value) { return convertTemperature(value, state.unit); }
function tempText(value) { return formatTemperature(value, state.unit); }
function timeText(value) { return formatDateTime(value, state.timezone); }
function shortTime(value) { return formatShortTime(value, state.timezone); }
function thresholdRange(range, formatValue) {
  if (range.min == null && range.max == null) return "Not provided";
  if (range.min == null) return "Minimum not provided; maximum " + formatValue(range.max);
  if (range.max == null) return "Minimum " + formatValue(range.min) + "; maximum not provided";
  return formatValue(range.min) + "–" + formatValue(range.max);
}
function connectivityLabel(status) {
  return status === "connected" ? "Connected" : status === "disconnected" ? "Disconnected" : "Unverified";
}
function rows(data, assetId) { return data.measurements.filter((row) => row.assetId === assetId); }
function latest(data, assetId) { return latestMeasurement(data.measurements, assetId); }
function freshness(row, data, asset) {
  const result = getFreshness(row, data.asOf, asset.expectedIntervalSeconds);
  return result.status === "recent" ? "Recent telemetry"
    : result.status === "stale" ? "Stale telemetry"
      : result.status === "unknown" ? "Freshness unknown" : "No reports";
}
function incidents(data, status = "All", assetId = null) {
  return filterIncidents(data.incidents, status, assetId);
}
function metric(label, value) {
    return '<div class="metric"><div class="metric-label">' + label + '</div><div class="metric-value">' + value + '</div></div>';
}
function chart(dataRows, asset, kind) {
    const isTemperature = kind === "temperature";
    const values = dataRows.map((row) => isTemperature ? toTemp(row.temperatureC) : row.humidityPercent);
    const bounds = isTemperature ? asset.thresholds.temperatureC : asset.thresholds.humidityPercent;
    const lower = bounds.min == null ? null : isTemperature ? toTemp(bounds.min) : bounds.min;
    const upper = bounds.max == null ? null : isTemperature ? toTemp(bounds.max) : bounds.max;
    const all = values.concat([lower, upper].filter((value) => value != null));
    if (!all.length) all.push(0, 1);
    let min = Math.min(...all), max = Math.max(...all), span = max - min || (isTemperature ? 2 : 10);
    const padding = Math.max(span * 0.12, (isTemperature ? 2 : 10) * 0.05);
    min -= padding; max += padding;
    const width = 900, height = 290, plot = { left: 56, right: 24, top: 24, bottom: 38 };
    const plotWidth = width - plot.left - plot.right, plotHeight = height - plot.top - plot.bottom;
    const x = (index) => plot.left + (dataRows.length < 2 ? plotWidth / 2 : index * plotWidth / (dataRows.length - 1));
    const y = (value) => plot.top + (max - value) * plotHeight / (max - min);
    let grid = "", labels = "";
    for (let tick = 0; tick <= 5; tick += 1) {
      const value = min + (max - min) * tick / 5;
      grid += '<line class="grid-line" x1="' + plot.left + '" x2="' + (width - plot.right) + '" y1="' + y(value) + '" y2="' + y(value) + '"></line>';
      labels += '<text class="axis-label" x="' + (plot.left - 8) + '" y="' + (y(value) + 4) + '" text-anchor="end">' + value.toFixed(1) + '</text>';
    }
    const points = dataRows.map((row, index) => [x(index), y(isTemperature ? toTemp(row.temperatureC) : row.humidityPercent)]);
    const path = points.map(([px, py], index) => (index ? "L" : "M") + px.toFixed(1) + " " + py.toFixed(1)).join(" ");
    const markers = dataRows.map((row, index) => {
      const value = isTemperature ? toTemp(row.temperatureC) : row.humidityPercent;
      const outside = (lower != null && value < lower) || (upper != null && value > upper);
      const cls = outside ? "excursion-dot" : "measurement-dot";
      return '<circle class="' + cls + '" cx="' + x(index) + '" cy="' + y(value) + '" r="' + (outside ? 4 : 2.7) + '"><title>' +
        shortTime(row.receivedAt) + " · " + value.toFixed(1) + (isTemperature ? " " + state.unit : " %") +
        (outside ? " · Outside operating range" : "") + "</title></circle>";
    }).join("");
    const step = Math.max(1, Math.ceil(dataRows.length / 7));
    for (let index = 0; index < dataRows.length; index += step) labels += '<text class="axis-label" x="' + x(index) + '" y="' + (height - 10) + '" text-anchor="middle">' + shortTime(dataRows[index].receivedAt) + "</text>";
    if (dataRows.length) labels += '<text class="axis-label" x="' + x(dataRows.length - 1) + '" y="' + (height - 10) + '" text-anchor="middle">' + shortTime(dataRows.at(-1).receivedAt) + "</text>";
    const thresholdLines = [lower, upper].map((value, index) => {
      if (value == null) return "";
      const label = index === 0 ? "Lower operating threshold" : "Upper operating threshold";
      return '<line class="threshold-line" x1="' + plot.left + '" x2="' + (width - plot.right) + '" y1="' + y(value) + '" y2="' + y(value) + '"></line><text class="threshold-label" x="' + (plot.left + 8) + '" y="' + (y(value) - 7) + '">' + label + "</text>";
    }).join("");
    const axis = isTemperature ? state.unit : "%";
    return '<svg viewBox="0 0 ' + width + " " + height + '" role="img" aria-label="' + (isTemperature ? "Temperature chart" : "Humidity chart") + '">' +
      grid + (isTemperature ? thresholdLines : "") + '<path class="measurement-line" stroke="' + (isTemperature ? "#17645e" : "#245b9b") + '" d="' + path + '"></path>' +
      markers + labels + '<text class="axis-title" x="14" y="' + (plot.top + plotHeight / 2) + '" transform="rotate(-90 14 ' + (plot.top + plotHeight / 2) + ')">' + axis + '</text><text class="axis-title" x="' + (width / 2) + '" y="' + (height - 1) + '" text-anchor="middle">Receipt time</text></svg>';
  }
  function assetCard(data, asset) {
    const row = latest(data, asset.id), active = incidents(data, "Active", asset.id), status = freshness(row, data, asset);
    return '<article class="card ' + (active.length ? "active" : status === "Stale telemetry" ? "stale" : "") + '"><div class="card-head"><h3>' +
        escape(asset.name) + '</h3>' + (active.length ? '<span class="status">Active attention</span>' : status === "Stale telemetry" ? '<span class="status stale">Stale reporting</span>' : "") +
        '</div><p class="meta">' + escape(asset.site) + '</p>' + (active.length ? '<p class="caption">' + active.length + " incident(s) affecting this asset</p>" : status === "Stale telemetry" ? '<p class="caption">No recent report within the expected window</p>' : "") +
        '<div class="stats"><div><div class="stat-label">Last temperature</div><div class="stat-value">' + tempText(row?.temperatureC) + '</div></div><div><div class="stat-label">Last humidity</div><div class="stat-value">' +
        (row ? row.humidityPercent.toFixed(1) + " %" : "—") + '</div></div><div><div class="stat-label">Active incidents</div><div class="stat-value">' + active.length +
        '</div></div></div><p class="caption"><strong>' + status + '</strong> · reporting freshness<br>Last receipt: ' + (row ? timeText(row.receivedAt) : "Unknown") + ' · Connectivity ' + connectivityLabel(asset.connectivity.status) + '</p></article>';
  }
  function incidentCard(data, item) {
      const asset = data.assets.find((candidate) => candidate.id === item.assetId);
    const isTemp = item.field === "temperature";
      return '<article class="incident-card ' + item.status + '"><div class="incident-card-head"><strong>' + escape(item.id) + '</strong><span class="badge ' + item.status + '">' + item.status + '</span></div>' +
        '<dl><div><dt>Asset</dt><dd>' + escape(asset.name) + '</dd></div><div><dt>Severity</dt><dd>' + escape(item.severity) + '</dd></div><div><dt>Measurement</dt><dd>' + (isTemp ? "Temperature" : "Relative humidity") + '</dd></div><div><dt>Latest value</dt><dd>' + (isTemp ? tempText(item.value) : item.value.toFixed(2) + " %") + '</dd></div><div><dt>Condition</dt><dd>' + escape(item.condition) + '</dd></div><div><dt>Threshold</dt><dd>' + (isTemp ? tempText(item.threshold) : item.threshold.toFixed(2) + " %") + '</dd></div><div><dt>Occurrences</dt><dd>' + item.count + '</dd></div><div><dt>First detected</dt><dd>' + timeText(item.firstReceivedAt) + '</dd></div><div><dt>Resolved</dt><dd>' + (item.resolvedAt ? timeText(item.resolvedAt) : "Open") + '</dd></div></dl></article>';
  }
  function incidentTable(data, list) {
    if (!list.length) return '<div class="card empty">No incidents match this selection.</div>';
    return '<div class="table-wrap incident-table"><table><thead><tr><th>Incident</th><th>Asset</th><th>Status</th><th>Severity</th><th>Measurement</th><th>Condition</th><th>Last value</th><th>Threshold</th><th>Occurrences</th><th>First detected</th><th>Resolved</th></tr></thead><tbody>' +
      list.map((item) => { const asset = data.assets.find((a) => a.id === item.assetId), isTemp = item.field === "temperature"; return '<tr class="' + item.status + '"><td>' + escape(item.id) + '</td><td>' +
        escape(asset.name) + '</td><td><span class="badge ' + item.status + '">' + item.status + '</span></td><td>' + escape(item.severity) + '</td><td>' + (isTemp ? "Temperature" : "Relative humidity") +
        '</td><td>' + escape(item.condition) + '</td><td>' + (isTemp ? tempText(item.value) : item.value.toFixed(2) + " %") + '</td><td>' + (isTemp ? tempText(item.threshold) : item.threshold.toFixed(2) + " %") +
        '</td><td>' + item.count + '</td><td>' + timeText(item.firstReceivedAt) + '</td><td>' + (item.resolvedAt ? timeText(item.resolvedAt) : "Open") + "</td></tr>"; }).join("") +
      '</tbody></table></div><div class="incident-cards">' + list.map((item) => incidentCard(data, item)).join("") + '</div><p class="caption">Each incident groups repeated violations of one asset, measurement, and condition. Missing reports do not resolve incidents.</p>';
  }
  function overview(data) {
    const active = incidents(data, "Active"), resolved = incidents(data, "Resolved");
    const names = active.map((item) => data.assets.find((asset) => asset.id === item.assetId).name).join(", ");
    return '<h2>Your operation at a glance</h2><div class="metrics">' + metric("Monitored assets", data.assets.length) + metric("Locations", new Set(data.assets.map((a) => a.site)).size) +
      metric("Active incidents", active.length) + metric("Resolved incidents", resolved.length) + '</div><h2>Attention & next steps</h2>' +
      (active.length ? '<div class="alert">' + active.length + " active threshold incident(s) need review · affected assets: " + escape(names) + '</div>' : '<div class="success">No active threshold incidents at this replay stage.</div>') +
      '<p class="caption">Operating settings are illustrative. Refrigeration settings do not establish food-safety compliance.</p><div class="cards">' +
      data.assets.map((asset) => assetCard(data, asset)).join("") + "</div>";
  }
  function assetDetail(data) {
    if (!data.assets.length) return '<div class="card empty">No assets are available for this view.</div>';
    const asset = data.assets.find((item) => item.id === state.asset) || data.assets[0]; state.asset = asset.id;
    const dataRows = rows(data, asset.id);
    return '<div class="toolbar"><label>Asset<select id="asset-select">' + data.assets.map((item) => '<option value="' + escape(item.id) + '" ' + (item.id === asset.id ? "selected" : "") + '>' + escape(item.name) + "</option>").join("") +
      '</select></label></div><h2>' + escape(asset.name) + '</h2><p class="caption">' + escape(asset.site) + " · " + escape(asset.equipment) + " · " + escape(asset.id) + '</p><p class="caption">Illustrative temperature range: ' +
      thresholdRange(asset.thresholds.temperatureC, tempText) + ' · Humidity range: ' + thresholdRange(asset.thresholds.humidityPercent, (value) => value + " %") + '.</p><p class="caption">Charts use platform receipt time. Lines connect sampled reports; they do not establish continuous exposure.</p>' +
      '<h2>Temperature & operating range</h2><div class="chart-card"><div class="legend"><span><i class="swatch" style="background:#17645e"></i>Temperature</span><span><i class="swatch threshold-swatch"></i>Operating thresholds</span><span><i class="swatch dot-swatch"></i>Outside range</span></div>' +
      chart(dataRows, asset, "temperature") + '</div><h2>Relative humidity</h2><div class="chart-card"><div class="legend"><span><i class="swatch" style="background:#245b9b"></i>Humidity</span><span><i class="swatch dot-swatch"></i>Outside range</span></div>' +
      chart(dataRows, asset, "humidity") + '</div><h2>Recent incidents</h2>' + incidentTable(data, incidents(data, "All", asset.id));
  }
  function incidentView(data) {
    const active = incidents(data, "Active"), resolved = incidents(data, "Resolved");
    return '<h2>Review operating exceptions</h2><p class="caption">Active incidents are still being observed; resolved incidents retain their complete lifecycle for review.</p><div class="toolbar"><label>Incident status<select id="incident-status"><option>All</option><option>Active</option><option>Resolved</option></select></label></div>' +
      (active.length ? '<div class="alert">ACTIVE · ' + active.length + " incident(s) · " + [...new Set(active.map((i) => data.assets.find((a) => a.id === i.assetId).name))].map(escape).join(", ") + "</div>" : "") +
      (resolved.length ? '<div class="success">RESOLVED · ' + resolved.length + " incident(s) retained for lifecycle review</div>" : "") + incidentTable(data, incidents(data, state.incidentStatus));
  }
  function health(data) {
    const items = data.assets.map((asset) => {
      const row = latest(data, asset.id);
      const fresh = getFreshness(row, data.asOf, asset.expectedIntervalSeconds);
      return {
        asset, row,
        status: fresh.status === "recent" ? "Recent telemetry"
          : fresh.status === "stale" ? "Stale telemetry"
            : fresh.status === "unknown" ? "Freshness unknown" : "No reports",
        age: fresh.ageSeconds == null ? null : Math.floor(fresh.ageSeconds / 60)
      };
    });
    const stale = items.filter((item) => item.status === "Stale telemetry");
    const unclassified = items.filter((item) => item.status === "Freshness unknown" || item.status === "No reports");
    return '<h2>Reporting freshness</h2><p class="caption">Freshness reflects receipt activity and is classified only when an expected reporting interval is provided. Connectivity is displayed separately from freshness.</p>' +
      (stale.length ? '<div class="warning">STALE REPORTING · ' + stale.length + " affected asset(s): " + stale.map((item) => escape(item.asset.name)).join(", ") + '</div>' :
        !items.length ? '<div class="notice">No assets are available for this view.</div>' :
          unclassified.length ? '<div class="notice">FRESHNESS UNKNOWN · ' + unclassified.length + " asset(s) lack enough reporting data for classification.</div>" :
          '<div class="success">All assets are reporting within the expected freshness window.</div>') +
      '<div class="table-wrap"><table><thead><tr><th>Asset</th><th>Reporting</th><th>Last receipt</th><th>Receipt age</th><th>Expected interval</th><th>Connectivity</th><th>Timestamp quality</th><th>Measurement quality</th></tr></thead><tbody>' +
      items.map((item) => '<tr class="' + (item.status === "Stale telemetry" ? "active" : "") + '"><td>' + escape(item.asset.name) + '</td><td>' + item.status + '</td><td>' +
        (item.row ? timeText(item.row.receivedAt) : "Unknown") + '</td><td>' + (item.age == null ? "—" : item.age + " min") + '</td><td>' + (item.asset.expectedIntervalSeconds == null ? "Unknown" : item.asset.expectedIntervalSeconds / 60 + ' min') + '</td><td>' + connectivityLabel(item.asset.connectivity.status) + '</td><td>' +
        (item.row?.timestampQuality === "unknown" ? "Unknown" : item.row ? "Synchronized" : "Unknown") + '</td><td>' + escape(item.row?.measurementQuality ?? "Unknown") + '</td></tr>').join("") + '</tbody></table></div><p class="caption">Quality flags are synthetic source metadata, not independent diagnostic validation.</p>';
  }
  function insights(data) {
    const items = [];
    data.assets.forEach((asset) => {
      const dataRows = rows(data, asset.id), row = dataRows.at(-1), status = freshness(row, data, asset);
      if (status !== "Recent telemetry") items.push([0, asset.name + ": " + status.toLowerCase() + " — review the reporting path before relying on the latest reading."]);
      incidents(data, "All", asset.id).forEach((item) => items.push([item.status === "active" ? 0 : 1, asset.name + ": " + item.status + " " + item.field + " excursion, " + item.count + " violating reports spanning " + Math.floor((item.lastReceivedAt - item.firstReceivedAt) / 60000) + " minutes. This is a sampled span, not continuous exposure duration."]));
      if (dataRows.length > 1) items.push([2, asset.name + ": temperature changed " + (dataRows.at(-1).temperatureC - dataRows[0].temperatureC).toFixed(2) + " °C across " + Math.floor((dataRows.at(-1).receivedAt - dataRows[0].receivedAt) / 60000) + " minutes of received reports."]);
    });
    items.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
    return '<h2>Observations you can act on</h2><p class="caption">Illustrative insights from synthetic reports. Freshness reflects receipt activity; connectivity remains unverified. These are descriptive observations, not predictions or validated diagnoses.</p>' +
      items.map((item) => '<div class="card insight"><strong>' + (item[0] === 0 ? "Action needed · " : item[0] === 1 ? "Review · " : "") + "</strong>" + escape(item[1]) + "</div>").join("") +
      '<div class="notice">Suggested review: inspect active excursions and stale reporting before making operational decisions.</div>';
  }
async function render(focusHeading = false) {
    const focusedId = app.contains(document.activeElement) ? document.activeElement.id : null;
    const stageName = STAGES[state.stage] || (state.stage < 30 ? "Normal operation" : state.stage <= 42 ? "Temperature excursion" : state.stage <= 48 ? "Recovery" : "Missing reports");
    $("#stage-name").textContent = stageName;
    $("#stage").setAttribute("aria-valuetext", stageName);
    document.querySelectorAll("[data-unit]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.unit === state.unit)));
    document.querySelectorAll("#nav button").forEach((button) => {
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
      $("#view-status").textContent = "Monitoring data is unavailable.";
      $("#retry-load").addEventListener("click", () => render());
      return;
    }
    const data = result.snapshot;
    currentSnapshot = data;
    const body = state.view === "Overview" ? overview(data) : state.view === "Asset Detail" ? assetDetail(data) : state.view === "Incidents" ? incidentView(data) : state.view === "Device Health" ? health(data) : insights(data);
    const simulated = data.source === "simulated";
    const notice = simulated
      ? "Demonstration using simulated data.</strong> · " + escape(data.scenario) + " · " + stageName + " · Scenario clock: " + timeText(data.asOf) + ". These are illustrative readings, not live measurements."
      : "Data supplied by the configured provider.</strong> · Data as of: " + timeText(data.asOf);
    app.innerHTML = '<div class="demo-tag">OPERATIONS WORKSPACE</div><h1 id="page-title" tabindex="-1">' + state.view + '</h1><p class="subtitle">Know what needs attention. Keep your operation moving.</p><div class="notice"><strong>' + notice + '</div>' + body;
    $("#view-status").textContent = state.view + ". " + data.scenario + ". " + stageName + (state.view === "Incidents" ? ". " + incidents(data, state.incidentStatus).length + " matching incidents." : ".");
    $("#asset-select")?.addEventListener("change", (event) => { state.asset = event.target.value; render(); });
    $("#incident-status")?.addEventListener("change", (event) => { state.incidentStatus = event.target.value; render(); });
    if ($("#incident-status")) $("#incident-status").value = state.incidentStatus;
    if (focusHeading) $("#page-title")?.focus();
    else if (focusedId) document.getElementById(focusedId)?.focus();
  }
  VIEWS.forEach((view) => { const button = document.createElement("button"); button.dataset.view = view; button.textContent = view; button.setAttribute("aria-current", "false"); button.addEventListener("click", () => { state.view = view; closeNavigation(); render(true); }); $("#nav").append(button); });
  $("#scenario").addEventListener("change", (event) => { state.scenario = event.target.value; state.asset = "demo-1"; render(); });
  $("#stage").addEventListener("input", (event) => { state.stage = Number(event.target.value); render(); });
  $("#timezone").addEventListener("change", (event) => { state.timezone = event.target.value; render(); });
  document.querySelectorAll("[data-unit]").forEach((button) => button.addEventListener("click", () => { state.unit = button.dataset.unit; document.querySelectorAll("[data-unit]").forEach((item) => item.classList.toggle("active", item === button)); render(); }));
  mobileMenu.addEventListener("click", () => setNavigationOpen(!sidebar.classList.contains("open")));
  mobileBackdrop.addEventListener("click", closeNavigation);
  document.addEventListener("keydown", (event) => {
    if (!mobileLayout.matches || !sidebar.classList.contains("open")) return;
    if (event.key === "Escape") { event.preventDefault(); closeNavigation(); }
    if (event.key === "Tab") {
      const controls = [...sidebar.querySelectorAll("button, select, input"), mobileMenu];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  mobileLayout.addEventListener("change", () => {
    const focusWasInSidebar = sidebar.contains(document.activeElement);
    setNavigationOpen(false, false);
    if (mobileLayout.matches && focusWasInSidebar) mobileMenu.focus();
    else if (!mobileLayout.matches && document.activeElement === mobileMenu) $("#nav [aria-current='page']")?.focus();
  });
  syncNavigation();
  const contactDialog = $("#contact-dialog");
  const contactForm = $("#contact-form");
  const contactStatus = $("#contact-status");
  const contactSubmit = $("#contact-submit");
  let contactSubmitting = false;
  $("#contact-open").addEventListener("click", () => { contactStatus.className = "form-status"; contactStatus.textContent = ""; contactDialog.showModal(); });
  $("#contact-close").addEventListener("click", () => contactDialog.close());
  $("#contact-cancel").addEventListener("click", () => contactDialog.close());
  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (contactSubmitting || !contactForm.checkValidity()) { contactForm.reportValidity(); return; }
    contactSubmitting = true;
    contactSubmit.disabled = true;
    contactSubmit.textContent = "Sending…";
    contactStatus.className = "form-status";
    contactStatus.textContent = "";
    try {
      const response = await fetch(contactForm.action, { method: "POST", body: new FormData(contactForm), headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Submission failed");
      contactForm.reset();
      contactStatus.className = "form-status success";
      contactStatus.textContent = "Thanks — your inquiry was sent successfully.";
    } catch (error) {
      contactStatus.className = "form-status failure";
      contactStatus.textContent = "We couldn’t send your inquiry. Please try again.";
    } finally {
      contactSubmitting = false;
      contactSubmit.disabled = false;
      contactSubmit.textContent = "Send inquiry";
    }
  });
render();

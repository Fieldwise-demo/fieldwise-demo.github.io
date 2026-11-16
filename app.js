(() => {
  "use strict";

  const STAGES = { 24: "Normal operation", 38: "Temperature excursion", 48: "Recovery", 60: "Missing reports" };
  const VIEWS = ["Overview", "Asset Detail", "Incidents", "Device Health", "Insights"];
  const START = new Date("2026-11-15T13:00:00Z");
  const state = { view: "Overview", scenario: "Refrigeration", stage: 60, unit: "°C", timezone: "America/New_York", asset: "demo-1", incidentStatus: "All" };
  const app = document.querySelector("#app");
  const $ = (selector) => document.querySelector(selector);
  const sidebar = $("#sidebar");
  const mobileMenu = $("#mobile-menu");
  const mobileBackdrop = $("#mobile-backdrop");
  let navigationReturnFocus = mobileMenu;

  function setNavigationOpen(open, restoreFocus = true) {
    sidebar.classList.toggle("open", open);
    mobileMenu.setAttribute("aria-expanded", String(open));
    mobileMenu.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    mobileBackdrop.hidden = !open;

    if (open) {
      navigationReturnFocus = document.activeElement || mobileMenu;
      requestAnimationFrame(() => $("#nav button")?.focus());
    } else if (restoreFocus && navigationReturnFocus?.focus) {
      navigationReturnFocus.focus();
    }
  }

  function closeNavigation() {
    if (sidebar.classList.contains("open")) setNavigationOpen(false);
  }

  function escape(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function toTemp(value) { return state.unit === "°F" ? value * 9 / 5 + 32 : value; }
  function tempText(value) { return value == null ? "—" : toTemp(value).toFixed(1) + " " + state.unit; }
  function timeText(value) {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: state.timezone, timeZoneName: "short" }).format(value);
  }
  function shortTime(value) {
    return new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: state.timezone }).format(value);
  }
  function scenarioConfig() {
    return state.scenario === "Refrigeration"
      ? { names: ["Walk-in cooler", "Display refrigerator", "Prep refrigerator"], low: 1, high: 5, baseline: 3, equipment: "Illustrative monitored equipment" }
      : { names: ["Main workspace", "Stockroom", "Meeting room"], low: 18, high: 30, baseline: 23, equipment: "Illustrative monitored space" };
  }
  function buildData() {
    const config = scenarioConfig();
    const clock = new Date(START.getTime() + state.stage * 5 * 60000);
    const assets = config.names.map((name, index) => ({
      id: "demo-" + (index + 1), name, site: index < 2 ? "Market Street" : "Riverside",
      low: config.low, high: config.high, equipment: config.equipment, expected: 300
    }));
    const measurements = [];
    for (let minute = 0; minute <= state.stage; minute += 1) {
      const time = new Date(START.getTime() + minute * 5 * 60000);
      assets.forEach((asset, index) => {
        if (index === 2 && minute > 48) return;
        let temperature = config.baseline + Math.sin(minute / 5 + index) * 0.45;
        if (index === 0 && minute >= 30 && minute <= 42) temperature = config.high + 1.5 + Math.sin(minute / 3) * 0.4;
        if (index === 2 && minute >= 46) temperature = config.high + 0.8;
        measurements.push({
          asset: asset.id, time, temperature: Number(temperature.toFixed(2)),
          humidity: Number((46 + Math.sin(minute / 7 + index) * 5).toFixed(2)),
          unknown: index === 1 && minute % 17 === 0
        });
      });
    }
    const incidents = [];
    const open = new Map();
    measurements.forEach((row) => {
      const asset = assets.find((item) => item.id === row.asset);
      [["temperature", asset.low, asset.high], ["humidity", 30, 70]].forEach(([field, low, high]) => {
        const value = row[field];
        const violation = value < low ? ["below minimum", low] : value > high ? ["above maximum", high] : null;
        const key = row.asset + "|" + field;
        if (violation) {
          if (open.has(key)) {
            const item = incidents[open.get(key)];
            item.value = value; item.last = row.time; item.count += 1;
          } else {
            open.set(key, incidents.length);
            incidents.push({
              id: "DEMO-" + String(incidents.length + 1).padStart(3, "0"), asset: row.asset, field,
              value, threshold: violation[1], condition: violation[0], severity: "warning",
              status: "active", first: row.time, last: row.time, resolved: null, count: 1
            });
          }
        } else if (open.has(key)) {
          const item = incidents[open.get(key)];
          item.status = "resolved"; item.resolved = row.time; open.delete(key);
        }
      });
    });
    return { clock, assets, measurements, incidents };
  }
  function rows(data, assetId) { return data.measurements.filter((row) => row.asset === assetId); }
  function latest(data, assetId) { return rows(data, assetId).at(-1); }
  function freshness(row, data, asset) {
    if (!row) return "No reports";
    return data.clock - row.time <= asset.expected * 3 * 1000 ? "Recent telemetry" : "Stale telemetry";
  }
  function incidents(data, status = "All", assetId = null) {
    return data.incidents.filter((item) =>
      (status === "All" || item.status === status.toLowerCase()) && (!assetId || item.asset === assetId)
    ).sort((a, b) => b.first - a.first);
  }
  function metric(label, value) {
    return '<div class="metric"><div class="metric-label">' + label + '</div><div class="metric-value">' + value + '</div></div>';
  }
  function chart(dataRows, asset, kind) {
    const isTemperature = kind === "temperature";
    const values = dataRows.map((row) => isTemperature ? toTemp(row.temperature) : row.humidity);
    const lower = isTemperature ? toTemp(asset.low) : 30;
    const upper = isTemperature ? toTemp(asset.high) : 70;
    const all = values.concat([lower, upper]);
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
    const points = dataRows.map((row, index) => [x(index), y(isTemperature ? toTemp(row.temperature) : row.humidity)]);
    const path = points.map(([px, py], index) => (index ? "L" : "M") + px.toFixed(1) + " " + py.toFixed(1)).join(" ");
    const markers = dataRows.map((row, index) => {
      const value = isTemperature ? toTemp(row.temperature) : row.humidity;
      const outside = value < lower || value > upper;
      const cls = outside ? "excursion-dot" : "measurement-dot";
      return '<circle class="' + cls + '" cx="' + x(index) + '" cy="' + y(value) + '" r="' + (outside ? 4 : 2.7) + '"><title>' +
        shortTime(row.time) + " · " + value.toFixed(1) + (isTemperature ? " " + state.unit : " %") +
        (outside ? " · Outside operating range" : "") + "</title></circle>";
    }).join("");
    const step = Math.max(1, Math.ceil(dataRows.length / 7));
    for (let index = 0; index < dataRows.length; index += step) labels += '<text class="axis-label" x="' + x(index) + '" y="' + (height - 10) + '" text-anchor="middle">' + shortTime(dataRows[index].time) + "</text>";
    if (dataRows.length) labels += '<text class="axis-label" x="' + x(dataRows.length - 1) + '" y="' + (height - 10) + '" text-anchor="middle">' + shortTime(dataRows.at(-1).time) + "</text>";
    const thresholdLines = isTemperature
      ? '<line class="threshold-line" x1="' + plot.left + '" x2="' + (width - plot.right) + '" y1="' + y(lower) + '" y2="' + y(lower) + '"></line><text class="threshold-label" x="' + (plot.left + 8) + '" y="' + (y(lower) - 7) + '">Lower operating threshold</text><line class="threshold-line" x1="' + plot.left + '" x2="' + (width - plot.right) + '" y1="' + y(upper) + '" y2="' + y(upper) + '"></line><text class="threshold-label" x="' + (plot.left + 8) + '" y="' + (y(upper) - 7) + '">Upper operating threshold</text>'
      : "";
    const axis = isTemperature ? state.unit : "%";
    return '<svg viewBox="0 0 ' + width + " " + height + '" role="img" aria-label="' + (isTemperature ? "Temperature chart" : "Humidity chart") + '">' +
      grid + thresholdLines + '<path class="measurement-line" stroke="' + (isTemperature ? "#17645e" : "#245b9b") + '" d="' + path + '"></path>' +
      markers + labels + '<text class="axis-title" x="14" y="' + (plot.top + plotHeight / 2) + '" transform="rotate(-90 14 ' + (plot.top + plotHeight / 2) + ')">' + axis + '</text><text class="axis-title" x="' + (width / 2) + '" y="' + (height - 1) + '" text-anchor="middle">Receipt time</text></svg>';
  }
  function assetCard(data, asset) {
    const row = latest(data, asset.id), active = incidents(data, "Active", asset.id), status = freshness(row, data, asset);
    return '<article class="card ' + (active.length ? "active" : status === "Stale telemetry" ? "stale" : "") + '"><div class="card-head"><h3>' +
      asset.name + '</h3>' + (active.length ? '<span class="status">Active attention</span>' : status === "Stale telemetry" ? '<span class="status stale">Stale reporting</span>' : "") +
      '</div><p class="meta">' + asset.site + '</p>' + (active.length ? '<p class="caption">' + active.length + " incident(s) affecting this asset</p>" : status === "Stale telemetry" ? '<p class="caption">No recent report within the expected window</p>' : "") +
      '<div class="stats"><div><div class="stat-label">Last temperature</div><div class="stat-value">' + tempText(row?.temperature) + '</div></div><div><div class="stat-label">Last humidity</div><div class="stat-value">' +
      (row ? row.humidity.toFixed(1) + " %" : "—") + '</div></div><div><div class="stat-label">Active incidents</div><div class="stat-value">' + active.length +
      '</div></div></div><p class="caption"><strong>' + status + '</strong> · reporting freshness<br>Last receipt: ' + (row ? timeText(row.time) : "Unknown") + ' · Connectivity unverified</p></article>';
  }
  function incidentCard(data, item) {
    const asset = data.assets.find((candidate) => candidate.id === item.asset);
    const isTemp = item.field === "temperature";
    return '<article class="incident-card ' + item.status + '"><div class="incident-card-head"><strong>' + item.id + '</strong><span class="badge ' + item.status + '">' + item.status + '</span></div>' +
      '<dl><div><dt>Asset</dt><dd>' + asset.name + '</dd></div><div><dt>Severity</dt><dd>' + item.severity + '</dd></div><div><dt>Measurement</dt><dd>' + (isTemp ? "Temperature" : "Relative humidity") + '</dd></div><div><dt>Latest value</dt><dd>' + (isTemp ? tempText(item.value) : item.value.toFixed(2) + " %") + '</dd></div><div><dt>Condition</dt><dd>' + item.condition + '</dd></div><div><dt>Threshold</dt><dd>' + (isTemp ? tempText(item.threshold) : item.threshold.toFixed(2) + " %") + '</dd></div><div><dt>Occurrences</dt><dd>' + item.count + '</dd></div><div><dt>First detected</dt><dd>' + timeText(item.first) + '</dd></div><div><dt>Resolved</dt><dd>' + (item.resolved ? timeText(item.resolved) : "Open") + '</dd></div></dl></article>';
  }
  function incidentTable(data, list) {
    if (!list.length) return '<div class="card empty">No incidents match this selection.</div>';
    return '<div class="table-wrap incident-table"><table><thead><tr><th>Incident</th><th>Asset</th><th>Status</th><th>Severity</th><th>Measurement</th><th>Condition</th><th>Last value</th><th>Threshold</th><th>Occurrences</th><th>First detected</th><th>Resolved</th></tr></thead><tbody>' +
      list.map((item) => { const asset = data.assets.find((a) => a.id === item.asset), isTemp = item.field === "temperature"; return '<tr class="' + item.status + '"><td>' + item.id + '</td><td>' +
        asset.name + '</td><td><span class="badge ' + item.status + '">' + item.status + '</span></td><td>' + item.severity + '</td><td>' + (isTemp ? "Temperature" : "Relative humidity") +
        '</td><td>' + item.condition + '</td><td>' + (isTemp ? tempText(item.value) : item.value.toFixed(2) + " %") + '</td><td>' + (isTemp ? tempText(item.threshold) : item.threshold.toFixed(2) + " %") +
        '</td><td>' + item.count + '</td><td>' + timeText(item.first) + '</td><td>' + (item.resolved ? timeText(item.resolved) : "Open") + "</td></tr>"; }).join("") +
      '</tbody></table></div><div class="incident-cards">' + list.map((item) => incidentCard(data, item)).join("") + '</div><p class="caption">Each incident groups repeated violations of one asset, measurement, and condition. Missing reports do not resolve incidents.</p>';
  }
  function overview(data) {
    const active = incidents(data, "Active"), resolved = incidents(data, "Resolved");
    const names = active.map((item) => data.assets.find((asset) => asset.id === item.asset).name).join(", ");
    return '<h2>Your operation at a glance</h2><div class="metrics">' + metric("Monitored assets", data.assets.length) + metric("Locations", new Set(data.assets.map((a) => a.site)).size) +
      metric("Active incidents", active.length) + metric("Resolved incidents", resolved.length) + '</div><h2>Attention & next steps</h2>' +
      (active.length ? '<div class="alert">' + active.length + " active threshold incident(s) need review · affected assets: " + escape(names) + '</div>' : '<div class="success">No active threshold incidents at this replay stage.</div>') +
      '<p class="caption">Operating settings are illustrative. Refrigeration settings do not establish food-safety compliance.</p><div class="cards">' +
      data.assets.map((asset) => assetCard(data, asset)).join("") + "</div>";
  }
  function assetDetail(data) {
    const asset = data.assets.find((item) => item.id === state.asset) || data.assets[0]; state.asset = asset.id;
    const dataRows = rows(data, asset.id);
    return '<div class="toolbar"><label>Asset<select id="asset-select">' + data.assets.map((item) => '<option value="' + item.id + '" ' + (item.id === asset.id ? "selected" : "") + '>' + item.name + "</option>").join("") +
      '</select></label></div><h2>' + asset.name + '</h2><p class="caption">' + asset.site + " · " + asset.equipment + " · " + asset.id + '</p><p class="caption">Illustrative temperature range: ' +
      tempText(asset.low) + "–" + tempText(asset.high) + ' · Humidity range: 30–70 %.</p><p class="caption">Charts use platform receipt time. Lines connect sampled reports; they do not establish continuous exposure.</p>' +
      '<h2>Temperature & operating range</h2><div class="chart-card"><div class="legend"><span><i class="swatch" style="background:#17645e"></i>Temperature</span><span><i class="swatch threshold-swatch"></i>Operating thresholds</span><span><i class="swatch dot-swatch"></i>Outside range</span></div>' +
      chart(dataRows, asset, "temperature") + '</div><h2>Relative humidity</h2><div class="chart-card"><div class="legend"><span><i class="swatch" style="background:#245b9b"></i>Humidity</span><span><i class="swatch dot-swatch"></i>Outside range</span></div>' +
      chart(dataRows, asset, "humidity") + '</div><h2>Recent incidents</h2>' + incidentTable(data, incidents(data, "All", asset.id));
  }
  function incidentView(data) {
    const active = incidents(data, "Active"), resolved = incidents(data, "Resolved");
    return '<h2>Review operating exceptions</h2><p class="caption">Active incidents are still being observed; resolved incidents retain their complete lifecycle for review.</p><div class="toolbar"><label>Incident status<select id="incident-status"><option>All</option><option>Active</option><option>Resolved</option></select></label></div>' +
      (active.length ? '<div class="alert">ACTIVE · ' + active.length + " incident(s) · " + [...new Set(active.map((i) => data.assets.find((a) => a.id === i.asset).name))].join(", ") + "</div>" : "") +
      (resolved.length ? '<div class="success">RESOLVED · ' + resolved.length + " incident(s) retained for lifecycle review</div>" : "") + incidentTable(data, incidents(data, state.incidentStatus));
  }
  function health(data) {
    const items = data.assets.map((asset) => { const row = latest(data, asset.id); return { asset, row, status: freshness(row, data, asset), age: row ? Math.floor((data.clock - row.time) / 60000) : null }; });
    const stale = items.filter((item) => item.status === "Stale telemetry");
    return '<h2>Reporting freshness</h2><p class="caption">Recent reports establish receipt activity only. Connectivity, battery, signal strength, and equipment reliability are unverified. Freshness becomes stale after three expected reporting intervals.</p>' +
      (stale.length ? '<div class="warning">STALE REPORTING · ' + stale.length + " affected asset(s): " + stale.map((item) => item.asset.name).join(", ") + '</div>' : '<div class="success">All assets are reporting within the expected freshness window.</div>') +
      '<div class="table-wrap"><table><thead><tr><th>Asset</th><th>Reporting</th><th>Last receipt</th><th>Receipt age</th><th>Expected interval</th><th>Connectivity</th><th>Timestamp quality</th><th>Measurement quality</th></tr></thead><tbody>' +
      items.map((item) => '<tr class="' + (item.status === "Stale telemetry" ? "active" : "") + '"><td>' + item.asset.name + '</td><td>' + item.status + '</td><td>' +
        (item.row ? timeText(item.row.time) : "Unknown") + '</td><td>' + (item.age == null ? "—" : item.age + " min") + '</td><td>5 min</td><td>Unverified</td><td>' +
        (item.row?.unknown ? "Unknown" : "Synchronized") + '</td><td>Good</td></tr>').join("") + '</tbody></table></div><p class="caption">Quality flags are synthetic source metadata, not independent diagnostic validation.</p>';
  }
  function insights(data) {
    const items = [];
    data.assets.forEach((asset) => {
      const dataRows = rows(data, asset.id), row = dataRows.at(-1), status = freshness(row, data, asset);
      if (status !== "Recent telemetry") items.push([0, asset.name + ": " + status.toLowerCase() + " — review the reporting path before relying on the latest reading."]);
      incidents(data, "All", asset.id).forEach((item) => items.push([item.status === "active" ? 0 : 1, asset.name + ": " + item.status + " " + item.field + " excursion, " + item.count + " violating reports spanning " + Math.floor((item.last - item.first) / 60000) + " minutes. This is a sampled span, not continuous exposure duration."]));
      if (dataRows.length > 1) items.push([2, asset.name + ": temperature changed " + (dataRows.at(-1).temperature - dataRows[0].temperature).toFixed(2) + " °C across " + Math.floor((dataRows.at(-1).time - dataRows[0].time) / 60000) + " minutes of received reports."]);
    });
    items.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
    return '<h2>Observations you can act on</h2><p class="caption">Illustrative insights from synthetic reports. Freshness reflects receipt activity; connectivity remains unverified. These are descriptive observations, not predictions or validated diagnoses.</p>' +
      items.map((item) => '<div class="card insight"><strong>' + (item[0] === 0 ? "Action needed · " : item[0] === 1 ? "Review · " : "") + "</strong>" + escape(item[1]) + "</div>").join("") +
      '<div class="notice">Suggested review: inspect active excursions and stale reporting before making operational decisions.</div>';
  }
  function render(focusHeading = false) {
    const data = buildData();
    $("#stage-name").textContent = STAGES[state.stage];
    document.querySelectorAll("#nav button").forEach((button) => {
      const active = button.dataset.view === state.view;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });
    const body = state.view === "Overview" ? overview(data) : state.view === "Asset Detail" ? assetDetail(data) : state.view === "Incidents" ? incidentView(data) : state.view === "Device Health" ? health(data) : insights(data);
    app.innerHTML = '<div class="demo-tag">OPERATIONS WORKSPACE</div><h1 id="page-title" tabindex="-1">' + state.view + '</h1><p class="sr-only" role="status" aria-live="polite">' + state.view + ' view selected.</p><p class="subtitle">Know what needs attention. Keep your operation moving.</p><div class="notice"><strong>Demonstration using simulated data.</strong> · ' +
      state.scenario + " · " + STAGES[state.stage] + " · Scenario clock: " + timeText(data.clock) + ". These are illustrative readings, not live measurements.</div>" + body;
    $("#asset-select")?.addEventListener("change", (event) => { state.asset = event.target.value; render(); });
    $("#incident-status")?.addEventListener("change", (event) => { state.incidentStatus = event.target.value; render(); });
    if (focusHeading) $("#page-title")?.focus();
  }
  VIEWS.forEach((view) => { const button = document.createElement("button"); button.dataset.view = view; button.textContent = view; button.setAttribute("aria-current", "false"); button.addEventListener("click", () => { state.view = view; closeNavigation(); render(true); }); $("#nav").append(button); });
  $("#scenario").addEventListener("change", (event) => { state.scenario = event.target.value; state.asset = "demo-1"; render(); });
  $("#stage").addEventListener("input", (event) => { state.stage = Number(event.target.value); render(); });
  $("#timezone").addEventListener("change", (event) => { state.timezone = event.target.value; render(); });
  document.querySelectorAll("[data-unit]").forEach((button) => button.addEventListener("click", () => { state.unit = button.dataset.unit; document.querySelectorAll("[data-unit]").forEach((item) => item.classList.toggle("active", item === button)); render(); }));
  mobileMenu.addEventListener("click", () => setNavigationOpen(!sidebar.classList.contains("open")));
  mobileBackdrop.addEventListener("click", closeNavigation);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeNavigation(); });
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
})();

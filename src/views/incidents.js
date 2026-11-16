import { filterIncidents } from "../domain/incidents.js";
import { escapeHtml, temperatureText, timeText } from "./shared.js";

function renderIncidentCard(snapshot, item, preferences) {
  const asset = snapshot.assets.find((candidate) => candidate.id === item.assetId);
  const isTemperature = item.field === "temperature";
  return '<article class="incident-card ' + item.status + '"><div class="incident-card-head"><strong>' + escapeHtml(item.id) +
    '</strong><span class="badge ' + item.status + '">' + item.status + '</span></div><dl><div><dt>Asset</dt><dd>' +
    escapeHtml(asset.name) + '</dd></div><div><dt>Severity</dt><dd>' + escapeHtml(item.severity) +
    '</dd></div><div><dt>Measurement</dt><dd>' + (isTemperature ? "Temperature" : "Relative humidity") +
    '</dd></div><div><dt>Latest value</dt><dd>' + (isTemperature ? temperatureText(item.value, preferences.unit) : item.value.toFixed(2) + " %") +
    '</dd></div><div><dt>Condition</dt><dd>' + escapeHtml(item.condition) +
    '</dd></div><div><dt>Threshold</dt><dd>' + (isTemperature ? temperatureText(item.threshold, preferences.unit) : item.threshold.toFixed(2) + " %") +
    '</dd></div><div><dt>Occurrences</dt><dd>' + item.count + '</dd></div><div><dt>First detected</dt><dd>' +
    timeText(item.firstReceivedAt, preferences.timezone) + '</dd></div><div><dt>Resolved</dt><dd>' +
    (item.resolvedAt ? timeText(item.resolvedAt, preferences.timezone) : "Open") + '</dd></div></dl></article>';
}

export function renderIncidentTable(snapshot, list, preferences) {
  if (!list.length) return '<div class="card empty">No incidents match this selection.</div>';
  const table = '<div class="table-wrap incident-table"><table><thead><tr><th>Incident</th><th>Asset</th><th>Status</th><th>Severity</th><th>Measurement</th><th>Condition</th><th>Last value</th><th>Threshold</th><th>Occurrences</th><th>First detected</th><th>Resolved</th></tr></thead><tbody>' +
    list.map((item) => {
      const asset = snapshot.assets.find((candidate) => candidate.id === item.assetId);
      const isTemperature = item.field === "temperature";
      return '<tr class="' + item.status + '"><td>' + escapeHtml(item.id) + '</td><td>' + escapeHtml(asset.name) +
        '</td><td><span class="badge ' + item.status + '">' + item.status + '</span></td><td>' + escapeHtml(item.severity) +
        '</td><td>' + (isTemperature ? "Temperature" : "Relative humidity") + '</td><td>' + escapeHtml(item.condition) +
        '</td><td>' + (isTemperature ? temperatureText(item.value, preferences.unit) : item.value.toFixed(2) + " %") +
        '</td><td>' + (isTemperature ? temperatureText(item.threshold, preferences.unit) : item.threshold.toFixed(2) + " %") +
        '</td><td>' + item.count + '</td><td>' + timeText(item.firstReceivedAt, preferences.timezone) +
        '</td><td>' + (item.resolvedAt ? timeText(item.resolvedAt, preferences.timezone) : "Open") + "</td></tr>";
    }).join("") + '</tbody></table></div>';
  return table + '<div class="incident-cards">' + list.map((item) => renderIncidentCard(snapshot, item, preferences)).join("") +
    '</div><p class="caption">Each incident groups repeated violations of one asset, measurement, and condition. Missing reports do not resolve incidents.</p>';
}

export function renderIncidents(snapshot, state) {
  const active = filterIncidents(snapshot.incidents, "Active");
  const resolved = filterIncidents(snapshot.incidents, "Resolved");
  const statusNotice = active.length
    ? '<div class="alert">ACTIVE · ' + active.length + " incident(s) · " +
      [...new Set(active.map((incident) => snapshot.assets.find((asset) => asset.id === incident.assetId).name))]
        .map(escapeHtml).join(", ") + "</div>"
    : "";
  const resolvedNotice = resolved.length
    ? '<div class="success">RESOLVED · ' + resolved.length + " incident(s) retained for lifecycle review</div>"
    : "";
  return '<h2>Review operating exceptions</h2><p class="caption">Active incidents are still being observed; resolved incidents retain their complete lifecycle for review.</p>' +
    '<div class="toolbar"><label>Incident status<select id="incident-status"><option>All</option><option>Active</option><option>Resolved</option></select></label></div>' +
    statusNotice + resolvedNotice +
    renderIncidentTable(snapshot, filterIncidents(snapshot.incidents, state.incidentStatus), state);
}

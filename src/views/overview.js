import { filterIncidents, getFreshness, latestMeasurement } from "../domain/incidents.js";
import {
  connectivityLabel,
  escapeHtml,
  freshnessLabel,
  metric,
  temperatureText,
  timeText
} from "./shared.js";

function renderAssetCard(snapshot, asset, preferences) {
  const reading = latestMeasurement(snapshot.measurements, asset.id);
  const active = filterIncidents(snapshot.incidents, "Active", asset.id);
  const status = freshnessLabel(getFreshness(reading, snapshot.asOf, asset.expectedIntervalSeconds));
  const cardClass = active.length ? "active" : status === "Stale telemetry" ? "stale" : "";
  const statusBadge = active.length
    ? '<span class="status">Active attention</span>'
    : status === "Stale telemetry" ? '<span class="status stale">Stale reporting</span>' : "";
  const detail = active.length
    ? '<p class="caption">' + active.length + " incident(s) affecting this asset</p>"
    : status === "Stale telemetry" ? '<p class="caption">No recent report within the expected window</p>' : "";
  return '<article class="card ' + cardClass + '"><div class="card-head"><h3>' + escapeHtml(asset.name) + '</h3>' + statusBadge +
    '</div><p class="meta">' + escapeHtml(asset.site) + '</p>' + detail +
    '<div class="stats"><div><div class="stat-label">Last temperature</div><div class="stat-value">' +
    temperatureText(reading?.temperatureC, preferences.unit) + '</div></div><div><div class="stat-label">Last humidity</div><div class="stat-value">' +
    (reading ? reading.humidityPercent.toFixed(1) + " %" : "—") + '</div></div><div><div class="stat-label">Active incidents</div><div class="stat-value">' +
    active.length + '</div></div></div><p class="caption"><strong>' + status + '</strong> · reporting freshness<br>Last receipt: ' +
    (reading ? timeText(reading.receivedAt, preferences.timezone) : "Unknown") + ' · Connectivity ' +
    connectivityLabel(asset.connectivity.status) + '</p></article>';
}

export function renderOverview(snapshot, preferences) {
  const active = filterIncidents(snapshot.incidents, "Active");
  const resolved = filterIncidents(snapshot.incidents, "Resolved");
  const names = active.map((incident) =>
    snapshot.assets.find((asset) => asset.id === incident.assetId).name
  ).join(", ");
  return '<h2>Your operation at a glance</h2><div class="metrics">' +
    metric("Monitored assets", snapshot.assets.length) +
    metric("Locations", new Set(snapshot.assets.map((asset) => asset.site)).size) +
    metric("Active incidents", active.length) +
    metric("Resolved incidents", resolved.length) + '</div><h2>Attention & next steps</h2>' +
    (active.length
      ? '<div class="alert">' + active.length + " active threshold incident(s) need review · affected assets: " + escapeHtml(names) + '</div>'
      : '<div class="success">No active threshold incidents at this replay stage.</div>') +
    '<p class="caption">Operating settings are illustrative. Refrigeration settings do not establish food-safety compliance.</p><div class="cards">' +
    snapshot.assets.map((asset) => renderAssetCard(snapshot, asset, preferences)).join("") + "</div>";
}

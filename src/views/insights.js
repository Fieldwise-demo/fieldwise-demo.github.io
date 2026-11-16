import { filterIncidents, getFreshness, latestMeasurement } from "../domain/incidents.js";
import { escapeHtml, freshnessLabel } from "./shared.js";

export function renderInsights(snapshot) {
  const items = [];
  snapshot.assets.forEach((asset) => {
    const rows = snapshot.measurements.filter((row) => row.assetId === asset.id);
    const latest = latestMeasurement(snapshot.measurements, asset.id);
    const status = freshnessLabel(getFreshness(latest, snapshot.asOf, asset.expectedIntervalSeconds));
    if (status !== "Recent telemetry") {
      items.push([0, asset.name + ": " + status.toLowerCase() +
        " — review the reporting path before relying on the latest reading."]);
    }
    filterIncidents(snapshot.incidents, "All", asset.id).forEach((incident) => {
      items.push([
        incident.status === "active" ? 0 : 1,
        asset.name + ": " + incident.status + " " + incident.field + " excursion, " + incident.count +
          " violating reports spanning " + Math.floor((incident.lastReceivedAt - incident.firstReceivedAt) / 60000) +
          " minutes. This is a sampled span, not continuous exposure duration."
      ]);
    });
    if (rows.length > 1) {
      items.push([
        2,
        asset.name + ": temperature changed " +
          (rows.at(-1).temperatureC - rows[0].temperatureC).toFixed(2) + " °C across " +
          Math.floor((rows.at(-1).receivedAt - rows[0].receivedAt) / 60000) +
          " minutes of received reports."
      ]);
    }
  });
  items.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
  const intro = snapshot.source === "simulated"
    ? "Illustrative insights from synthetic reports."
    : "Descriptive observations from the configured provider.";
  const connectivityNote = snapshot.assets.every((asset) => asset.connectivity.status === "unverified")
    ? "Connectivity remains unverified."
    : "Connectivity is reported separately from telemetry freshness.";
  return '<h2>Observations you can act on</h2><p class="caption">' + intro +
    ' Freshness reflects receipt activity; ' + connectivityNote + ' These are descriptive observations, not predictions or validated diagnoses.</p>' +
    items.map((item) => '<div class="card insight"><strong>' +
      (item[0] === 0 ? "Action needed · " : item[0] === 1 ? "Review · " : "") +
      "</strong>" + escapeHtml(item[1]) + "</div>").join("") +
    '<div class="notice">Suggested review: inspect active excursions and stale reporting before making operational decisions.</div>';
}

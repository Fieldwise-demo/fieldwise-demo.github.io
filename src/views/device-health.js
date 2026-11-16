import { getFreshness, latestMeasurement } from "../domain/incidents.js";
import { connectivityLabel, escapeHtml, freshnessLabel, timeText } from "./shared.js";

export function renderDeviceHealth(snapshot, preferences) {
  const items = snapshot.assets.map((asset) => {
    const reading = latestMeasurement(snapshot.measurements, asset.id);
    const freshness = getFreshness(reading, snapshot.asOf, asset.expectedIntervalSeconds);
    return {
      asset,
      reading,
      status: freshnessLabel(freshness),
      ageMinutes: freshness.ageSeconds == null ? null : Math.floor(freshness.ageSeconds / 60)
    };
  });
  const stale = items.filter((item) => item.status === "Stale telemetry");
  const unclassified = items.filter((item) => item.status === "Freshness unknown" || item.status === "No reports");
  const summary = stale.length
    ? '<div class="warning">STALE REPORTING · ' + stale.length + " affected asset(s): " +
      stale.map((item) => escapeHtml(item.asset.name)).join(", ") + '</div>'
    : !items.length
      ? '<div class="notice">No assets are available for this view.</div>'
      : unclassified.length
        ? '<div class="notice">FRESHNESS UNKNOWN · ' + unclassified.length + " asset(s) lack enough reporting data for classification.</div>"
        : '<div class="success">All assets are reporting within the expected freshness window.</div>';
  const qualityNote = snapshot.source === "simulated"
    ? "Synthetic quality flags are source metadata, not independent diagnostic validation."
    : "Unknown quality values mean the provider did not supply that information.";
  return '<h2>Reporting freshness</h2><p class="caption">Freshness reflects receipt activity and is classified only when an expected reporting interval is provided. Connectivity is displayed separately from freshness.</p>' +
    summary + '<div class="table-wrap"><table><thead><tr><th>Asset</th><th>Reporting</th><th>Last receipt</th><th>Receipt age</th><th>Expected interval</th><th>Connectivity</th><th>Timestamp quality</th><th>Measurement quality</th></tr></thead><tbody>' +
    items.map((item) => '<tr class="' + (item.status === "Stale telemetry" ? "active" : "") + '"><td>' +
      escapeHtml(item.asset.name) + '</td><td>' + item.status + '</td><td>' +
      (item.reading ? timeText(item.reading.receivedAt, preferences.timezone) : "Unknown") + '</td><td>' +
      (item.ageMinutes == null ? "—" : item.ageMinutes + " min") + '</td><td>' +
      (item.asset.expectedIntervalSeconds == null ? "Unknown" : item.asset.expectedIntervalSeconds / 60 + " min") +
      '</td><td>' + connectivityLabel(item.asset.connectivity.status) + '</td><td>' +
      (item.reading?.timestampQuality === "unknown" ? "Unknown" : item.reading ? "Synchronized" : "Unknown") +
      '</td><td>' + escapeHtml(item.reading?.measurementQuality ?? "Unknown") + '</td></tr>').join("") +
    '</tbody></table></div><p class="caption">' + qualityNote + '</p>';
}

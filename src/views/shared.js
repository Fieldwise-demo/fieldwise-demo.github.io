import { formatDateTime, formatShortTime } from "../format/date-time.js";
import { formatTemperature } from "../format/temperature.js";
import { escapeHtml } from "./html.js";

export { escapeHtml };

export function temperatureText(valueC, unit) {
  return formatTemperature(valueC, unit);
}

export function timeText(value, timezone) {
  return formatDateTime(value, timezone);
}

export function shortTime(value, timezone) {
  return formatShortTime(value, timezone);
}

export function thresholdRange(range, formatValue) {
  if (range.min == null && range.max == null) return "Not provided";
  if (range.min == null) return "Minimum not provided; maximum " + formatValue(range.max);
  if (range.max == null) return "Minimum " + formatValue(range.min) + "; maximum not provided";
  return formatValue(range.min) + "–" + formatValue(range.max);
}

export function connectivityLabel(status) {
  return status === "connected" ? "Connected" : status === "disconnected" ? "Disconnected" : "Unverified";
}

export function freshnessLabel(result) {
  return result.status === "recent" ? "Recent telemetry"
    : result.status === "stale" ? "Stale telemetry"
      : result.status === "unknown" ? "Freshness unknown" : "No reports";
}

export function metric(label, value) {
  return '<div class="metric"><div class="metric-label">' + label + '</div><div class="metric-value">' + value + '</div></div>';
}

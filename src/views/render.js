import { renderAssetDetail } from "./asset-detail.js";
import { renderDeviceHealth } from "./device-health.js";
import { renderIncidents } from "./incidents.js";
import { renderInsights } from "./insights.js";
import { renderOverview } from "./overview.js";

export function renderView(snapshot, state) {
  const preferences = { unit: state.unit, timezone: state.timezone };
  switch (state.view) {
    case "Overview":
      return renderOverview(snapshot, preferences);
    case "Asset Detail":
      return renderAssetDetail(snapshot, state);
    case "Incidents":
      return renderIncidents(snapshot, state);
    case "Device Health":
      return renderDeviceHealth(snapshot, preferences);
    case "Insights":
      return renderInsights(snapshot);
    default:
      throw new TypeError(`Unsupported view: ${state.view}`);
  }
}

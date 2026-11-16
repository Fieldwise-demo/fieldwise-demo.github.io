import { filterIncidents } from "../domain/incidents.js";
import { renderChart } from "./chart.js";
import { escapeHtml, temperatureText, thresholdRange } from "./shared.js";
import { renderIncidentTable } from "./incidents.js";

export function renderAssetDetail(snapshot, state) {
  if (!snapshot.assets.length) return '<div class="card empty">No assets are available for this view.</div>';
  const asset = snapshot.assets.find((item) => item.id === state.asset) || snapshot.assets[0];
  const dataRows = snapshot.measurements.filter((row) => row.assetId === asset.id);
  return '<div class="toolbar"><label>Asset<select id="asset-select">' + snapshot.assets.map((item) =>
    '<option value="' + escapeHtml(item.id) + '" ' + (item.id === asset.id ? "selected" : "") + '>' +
    escapeHtml(item.name) + "</option>").join("") +
    '</select></label></div><h2>' + escapeHtml(asset.name) + '</h2><p class="caption">' +
    escapeHtml(asset.site) + " · " + escapeHtml(asset.equipment) + " · " + escapeHtml(asset.id) +
    '</p><p class="caption">Illustrative temperature range: ' +
    thresholdRange(asset.thresholds.temperatureC, (value) => temperatureText(value, state.unit)) +
    ' · Humidity range: ' + thresholdRange(asset.thresholds.humidityPercent, (value) => value + " %") +
    '.</p><p class="caption">Charts use platform receipt time. Lines connect sampled reports; they do not establish continuous exposure.</p>' +
    '<h2>Temperature & operating range</h2><div class="chart-card"><div class="legend"><span><i class="swatch" style="background:#17645e"></i>Temperature</span><span><i class="swatch threshold-swatch"></i>Operating thresholds</span><span><i class="swatch dot-swatch"></i>Outside range</span></div>' +
    renderChart(dataRows, asset, "temperature", state) +
    '</div><h2>Relative humidity</h2><div class="chart-card"><div class="legend"><span><i class="swatch" style="background:#245b9b"></i>Humidity</span><span><i class="swatch dot-swatch"></i>Outside range</span></div>' +
    renderChart(dataRows, asset, "humidity", state) +
    '</div><h2>Recent incidents</h2>' +
    renderIncidentTable(snapshot, filterIncidents(snapshot.incidents, "All", asset.id), state);
}

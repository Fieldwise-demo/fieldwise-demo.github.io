import { convertTemperature } from "../format/temperature.js";
import { shortTime } from "./shared.js";

export function renderChart(dataRows, asset, kind, { unit, timezone }) {
  const isTemperature = kind === "temperature";
  const values = dataRows.map((row) => isTemperature
    ? convertTemperature(row.temperatureC, unit)
    : row.humidityPercent);
  const bounds = isTemperature ? asset.thresholds.temperatureC : asset.thresholds.humidityPercent;
  const lower = bounds.min == null ? null : isTemperature ? convertTemperature(bounds.min, unit) : bounds.min;
  const upper = bounds.max == null ? null : isTemperature ? convertTemperature(bounds.max, unit) : bounds.max;
  const all = values.concat([lower, upper].filter((value) => value != null));
  if (!all.length) all.push(0, 1);
  let min = Math.min(...all), max = Math.max(...all), span = max - min || (isTemperature ? 2 : 10);
  const padding = Math.max(span * 0.12, (isTemperature ? 2 : 10) * 0.05);
  min -= padding;
  max += padding;
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
  const points = dataRows.map((row, index) => [
    x(index),
    y(isTemperature ? convertTemperature(row.temperatureC, unit) : row.humidityPercent)
  ]);
  const path = points.map(([px, py], index) => (index ? "L" : "M") + px.toFixed(1) + " " + py.toFixed(1)).join(" ");
  const markers = dataRows.map((row, index) => {
    const value = isTemperature ? convertTemperature(row.temperatureC, unit) : row.humidityPercent;
    const outside = (lower != null && value < lower) || (upper != null && value > upper);
    const cls = outside ? "excursion-dot" : "measurement-dot";
    return '<circle class="' + cls + '" cx="' + x(index) + '" cy="' + y(value) + '" r="' + (outside ? 4 : 2.7) + '"><title>' +
      shortTime(row.receivedAt, timezone) + " · " + value.toFixed(1) + (isTemperature ? " " + unit : " %") +
      (outside ? " · Outside operating range" : "") + "</title></circle>";
  }).join("");
  const step = Math.max(1, Math.ceil(dataRows.length / 7));
  for (let index = 0; index < dataRows.length; index += step) {
    labels += '<text class="axis-label" x="' + x(index) + '" y="' + (height - 10) + '" text-anchor="middle">' +
      shortTime(dataRows[index].receivedAt, timezone) + "</text>";
  }
  if (dataRows.length) {
    labels += '<text class="axis-label" x="' + x(dataRows.length - 1) + '" y="' + (height - 10) + '" text-anchor="middle">' +
      shortTime(dataRows.at(-1).receivedAt, timezone) + "</text>";
  }
  const thresholdLines = [lower, upper].map((value, index) => {
    if (value == null) return "";
    const label = index === 0 ? "Lower operating threshold" : "Upper operating threshold";
    return '<line class="threshold-line" x1="' + plot.left + '" x2="' + (width - plot.right) + '" y1="' + y(value) + '" y2="' + y(value) +
      '"></line><text class="threshold-label" x="' + (plot.left + 8) + '" y="' + (y(value) - 7) + '">' + label + "</text>";
  }).join("");
  const axis = isTemperature ? unit : "%";
  return '<svg viewBox="0 0 ' + width + " " + height + '" role="img" aria-label="' + (isTemperature ? "Temperature chart" : "Humidity chart") + '">' +
    grid + (isTemperature ? thresholdLines : "") +
    '<path class="measurement-line" stroke="' + (isTemperature ? "#17645e" : "#245b9b") + '" d="' + path + '"></path>' +
    markers + labels + '<text class="axis-title" x="14" y="' + (plot.top + plotHeight / 2) +
    '" transform="rotate(-90 14 ' + (plot.top + plotHeight / 2) + ')">' + axis + '</text><text class="axis-title" x="' +
    (width / 2) + '" y="' + (height - 1) + '" text-anchor="middle">Receipt time</text></svg>';
}

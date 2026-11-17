import { deriveIncidents } from "../domain/incidents.js";

const STAGE_START = Date.parse("2026-11-15T13:00:00Z");
const SCENARIOS = {
  Refrigeration: {
    names: ["Walk-in cooler", "Display refrigerator", "Prep refrigerator"],
    low: 1,
    high: 5,
    baseline: 3,
    equipment: "Illustrative monitored equipment"
  },
  "Building environment": {
    names: ["Main workspace", "Stockroom", "Meeting room"],
    low: 18,
    high: 30,
    baseline: 23,
    equipment: "Illustrative monitored space"
  }
};

export function createSyntheticSnapshot({ scenario, stage }) {
  const config = SCENARIOS[scenario];
  if (!config) throw new TypeError("Unsupported demonstration scenario");
  if (!Number.isInteger(stage) || stage < 24 || stage > 60) {
    throw new TypeError("Demonstration stage must be an integer from 24 to 60");
  }

  const asOf = new Date(STAGE_START + stage * 5 * 60000);
  const assets = config.names.map((name, index) => ({
    id: `demo-${index + 1}`,
    name,
    site: index < 2 ? "Market Street" : "Riverside",
    equipment: config.equipment,
    expectedIntervalSeconds: 300,
    thresholds: {
      temperatureC: { min: config.low, max: config.high },
      humidityPercent: { min: 30, max: 70 }
    },
    connectivity: { status: "unverified" }
  }));
  const measurements = [];
  for (let minute = 0; minute <= stage; minute += 1) {
    const receivedAt = new Date(STAGE_START + minute * 5 * 60000);
    assets.forEach((asset, index) => {
      if (index === 2 && minute > 48) return;
      let temperatureC = config.baseline + Math.sin(minute / 5 + index) * 0.45;
      if (index === 0 && minute >= 30 && minute <= 42) {
        temperatureC = config.high + 1.5 + Math.sin(minute / 3) * 0.4;
      }
      if (index === 2 && minute >= 46) temperatureC = config.high + 0.8;
      measurements.push({
        assetId: asset.id,
        measurementTime: null,
        receivedAt,
        temperatureC: Number(temperatureC.toFixed(2)),
        humidityPercent: Number((46 + Math.sin(minute / 7 + index) * 5).toFixed(2)),
        timestampQuality: index === 1 && minute % 17 === 0 ? "unknown" : "synchronized",
        measurementQuality: null
      });
    });
  }

  return {
    version: 1,
    source: "simulated",
    scenario,
    asOf,
    assets,
    measurements,
    incidents: deriveIncidents(assets, measurements)
  };
}

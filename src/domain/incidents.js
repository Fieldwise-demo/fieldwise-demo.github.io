export function deriveIncidents(assets, measurements) {
  const incidents = [];
  const open = new Map();
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));

  measurements.forEach((reading) => {
    const asset = assetById.get(reading.assetId);
    const observations = [
      ["temperature", reading.temperatureC, asset.thresholds.temperatureC],
      ["humidity", reading.humidityPercent, asset.thresholds.humidityPercent]
    ];
    observations.forEach(([field, value, bounds]) => {
      const violation = value < bounds.min
        ? ["below minimum", bounds.min]
        : value > bounds.max
          ? ["above maximum", bounds.max]
          : null;
      const key = `${reading.assetId}|${field}`;
      if (violation) {
        if (open.has(key)) {
          const item = incidents[open.get(key)];
          item.value = value;
          item.lastReceivedAt = reading.receivedAt;
          item.count += 1;
        } else {
          open.set(key, incidents.length);
          incidents.push({
            id: `DEMO-${String(incidents.length + 1).padStart(3, "0")}`,
            assetId: reading.assetId,
            field,
            value,
            threshold: violation[1],
            condition: violation[0],
            severity: "warning",
            status: "active",
            firstReceivedAt: reading.receivedAt,
            lastReceivedAt: reading.receivedAt,
            resolvedAt: null,
            count: 1
          });
        }
      } else if (open.has(key)) {
        const item = incidents[open.get(key)];
        item.status = "resolved";
        item.resolvedAt = reading.receivedAt;
        open.delete(key);
      }
    });
  });
  return incidents;
}

export function filterIncidents(items, status = "All", assetId = null) {
  return items.filter((item) =>
    (status === "All" || item.status === status.toLowerCase()) &&
    (!assetId || item.assetId === assetId)
  ).sort((a, b) => b.firstReceivedAt - a.firstReceivedAt);
}

export function latestMeasurement(measurements, assetId) {
  for (let index = measurements.length - 1; index >= 0; index -= 1) {
    if (measurements[index].assetId === assetId) return measurements[index];
  }
  return null;
}

export function getFreshness(reading, asOf, expectedIntervalSeconds) {
  if (!reading) return { status: "no-reports", ageSeconds: null };
  const ageSeconds = Math.floor((asOf - reading.receivedAt) / 1000);
  if (expectedIntervalSeconds == null) return { status: "unknown", ageSeconds };
  return {
    status: ageSeconds <= expectedIntervalSeconds * 3 ? "recent" : "stale",
    ageSeconds
  };
}

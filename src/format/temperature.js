export function convertTemperature(valueC, unit) {
  if (!Number.isFinite(valueC)) return null;
  if (unit === "°C") return valueC;
  if (unit === "°F") return valueC * 9 / 5 + 32;
  throw new TypeError("Unsupported temperature unit");
}

export function formatTemperature(valueC, unit) {
  const value = convertTemperature(valueC, unit);
  return value == null ? "—" : `${value.toFixed(1)} ${unit}`;
}

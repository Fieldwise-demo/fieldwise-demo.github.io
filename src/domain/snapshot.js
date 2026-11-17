export const SNAPSHOT_VERSION = 1;
export const SNAPSHOT_LIMITS = Object.freeze({
  assets: 100,
  measurements: 10000,
  measurementsPerAsset: 500,
  incidents: 500
});

const CONNECTIVITY = new Set(["connected", "disconnected", "unverified"]);
const TIMESTAMP_QUALITY = new Set(["synchronized", "unknown"]);
const INCIDENT_STATUS = new Set(["active", "resolved"]);
const INCIDENT_SEVERITY = new Set(["warning"]);
const INCIDENT_FIELD = new Set(["temperature", "humidity"]);
const INCIDENT_CONDITION = new Set(["below minimum", "above maximum"]);

function object(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return value;
}

function text(value, path) {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) {
    throw new TypeError(`${path} must be a non-empty string of at most 512 characters`);
  }
  return value;
}

function number(value, path, minimum = -Infinity) {
  if (!Number.isFinite(value) || value < minimum) {
    throw new TypeError(`${path} must be a finite number no smaller than ${minimum}`);
  }
  return value;
}

function positiveInteger(value, path) {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${path} must be a positive integer`);
  }
  return value;
}

function date(value, path, nullable = false) {
  if (value == null) {
    if (nullable) return null;
    throw new TypeError(`${path} must be a valid date`);
  }
  if (!(value instanceof Date) && typeof value !== "string") {
    throw new TypeError(`${path} must be a Date or ISO 8601 timestamp string`);
  }
  if (typeof value === "string") {
    if (value.length > 64) throw new TypeError(`${path} timestamp string is too long`);
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
    if (!match) throw new TypeError(`${path} must be a Date or ISO 8601 timestamp string`);
    const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone] = match;
    const year = Number(yearText), month = Number(monthText), day = Number(dayText);
    const hour = Number(hourText), minute = Number(minuteText), second = Number(secondText);
    const daysInMonth = [31, (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 29 : 28,
      31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
    if (!daysInMonth || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59) {
      throw new TypeError(`${path} must be a valid ISO 8601 timestamp`);
    }
    if (zone !== "Z") {
      const offset = /^([+-])(\d{2}):(\d{2})$/.exec(zone);
      const offsetHours = Number(offset[2]), offsetMinutes = Number(offset[3]);
      if (offsetHours > 14 || offsetMinutes > 59 || (offsetHours === 14 && offsetMinutes !== 0)) {
        throw new TypeError(`${path} must use a valid ISO 8601 timezone offset`);
      }
    }
  }
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new TypeError(`${path} must be a valid date`);
  return parsed;
}

function choice(value, values, path) {
  if (!values.has(value)) throw new TypeError(`${path} has an unsupported value`);
  return value;
}

function threshold(value, path) {
  if (value == null) return { min: null, max: null };
  const range = object(value, path);
  const min = range.min == null ? null : number(range.min, `${path}.min`);
  const max = range.max == null ? null : number(range.max, `${path}.max`);
  if (min !== null && max !== null && min >= max) {
    throw new TypeError(`${path} must have min less than max`);
  }
  return { min, max };
}

export function normalizeSnapshot(value) {
  const input = object(value, "snapshot");
  if (input.version !== SNAPSHOT_VERSION) {
    throw new TypeError(`snapshot.version must be ${SNAPSHOT_VERSION}`);
  }
  if (input.source !== "simulated" && input.source !== "external") {
    throw new TypeError("snapshot.source must be simulated or external");
  }
  if (!Array.isArray(input.assets) || !Array.isArray(input.measurements) || !Array.isArray(input.incidents)) {
    throw new TypeError("snapshot assets, measurements, and incidents must be arrays");
  }
  if (input.assets.length > SNAPSHOT_LIMITS.assets ||
      input.measurements.length > SNAPSHOT_LIMITS.measurements ||
      input.incidents.length > SNAPSHOT_LIMITS.incidents) {
    throw new RangeError("snapshot exceeds the supported asset, measurement, or incident limit");
  }

  const asOf = date(input.asOf, "snapshot.asOf");
  const assets = input.assets.map((item, index) => {
    const path = `snapshot.assets[${index}]`;
    const asset = object(item, path);
    const thresholds = object(asset.thresholds, `${path}.thresholds`);
    const connectivity = object(asset.connectivity, `${path}.connectivity`);
    const result = {
      id: text(asset.id, `${path}.id`),
      name: text(asset.name, `${path}.name`),
      site: text(asset.site, `${path}.site`),
      equipment: text(asset.equipment, `${path}.equipment`),
      expectedIntervalSeconds: asset.expectedIntervalSeconds == null
        ? null
        : number(asset.expectedIntervalSeconds, `${path}.expectedIntervalSeconds`, 1),
      thresholds: {
        temperatureC: threshold(thresholds.temperatureC, `${path}.thresholds.temperatureC`),
        humidityPercent: threshold(thresholds.humidityPercent, `${path}.thresholds.humidityPercent`)
      },
      connectivity: {
        status: choice(connectivity.status, CONNECTIVITY, `${path}.connectivity.status`)
      }
    };
    return result;
  });
  const assetIds = new Set(assets.map((asset) => asset.id));
  if (assetIds.size !== assets.length) throw new TypeError("snapshot asset ids must be unique");

  const measurementCounts = new Map();
  const measurements = input.measurements.map((item, index) => {
    const path = `snapshot.measurements[${index}]`;
    const reading = object(item, path);
    const receivedAt = date(reading.receivedAt, `${path}.receivedAt`);
    if (receivedAt > asOf) throw new TypeError(`${path}.receivedAt cannot be after snapshot.asOf`);
    if (!assetIds.has(reading.assetId)) throw new TypeError(`${path}.assetId is not in snapshot.assets`);
    const count = (measurementCounts.get(reading.assetId) || 0) + 1;
    if (count > SNAPSHOT_LIMITS.measurementsPerAsset) {
      throw new RangeError(`${path} exceeds the per-asset measurement limit`);
    }
    measurementCounts.set(reading.assetId, count);
    return {
      sourceOrder: index,
      assetId: text(reading.assetId, `${path}.assetId`),
      measurementTime: date(reading.measurementTime, `${path}.measurementTime`, true),
      receivedAt,
      temperatureC: number(reading.temperatureC, `${path}.temperatureC`),
      humidityPercent: number(reading.humidityPercent, `${path}.humidityPercent`),
      timestampQuality: choice(reading.timestampQuality, TIMESTAMP_QUALITY, `${path}.timestampQuality`),
      measurementQuality: reading.measurementQuality == null
        ? null
        : text(reading.measurementQuality, `${path}.measurementQuality`)
    };
  }).sort((left, right) =>
    left.receivedAt.getTime() - right.receivedAt.getTime() || left.sourceOrder - right.sourceOrder
  ).map(({ sourceOrder, ...reading }) => reading);

  const incidents = input.incidents.map((item, index) => {
    const path = `snapshot.incidents[${index}]`;
    const incident = object(item, path);
    if (!assetIds.has(incident.assetId)) throw new TypeError(`${path}.assetId is not in snapshot.assets`);
    const firstReceivedAt = date(incident.firstReceivedAt, `${path}.firstReceivedAt`);
    const lastReceivedAt = date(incident.lastReceivedAt, `${path}.lastReceivedAt`);
    const resolvedAt = date(incident.resolvedAt, `${path}.resolvedAt`, true);
    const status = choice(incident.status, INCIDENT_STATUS, `${path}.status`);
    if ((status === "resolved") !== (resolvedAt !== null)) {
      throw new TypeError(`${path}.resolvedAt must match its status`);
    }
    if (firstReceivedAt > asOf || lastReceivedAt > asOf || (resolvedAt && resolvedAt > asOf) ||
        lastReceivedAt < firstReceivedAt || (resolvedAt && resolvedAt < lastReceivedAt)) {
      throw new TypeError(`${path} incident times are inconsistent`);
    }
    return {
      id: text(incident.id, `${path}.id`),
      assetId: text(incident.assetId, `${path}.assetId`),
      field: choice(incident.field, INCIDENT_FIELD, `${path}.field`),
      value: number(incident.value, `${path}.value`),
      threshold: number(incident.threshold, `${path}.threshold`),
      condition: choice(incident.condition, INCIDENT_CONDITION, `${path}.condition`),
      severity: choice(incident.severity, INCIDENT_SEVERITY, `${path}.severity`),
      status,
      firstReceivedAt,
      lastReceivedAt,
      resolvedAt,
      count: positiveInteger(incident.count, `${path}.count`)
    };
  });
  if (new Set(incidents.map((incident) => incident.id)).size !== incidents.length) {
    throw new TypeError("snapshot incident ids must be unique");
  }

  return {
    version: SNAPSHOT_VERSION,
    source: input.source,
    scenario: text(input.scenario, "snapshot.scenario"),
    asOf,
    assets,
    measurements,
    incidents
  };
}

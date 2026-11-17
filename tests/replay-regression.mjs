import { createDemoProvider } from "../src/data/demo-provider.js";
import { createSnapshotLoader } from "../src/data/provider.js";
import { deriveIncidents, filterIncidents, getFreshness, latestMeasurement } from "../src/domain/incidents.js";
import { SNAPSHOT_LIMITS, SNAPSHOT_VERSION, normalizeSnapshot } from "../src/domain/snapshot.js";
import { formatDateTime } from "../src/format/date-time.js";
import { convertTemperature, convertTemperatureDifference } from "../src/format/temperature.js";
import { createAppController } from "../src/app-controller.js";
import { escapeHtml } from "../src/views/html.js";
import { renderChart } from "../src/views/chart.js";
import { renderView } from "../src/views/render.js";

let assertionCount = 0;
let nonDomAssertionCount = 0;
let domAssertionCount = 0;
function assert(condition, message, category = "nonDom") {
  assertionCount += 1;
  if (category === "dom") domAssertionCount += 1;
  else nonDomAssertionCount += 1;
  if (!condition) throw new Error(message);
}

function assertThrows(callback, message) {
  let threw = false;
  try {
    callback();
  } catch {
    threw = true;
  }
  assert(threw, message);
}

export async function runReplayRegression() {
  assertionCount = 0;
  nonDomAssertionCount = 0;
  domAssertionCount = 0;
  const provider = createDemoProvider();
  const loader = createSnapshotLoader(provider);
  let replayCases = 0;
  for (const scenario of ["Refrigeration", "Building environment"]) {
    for (let stage = 24; stage <= 60; stage += 1) {
      const request = { scenario, stage };
      const [first, second] = await Promise.all([loader.load(request), loader.load(request)]);
      assert(first.status === "stale", "Superseded replay must not publish");
      assert(second.status === "success", "Current replay should load");
      const snapshot = second.snapshot;
      assert(snapshot.version === SNAPSHOT_VERSION, "Snapshot version");
      assert(snapshot.source === "simulated", "Simulation source marker");
      assert(snapshot.assets.length === 3, "Asset count");
      assert(snapshot.asOf instanceof Date, "Snapshot clock normalization");
      assert(snapshot.measurements.every((reading) => reading.receivedAt instanceof Date), "Receipt timestamp normalization");
      assert(snapshot.measurements.every((reading) => reading.measurementTime === null), "Unavailable measurement times remain unknown");
      assert(snapshot.measurements.every((reading) => reading.measurementQuality === null), "Unavailable quality remains unknown");
      assert(snapshot.assets.every((asset) => asset.connectivity.status === "unverified"), "Unverified connectivity remains distinct");
      assert(snapshot.incidents.every((incident) => incident.count >= 1 &&
        (incident.status !== "resolved" || incident.resolvedAt instanceof Date)), "Incident lifecycle");
      assert(filterIncidents(snapshot.incidents, "Active").every((incident) => incident.status === "active"), "Active incident filter");
      assert(filterIncidents(snapshot.incidents, "Resolved").every((incident) => incident.status === "resolved"), "Resolved incident filter");
      const repeated = await provider.loadSnapshot(request);
      assert(JSON.stringify(snapshot) === JSON.stringify(normalizeSnapshot(repeated)), "Deterministic replay");
      if (stage === 60) {
        assert(filterIncidents(snapshot.incidents, "Active").length === 1, "Final active incident count");
        assert(filterIncidents(snapshot.incidents, "Resolved").length === 1, "Final resolved incident count");
      }
      replayCases += 1;
    }
  }

  const lifecycleAsset = {
    id: "lifecycle-test",
    thresholds: {
      temperatureC: { min: 0, max: 10 },
      humidityPercent: { min: 0, max: 100 }
    }
  };
  const lifecycleReading = (minute, temperatureC) => ({
    assetId: lifecycleAsset.id,
    receivedAt: new Date(Date.UTC(2026, 0, 1, 0, minute)),
    temperatureC,
    humidityPercent: 50
  });
  const aboveToBelow = deriveIncidents([lifecycleAsset], [
    lifecycleReading(0, 12),
    lifecycleReading(1, 11),
    lifecycleReading(2, -2)
  ]);
  const [aboveIncident, belowIncident] = aboveToBelow;
  assert(aboveToBelow.length === 2, "Opposite-direction excursions create separate incidents");
  assert(aboveIncident.id === "DEMO-001" && aboveIncident.condition === "above maximum" &&
    aboveIncident.threshold === 10 && aboveIncident.count === 2 && aboveIncident.value === 11 &&
    aboveIncident.status === "resolved" &&
    aboveIncident.firstReceivedAt.getTime() === lifecycleReading(0, 12).receivedAt.getTime() &&
    aboveIncident.lastReceivedAt.getTime() === lifecycleReading(1, 11).receivedAt.getTime() &&
    aboveIncident.resolvedAt.getTime() === lifecycleReading(2, -2).receivedAt.getTime(),
  "Above-to-below transition preserves the first lifecycle and closes it at the transition");
  assert(belowIncident.id === "DEMO-002" && belowIncident.condition === "below minimum" &&
    belowIncident.threshold === 0 && belowIncident.value === -2 && belowIncident.count === 1 &&
    belowIncident.status === "active" &&
    belowIncident.firstReceivedAt.getTime() === lifecycleReading(2, -2).receivedAt.getTime() &&
    belowIncident.lastReceivedAt.getTime() === lifecycleReading(2, -2).receivedAt.getTime() &&
    belowIncident.resolvedAt === null,
  "New below-minimum lifecycle starts at the transition with its own threshold");

  const belowToAbove = deriveIncidents([lifecycleAsset], [
    lifecycleReading(0, -2),
    lifecycleReading(1, -1),
    lifecycleReading(2, 12)
  ]);
  assert(belowToAbove.length === 2 && belowToAbove[0].condition === "below minimum" &&
    belowToAbove[0].count === 2 && belowToAbove[0].threshold === 0 &&
    belowToAbove[0].status === "resolved" &&
    belowToAbove[0].lastReceivedAt.getTime() === lifecycleReading(1, -1).receivedAt.getTime() &&
    belowToAbove[0].resolvedAt.getTime() === lifecycleReading(2, 12).receivedAt.getTime() &&
    belowToAbove[1].condition === "above maximum" && belowToAbove[1].threshold === 10 &&
    belowToAbove[1].count === 1 && belowToAbove[1].status === "active" &&
    belowToAbove[1].firstReceivedAt.getTime() === lifecycleReading(2, 12).receivedAt.getTime(),
  "Below-to-above transition splits lifecycles and retains each direction's threshold");

  const afterInRange = deriveIncidents([lifecycleAsset], [
    lifecycleReading(0, 12),
    lifecycleReading(1, 5),
    lifecycleReading(2, 12)
  ]);
  assert(afterInRange.length === 2 && afterInRange[0].status === "resolved" &&
    afterInRange[0].resolvedAt.getTime() === lifecycleReading(1, 5).receivedAt.getTime() &&
    afterInRange[1].status === "active" && afterInRange[1].count === 1 &&
    afterInRange[1].firstReceivedAt.getTime() === lifecycleReading(2, 12).receivedAt.getTime(),
  "An in-range reading resolves an excursion before a later incident starts");

  const missingBoundsAsset = {
    ...lifecycleAsset,
    thresholds: {
      temperatureC: { min: null, max: undefined },
      humidityPercent: { min: undefined, max: null }
    }
  };
  assert(deriveIncidents([missingBoundsAsset], [
    lifecycleReading(0, -2),
    lifecycleReading(1, 12)
  ]).length === 0, "Missing threshold bounds do not create incidents");

  const minOnlyAsset = {
    ...lifecycleAsset,
    thresholds: {
      temperatureC: { min: 0, max: null },
      humidityPercent: { min: null, max: null }
    }
  };
  const minOnly = deriveIncidents([minOnlyAsset], [
    lifecycleReading(0, -2),
    lifecycleReading(1, 2)
  ]);
  assert(minOnly.length === 1 && minOnly[0].condition === "below minimum" &&
    minOnly[0].status === "resolved" &&
    minOnly[0].resolvedAt.getTime() === lifecycleReading(1, 2).receivedAt.getTime(),
  "A minimum-only threshold reports only below-minimum violations");

  const maxOnlyAsset = {
    ...lifecycleAsset,
    thresholds: {
      temperatureC: { min: undefined, max: 10 },
      humidityPercent: { min: null, max: null }
    }
  };
  const maxOnly = deriveIncidents([maxOnlyAsset], [
    lifecycleReading(0, 12),
    lifecycleReading(1, -2)
  ]);
  assert(maxOnly.length === 1 && maxOnly[0].condition === "above maximum" &&
    maxOnly[0].status === "resolved" &&
    maxOnly[0].resolvedAt.getTime() === lifecycleReading(1, -2).receivedAt.getTime(),
  "A maximum-only threshold reports only above-maximum violations");

  for (const [firstValue, nextValue, firstCondition, nextCondition] of [
    [12, -2, "above maximum", "below minimum"],
    [-2, 12, "below minimum", "above maximum"]
  ]) {
    const sameTime = new Date(Date.UTC(2026, 0, 1, 1));
    const events = deriveIncidents([lifecycleAsset], [
      { ...lifecycleReading(0, firstValue), receivedAt: sameTime },
      { ...lifecycleReading(0, nextValue), receivedAt: sameTime }
    ]);
    assert(events.length === 2 && events[0].condition === firstCondition &&
      events[0].status === "resolved" && events[0].resolvedAt.getTime() === sameTime.getTime() &&
      events[1].condition === nextCondition && events[1].status === "active" &&
      events[1].firstReceivedAt.getTime() === sameTime.getTime() &&
      events[0].id !== events[1].id,
    "Equal-time direction changes follow source order and retain unique lifecycles");
  }

  const sample = await provider.loadSnapshot({ scenario: "Refrigeration", stage: 60 });
  const serializedSample = JSON.stringify(sample);
  const restoredSample = normalizeSnapshot(JSON.parse(serializedSample));
  assert(JSON.stringify(restoredSample) === serializedSample,
    "A synthetic snapshot survives complete JSON serialization and normalization");
  for (const timestamp of [
    "2027-01-02T03:04:05Z",
    "2027-01-02T03:04:05.125Z",
    "2027-01-02T08:34:05+05:30",
    "2027-01-01T23:04:05.5-04:00"
  ]) {
    const parsedSnapshot = normalizeSnapshot({
      ...sample,
      asOf: timestamp,
      measurements: sample.measurements.map((reading, index) =>
        index ? reading : { ...reading, receivedAt: timestamp })
    });
    const expectedTime = new Date(timestamp).getTime();
    assert(parsedSnapshot.asOf.getTime() === expectedTime &&
      parsedSnapshot.measurements.some((reading) => reading.receivedAt.getTime() === expectedTime),
    `ISO timestamp with timezone form ${timestamp} is accepted`);
  }
  const firstReading = sample.measurements.find((reading) => reading.assetId === sample.assets[0].id);
  const earlier = new Date(sample.asOf.getTime() - 120000);
  const tied = new Date(sample.asOf.getTime() - 60000);
  const shuffled = normalizeSnapshot({
    ...sample,
    measurements: [
      { ...firstReading, receivedAt: tied, temperatureC: 31, measurementTime: new Date(tied.getTime() - 1000) },
      { ...firstReading, receivedAt: earlier, temperatureC: 12, measurementTime: new Date(tied.getTime() + 1000) },
      { ...firstReading, receivedAt: tied, temperatureC: 22, measurementTime: new Date(tied.getTime() + 1000) },
      { ...firstReading, receivedAt: tied, temperatureC: 33, measurementTime: null }
    ]
  });
  assert(shuffled.measurements.every((reading, index, list) =>
    index === 0 || list[index - 1].receivedAt <= reading.receivedAt), "Measurements normalize to ascending receipt time");
  assert(shuffled.measurements.slice(1).map((reading) => reading.temperatureC).join(",") === "31,22,33",
    "Equal receipt times preserve input order");
  assert(latestMeasurement(shuffled.measurements, sample.assets[0].id).temperatureC === 33,
    "Latest measurement uses the last source-ordered reading at an equal receipt time");
  assert(shuffled.measurements[0].measurementTime > shuffled.measurements[1].measurementTime,
    "Sorting uses receipt time without conflating the measurement clock");

  assertThrows(() => normalizeSnapshot({ ...sample, asOf: sample.asOf.getTime() }),
    "Numeric timestamps are rejected");
  assertThrows(() => normalizeSnapshot({
    ...sample, asOf: "2026-02-30T00:00:00Z"
  }), "Impossible ISO calendar dates are rejected");
  assertThrows(() => normalizeSnapshot({
    ...sample, asOf: "2026-01-01T00:00:00+15:00"
  }), "Out-of-range ISO timezone offsets are rejected");
  assertThrows(() => normalizeSnapshot({
    ...sample, asOf: "2026-01-01T00:00:00+01:60"
  }), "Invalid ISO timezone offset minutes are rejected");
  assertThrows(() => normalizeSnapshot({
    ...sample, asOf: "2026-01-01T00:00:00." + "1".repeat(64) + "Z"
  }), "Overlong ISO timestamp strings are rejected");
  assertThrows(() => normalizeSnapshot({
    ...sample,
    measurements: sample.measurements.map((reading, index) =>
      index ? reading : { ...reading, receivedAt: true })
  }), "Non-string, non-Date receipt timestamps are rejected");
  assertThrows(() => normalizeSnapshot({
    ...sample,
    measurements: sample.measurements.map((reading, index) =>
      index ? reading : { ...reading, measurementTime: [] })
  }), "Invalid measurement timestamp types are rejected");
  assertThrows(() => normalizeSnapshot({
    ...sample,
    incidents: sample.incidents.map((incident, index) => index
      ? incident
      : { ...incident, lastReceivedAt: new Date(sample.asOf.getTime() + 1) })
  }), "Incident receipt chronology cannot exceed snapshot.asOf");
  const resolvedIndex = sample.incidents.findIndex((incident) => incident.status === "resolved");
  assertThrows(() => normalizeSnapshot({
    ...sample,
    incidents: sample.incidents.map((incident, index) => index === resolvedIndex
      ? { ...incident, resolvedAt: new Date(sample.asOf.getTime() + 1) }
      : incident)
  }), "Incident resolution chronology cannot exceed snapshot.asOf");

  const atAssetLimit = normalizeSnapshot({
    ...sample,
    measurements: Array.from({ length: SNAPSHOT_LIMITS.measurementsPerAsset }, () => firstReading)
  });
  assert(atAssetLimit.measurements.length === SNAPSHOT_LIMITS.measurementsPerAsset,
    "Per-asset display limit is inclusive");
  assertThrows(() => normalizeSnapshot({
    ...sample,
    measurements: Array.from({ length: SNAPSHOT_LIMITS.measurementsPerAsset + 1 }, () => firstReading)
  }), "Per-asset display limit is enforced");
  assertThrows(() => normalizeSnapshot({
    ...sample,
    measurements: Array.from({ length: SNAPSHOT_LIMITS.measurements + 1 }, () => firstReading)
  }), "Snapshot measurement limit is enforced");
  assertThrows(() => normalizeSnapshot({
    ...sample,
    assets: Array.from({ length: SNAPSHOT_LIMITS.assets + 1 }, (_, index) => ({
      ...sample.assets[0], id: `asset-${index}`
    }))
  }), "Snapshot asset limit is enforced");
  assertThrows(() => normalizeSnapshot({
    ...sample,
    incidents: Array.from({ length: SNAPSHOT_LIMITS.incidents + 1 }, () => sample.incidents[0])
  }), "Snapshot incident limit is enforced");

  assert(convertTemperature(0, "°F") === 32, "Fahrenheit conversion");
  assert(convertTemperature(0, "°C") === 0, "Celsius conversion");
  assert(convertTemperatureDifference(1, "°F") === 1.8, "Temperature differences scale without an offset");
  assert(convertTemperatureDifference(-1, "°F") === -1.8, "Negative temperature differences scale correctly");
  assertThrows(() => convertTemperature(0, "K"), "Unsupported unit should fail");
  assertThrows(() => normalizeSnapshot({ version: SNAPSHOT_VERSION + 1 }), "Unsupported snapshot version should fail");
  assertThrows(() => normalizeSnapshot({ ...sample, asOf: null }), "Missing snapshot time should fail");
  const malformedCount = {
    ...sample,
    incidents: sample.incidents.map((incident, index) => index ? incident : { ...incident, count: 1.5 })
  };
  assertThrows(() => normalizeSnapshot(malformedCount), "Fractional incident count should fail");
  const partialData = normalizeSnapshot({
    ...sample,
    source: "external",
    assets: sample.assets.map((asset) => ({
      ...asset,
      expectedIntervalSeconds: null,
      thresholds: { temperatureC: null, humidityPercent: null }
    }))
  });
  assert(partialData.assets[0].thresholds.temperatureC.min === null, "Missing thresholds remain missing");
  assert(getFreshness(latestMeasurement(partialData.measurements, partialData.assets[0].id), partialData.asOf, null).status === "unknown",
    "Freshness is unknown without an expected interval");
  assert(renderView(partialData, {
    view: "Asset Detail", asset: partialData.assets[0].id, unit: "°C", timezone: "UTC"
  }).includes("Not provided"), "Missing thresholds are not fabricated in Asset Detail");
  assert(renderView(partialData, {
    view: "Device Health", unit: "°C", timezone: "UTC"
  }).includes("FRESHNESS UNKNOWN"), "Missing intervals remain unclassified in Device Health");
  const insightDelta = sample.measurements.filter((reading) => reading.assetId === sample.assets[0].id);
  const deltaC = insightDelta.at(-1).temperatureC - insightDelta[0].temperatureC;
  const insightsF = renderView(sample, { view: "Insights", unit: "°F", timezone: "UTC" });
  const deltaF = convertTemperatureDifference(deltaC, "°F").toFixed(2) + " °F across";
  assert(insightsF.includes(`temperature changed ${deltaF}`), "Insights apply the selected temperature unit");
  assert(!insightsF.includes("temperature changed " + deltaC.toFixed(2) + " °C"),
    "Fahrenheit insights do not retain Celsius temperature changes");

  const chartRows = [0, 1, 10].map((hours) => ({
    ...firstReading,
    receivedAt: new Date(sample.asOf.getTime() - (10 - hours) * 3600000)
  }));
  const chart = renderChart(chartRows, sample.assets[0], "temperature", { unit: "°C", timezone: "UTC" });
  const chartXs = [...chart.matchAll(/<circle[^>]*cx="([\d.]+)"/g)].map((match) => Number(match[1]));
  assert(chartXs.length === 3 && Math.abs(chartXs[0] - 56) < 0.01 &&
    Math.abs(chartXs[1] - 138) < 0.01 && Math.abs(chartXs[2] - 876) < 0.01,
  "Chart positions use elapsed receipt time for irregular samples");
  assertThrows(() => renderChart(
    Array.from({ length: SNAPSHOT_LIMITS.measurementsPerAsset + 1 }, () => firstReading),
    sample.assets[0], "temperature", { unit: "°C", timezone: "UTC" }
  ), "Chart enforces its per-asset display limit");

  const providerText = "<img src=x onerror=alert(1)>";
  const hostileSnapshot = normalizeSnapshot({
    ...sample,
    assets: sample.assets.map((asset, index) => index ? asset : {
      ...asset, name: providerText, site: providerText, equipment: providerText, id: "demo-1"
    })
  });
  const hostileView = renderView(hostileSnapshot, {
    view: "Asset Detail", asset: "demo-1", unit: "°C", timezone: "UTC"
  });
  assert(!hostileView.includes(providerText) && hostileView.includes("&lt;img"), "Provider text is HTML-escaped in views");
  if (typeof document !== "undefined") {
    const template = document.createElement("template");
    template.innerHTML = hostileView;
    assert(!template.content.querySelector("img"), "Provider text cannot create markup", "dom");

    const emptySnapshot = normalizeSnapshot({
      version: SNAPSHOT_VERSION,
      source: "external",
      scenario: "Workspace",
      asOf: sample.asOf,
      assets: [],
      measurements: [],
      incidents: []
    });
    assert(renderView(emptySnapshot, {
      view: "Asset Detail", asset: "none", unit: "°C", timezone: "UTC"
    }).includes("No assets are available"), "Empty provider result renders explicitly", "dom");

    const documentRef = document.implementation.createHTMLDocument("provider failure test");
    documentRef.body.innerHTML = `
      <p id="view-status"></p><aside id="sidebar"><nav id="nav"></nav>
      <select id="scenario"><option value="Refrigeration">Refrigeration</option></select>
      <input id="stage" value="60"><output id="stage-name"></output>
      <button data-unit="°C"></button><button data-unit="°F"></button>
      <select id="timezone"><option value="UTC">UTC</option></select></aside>
      <button id="mobile-menu"></button><div id="mobile-backdrop" hidden></div>
      <main id="main-content"><div id="app"></div></main>
      <button id="contact-open"></button><dialog id="contact-dialog">
      <form id="contact-form"><div id="contact-status"></div><button id="contact-close"></button>
      <button id="contact-cancel"></button><button id="contact-submit"></button></form></dialog>`;
    let failedRequests = 0;
    const errorController = createAppController({
      provider: { async loadSnapshot() { failedRequests += 1; throw new Error("offline"); } },
      documentRef,
      windowRef: { matchMedia: () => ({ matches: false, addEventListener() {} }) }
    });
    errorController.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert(documentRef.querySelector("#app [role=alert]")?.textContent.includes("unavailable"),
      "Provider error is visible in the controller", "dom");
    assert(!documentRef.querySelector("#app").textContent.includes("Walk-in cooler"),
      "Provider error does not fall back to demo data", "dom");
    documentRef.querySelector("#retry-load").click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert(failedRequests === 2, "Retry calls the same provider", "dom");
    errorController.dispose();

    const dialog = documentRef.querySelector("#contact-dialog");
    let dialogOpenCalls = 0;
    dialog.showModal = () => { dialogOpenCalls += 1; dialog.open = true; };
    dialog.close = () => { dialog.open = false; };
    const mediaQuery = new EventTarget();
    mediaQuery.matches = false;
    mediaQuery.addListener = () => {};
    mediaQuery.removeListener = () => {};
    const lifecycleController = createAppController({
      provider,
      documentRef,
      windowRef: { matchMedia: () => mediaQuery }
    });
    lifecycleController.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert(documentRef.querySelectorAll("#nav button").length === 5,
      "Controller start adds the five navigation buttons", "dom");
    lifecycleController.state.view = "Unsupported view";
    await lifecycleController.render();
    assert(documentRef.querySelector("#app [role=alert]")?.textContent.includes("unavailable") &&
      !documentRef.querySelector("#app").hasAttribute("aria-busy"),
    "Rendering failures use the error UI and clear the busy state", "dom");
    const detachedButton = documentRef.querySelector("#nav button");
    lifecycleController.dispose();
    assert(documentRef.querySelectorAll("#nav button").length === 0 &&
      !documentRef.querySelector("#sidebar").inert &&
      !documentRef.querySelector("#main-content").inert,
    "Controller disposal removes navigation and restores inert state", "dom");
    detachedButton.click();
    mediaQuery.matches = true;
    mediaQuery.dispatchEvent(new Event("change"));
    documentRef.querySelector("#contact-open").click();
    assert(lifecycleController.state.view === "Unsupported view" && dialogOpenCalls === 0 &&
      !documentRef.querySelector("#sidebar").inert,
      "Disposed controller and contact handlers no longer respond", "dom");
  }
  assert(escapeHtml(`<script title="x">&'`) === "&lt;script title=&quot;x&quot;&gt;&amp;&#39;", "Provider text escaping");
  const summer = new Date("2026-07-15T13:00:00Z");
  assert(formatDateTime(summer, "America/New_York").endsWith("EDT"), "Timezone observes daylight-saving time");
  assert(formatDateTime(summer, "UTC").endsWith("UTC"), "UTC formatting");

  const failingLoader = createSnapshotLoader({ async loadSnapshot() { throw new Error("offline"); } });
  const failure = await failingLoader.load({});
  assert(failure.status === "error" && failure.error.message === "offline", "Provider failure remains explicit");
  const invalidLoader = createSnapshotLoader({ async loadSnapshot() { return { ...sample, version: 99 }; } });
  assert((await invalidLoader.load({})).status === "error", "Invalid provider response remains explicit");

  let releaseFirst;
  const slowProvider = {
    loadSnapshot(request) {
      return request.id === 1
        ? new Promise((resolve) => { releaseFirst = resolve; })
        : Promise.resolve(sample);
    }
  };
  const slowLoader = createSnapshotLoader(slowProvider);
  const first = slowLoader.load({ id: 1 });
  const current = slowLoader.load({ id: 2 });
  assert((await current).status === "success", "Latest response should publish");
  releaseFirst(sample);
  assert((await first).status === "stale", "Late response must not replace latest data");

  return {
    replayCases,
    assertions: assertionCount,
    nonDomAssertions: nonDomAssertionCount,
    domAssertions: domAssertionCount,
    passed: true
  };
}

if (typeof process !== "undefined" && process.versions?.node) {
  console.log(await runReplayRegression());
}

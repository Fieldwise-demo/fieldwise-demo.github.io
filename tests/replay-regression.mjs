import { createDemoProvider } from "../src/data/demo-provider.js";
import { createSnapshotLoader } from "../src/data/provider.js";
import { filterIncidents, getFreshness, latestMeasurement } from "../src/domain/incidents.js";
import { SNAPSHOT_VERSION, normalizeSnapshot } from "../src/domain/snapshot.js";
import { formatDateTime } from "../src/format/date-time.js";
import { convertTemperature } from "../src/format/temperature.js";
import { createAppController } from "../src/app-controller.js";
import { escapeHtml } from "../src/views/html.js";
import { renderView } from "../src/views/render.js";

let assertionCount = 0;
function assert(condition, message) {
  assertionCount += 1;
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

  const sample = await provider.loadSnapshot({ scenario: "Refrigeration", stage: 60 });
  assert(convertTemperature(0, "°F") === 32, "Fahrenheit conversion");
  assert(convertTemperature(0, "°C") === 0, "Celsius conversion");
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
    assert(!template.content.querySelector("img"), "Provider text cannot create markup");

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
    }).includes("No assets are available"), "Empty provider result renders explicitly");

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
      "Provider error is visible in the controller");
    assert(!documentRef.querySelector("#app").textContent.includes("Walk-in cooler"),
      "Provider error does not fall back to demo data");
    documentRef.querySelector("#retry-load").click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert(failedRequests === 2, "Retry calls the same provider");
    errorController.dispose();
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

  return { replayCases, unitChecks: 2, assertions: assertionCount, passed: true };
}

if (typeof process !== "undefined" && process.versions?.node) {
  console.log(await runReplayRegression());
}

// Dependency-free data regression checks; does not simulate DOM or browser layout.
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");
new Function(source); // Parse the complete application without executing DOM code.
const domain = source.slice(source.indexOf("  const STAGES"), source.indexOf("  const app ="))
  + source.slice(source.indexOf("  function escape("), source.indexOf("  function metric("));
const result = new Function(domain + `
let cases = 0;
for (const scenario of ["Refrigeration", "Building environment"]) {
  state.scenario = scenario;
  for (let stage = 24; stage <= 60; stage++) {
    state.stage = stage;
    const a = buildData(), b = buildData();
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error("Nondeterministic replay");
    if (a.assets.length !== 3) throw new Error("Asset count");
    if (a.incidents.some(i => i.count < 1 || (i.status === "resolved" && !i.resolved))) throw new Error("Invalid lifecycle");
    if (incidents(a, "Active").some(i => i.status !== "active")) throw new Error("Active filter");
    if (incidents(a, "Resolved").some(i => i.status !== "resolved")) throw new Error("Resolved filter");
    if (stage === 60 && (incidents(a, "Active").length !== 1 || incidents(a, "Resolved").length !== 1)) throw new Error("Final incidents");
    cases++;
  }
}
state.unit = "°F"; if (toTemp(0) !== 32) throw new Error("Fahrenheit conversion");
state.unit = "°C"; if (toTemp(0) !== 0) throw new Error("Celsius conversion");
return { replayScenarioCases: cases, unitChecks: 2, passed: true };
`)();
console.log(result);

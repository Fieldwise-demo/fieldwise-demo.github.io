# Release 2.1 audit remediation evidence

The original review brief marked the overall audit **FAIL** and supplied the findings below, but did not include per-finding severity labels. Severity values are therefore recorded as **not supplied** rather than inferred.

## Findings

### F01 — Stable reading order

- **Original finding:** Normalize readings in stable ascending receipt-time order. Define equal-time semantics and add shuffled/equal-time regression cases.
- **Disposition:** Implemented. `normalizeSnapshot` sorts by receipt time and retains input order for ties; `latestMeasurement` uses the last item in that normalized order.
- **Evidence:** `tests/replay-regression.mjs` covers shuffled receipts, tied timestamps, source order, latest-reading selection, and distinct measurement-clock ordering. Both complete browser runs passed.

### F02 — Timestamp validity and chronology

- **Original finding:** Reject invalid timestamp types and impossible incident chronology relative to `snapshot.asOf`. Preserve the distinction between receipt timestamps and measurement clocks.
- **Disposition:** Implemented. The ISO parser now reads the timezone capture rather than the unmatched group after the non-capturing fractional-seconds expression. Type, calendar, offset, and chronology checks remain enforced.
- **Evidence:** Before correction, normalizing a minimal snapshot with `asOf: "2026-01-01T00:00:00Z"` threw `TypeError: Cannot read properties of null (reading '2')`. After correction, focused checks accepted `Z`, fractional-second, positive-offset, and negative-offset forms; rejected impossible dates and invalid offsets; and passed a complete synthetic snapshot JSON serialize/parse/normalize round trip. Existing tests also cover invalid timestamp types, chronology limits, and keeping receipt time separate from measurement time.

### F03 — Chart bounds, snapshot/display limits, and render errors

- **Original finding:** Replace spread-based chart extrema, enforce reasonable snapshot/display limits, and surface rendering failures through the existing error UI.
- **Disposition:** Implemented in `src/views/chart.js`, `src/domain/snapshot.js`, and the controller/render error path. Snapshot limits are 100 assets, 10,000 measurements, 500 measurements per asset, and 500 incidents; charts enforce the per-asset display limit.
- **Evidence:** Replay regressions cover inclusive and exceeded limits, irregular chart timing, and visible render failure behavior. Both browser suites passed.
- **Accepted limitation:** Extremely large finite numeric inputs can overflow chart range calculations and produce invalid SVG coordinates.
- **Release scope:** Fixed, bounded synthetic scenarios only. The two included profiles keep values within ordinary ranges and do not exhibit the overflow.
- **Future requirement:** Add numeric range validation before accepting arbitrary external sensor data. This checkpoint does not redesign the chart engine or establish external-provider engineering ranges.

### F04 — Controller disposal

- **Original finding:** Clean up event listeners, navigation elements, and contact handlers during controller disposal.
- **Disposition:** Implemented in `src/app-controller.js` and `src/contact-form.js`; disposal removes generated navigation controls/listeners and restores inert state.
- **Evidence:** DOM regressions verify navigation removal, inert-state restoration, and that disposed navigation/contact handlers no longer respond. Both complete browser runs passed.

### F05 — Opposite-direction incident excursions

- **Original finding:** Investigate opposite-direction incident excursions. Document a proposed behavior and tests, but request approval before changing incident semantics.
- **Disposition:** The user subsequently approved the split-lifecycle proposal. `src/domain/incidents.js` resolves the current incident at an opposite-direction observation's receipt time and starts a distinct incident at that time. Same-direction readings continue aggregating; in-range readings retain the existing resolution behavior.
- **Evidence:** Regressions cover both direction changes, repeated same-direction readings, in-range reset, equal-time source order, unique IDs, thresholds, counts, and lifecycle timestamps. Both replay runs passed.

### F06 — Reproducible browser evidence

- **Original finding:** Establish a tracked, reproducible browser test harness. Document runtime, dependencies, commands, and actual assertion counts; distinguish non-DOM from browser interaction tests; do not report skipped checks as executed.
- **Disposition:** The dependency-free harness and instructions are present in `tests/browser-regression.html`, `tests/browser-regression.js`, and `README.md`. Both root and repository-subpath runs are reproducible locally; the browser test files are included in this Release 2.1 checkpoint.
- **Evidence:** Each final run executed the replay regression twice and confirmed stable category counts: 74 replay cases per invocation; 2,194 non-DOM assertions and 18 DOM assertions across both invocations; 46 browser interaction assertions; 2,258 assertions total; zero skipped checks with reduced motion emulated. Both hosting paths passed without console errors, page errors, or failed requests. Responsive overflow checks passed for all five views at 320, 390, 768, and 1440 pixels. A previous audit run recorded conditional 304 responses for `index.html`, `src/main.js`, and `styles.css`; cache revalidation was not repeated for this bounded patch.

### F07 — Contact request lifecycle

- **Original finding:** Add contact request timeout, safe cancellation, and protection against stale responses after close/reopen.
- **Disposition:** Implemented in `src/contact-form.js`.
- **Evidence:** Browser checks cover Escape cancellation, an aborted request, a stale response after reopening, timeout announcement, restored submit state, and disposal. Tests use an injected local mock; the live contact form was not submitted.

### F08 — Insight temperature units

- **Original finding:** Make Insights temperature units consistent, including correct conversion of temperature differences.
- **Disposition:** Implemented in `src/format/temperature.js` and `src/views/insights.js`; differences are scaled without applying an absolute-temperature offset.
- **Evidence:** Replay assertions and browser interaction checks verify Fahrenheit insight deltas and unit switching. Both final runs passed.

### F09 — Elapsed-time chart positions

- **Original finding:** Use elapsed receipt time for chart positions rather than sample index.
- **Disposition:** Implemented in `src/views/chart.js`.
- **Evidence:** Irregularly spaced readings are checked against expected chart x-coordinates in `tests/replay-regression.mjs`; the complete browser suites passed.

## Final verification and remaining limitations

- Focused browser checks after the code corrections: 11 passed, covering complete JSON round trip, four valid timestamp forms, three invalid date/offset forms, missing bounds, and one-sided minimum/maximum thresholds.
- Final browser harness: root and repository-subpath runs each passed in Chromium 150 with Python 3.15.2. Each run reported 2,258 executed assertions and zero skips; reduced motion was emulated.
- The replay suite's second invocation returns the same replay-case and assertion-category counts as the first.
- No Node.js/npm CLI test was run because those commands were unavailable in the environment. No live contact submission or backend integration was performed.
- Per-finding severity labels were absent from the retained original review brief and remain unavailable; none were inferred. No live contact submission or backend integration was performed.

**Recommendation:** **PASS** for the Release 2.1 fixed synthetic demonstration. This does not establish safety for arbitrary external telemetry; numeric range validation remains a prerequisite before enabling that scope.

# Fieldwise static demonstration

This directory is a dependency-free static version of the Fieldwise customer demonstration. It uses only HTML, CSS, JavaScript, inline SVG charts, and deterministic synthetic data.

## Local preview

The site uses native JavaScript modules, so preview it through a static file server rather than opening `index.html` directly. For example, if Python is already installed:

    python -m http.server 8080

Then open http://localhost:8080/. The server only serves files; the demo does not use Python, Streamlit, MQTT, SQLite, backend APIs, or network data.

## Included behavior

- Overview, Asset Detail, Incidents, Device Health, and Insights views.
- Refrigeration and building-environment synthetic scenarios.
- Deterministic replay stages, unit switching, timezone display, incident filtering, and asset selection.
- Incident excursions split into distinct lifecycles when a reading switches directly between above-maximum and below-minimum conditions.
- Responsive desktop/mobile layout.
- Inline SVG temperature and humidity charts with automatic padding, horizontal gridlines, labeled temperature thresholds, and red excursion markers.
- Visible notice: “Demonstration using simulated data.”
- Contact form for future inquiries, submitted over HTTPS to the approved Formspree endpoint. Formspree processes submissions; no contact data is stored in the browser.
- Versioned in-browser snapshot provider boundary; the current provider returns deterministic synthetic data only.
- Schema version 1 is normalized in `src/domain/snapshot.js`; no backend API contract or authentication flow is defined.
- Snapshot normalization preserves source order for equal receipt times and otherwise sorts readings by receipt time. The internal limits are 100 assets, 10,000 readings, 500 readings per asset, and 500 incidents.

## Release 2.1 scope and numeric limitation

Release 2.1 is a static, GitHub Pages-compatible demonstration for the two fixed, bounded synthetic scenarios only. Extremely large finite numeric inputs can overflow chart range calculations and produce invalid SVG coordinates; this limitation is accepted for the bounded synthetic profiles. Add numeric range validation before accepting arbitrary external sensor data.

## Release 2.1 browser regression checks

The regression harness has no package dependencies. It requires Python 3 (or another static HTTP server) and a modern browser with native ES module support.

From this directory, start the static server:

    python -m http.server 8080

Open `http://localhost:8080/tests/browser-regression.html`. The page runs the replay/normalization assertions and browser interaction checks, then reports the counts it actually executed. It distinguishes non-DOM and DOM regression assertions from browser interaction assertions. A reduced-motion check is reported as skipped unless the browser's reduced-motion preference is enabled.

To check a repository-style subpath, serve the parent directory and open `http://localhost:8080/fieldwise-demo-release1/tests/browser-regression.html`. App and test module URLs are relative to the repository path.

The harness does not submit the live contact form. Its contact timeout and cancellation checks use an injected local mock request.

Last verified in Chromium 150 with Python 3.15.2: root and repository-subpath runs each passed 74 replay cases per invocation (two invocations), 2,194 non-DOM regression assertions, 18 DOM regression assertions, and 46 browser interaction assertions (2,258 assertions total; 0 skipped with reduced-motion emulated). The second replay invocation verifies that assertion-category counts reset and remain stable.

All readings, assets, incidents, and observations are illustrative. Freshness does not prove connectivity, thresholds are not compliance guidance, and the site cannot perform equipment actions.

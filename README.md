# Fieldwise static demonstration

This directory is a dependency-free static version of the Fieldwise customer demonstration. It uses only HTML, CSS, JavaScript, inline SVG charts, and deterministic synthetic data.

## Local preview

The site can be opened directly:

    fieldwise-static-demo/index.html

For a browser-like GitHub Pages preview without an application backend, serve this directory with any static file server. For example, if Python is already installed:

    python -m http.server 8080 --directory fieldwise-static-demo

Then open http://localhost:8080/. The server only serves files; the demo does not use Python, Streamlit, MQTT, SQLite, backend APIs, or network data.

## Included behavior

- Overview, Asset Detail, Incidents, Device Health, and Insights views.
- Refrigeration and building-environment synthetic scenarios.
- Deterministic replay stages, unit switching, timezone display, incident filtering, and asset selection.
- Responsive desktop/mobile layout.
- Inline SVG temperature and humidity charts with automatic padding, horizontal gridlines, labeled temperature thresholds, and red excursion markers.
- Visible notice: “Demonstration using simulated data.”
- Contact form for future inquiries, submitted over HTTPS to the approved Formspree endpoint. Formspree processes submissions; no contact data is stored in the browser.

All readings, assets, incidents, and observations are illustrative. Freshness does not prove connectivity, thresholds are not compliance guidance, and the site cannot perform equipment actions.

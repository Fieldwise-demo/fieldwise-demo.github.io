# Release 1 progress and verification

## Repository boundary

Dedicated clone: `C:/Users/sajuk/OneDrive/Documents/fieldwise-demo-release1`.
Branch: `feature/mobile-ux-accessibility`.
Authoritative origin: `https://github.com/Fieldwise-demo/fieldwise-demo.github.io.git`.
No changes to the IoT-Platform demo, backend, firmware, databases, or environments.
No pushes, deployment, dependency installation, or trust-setting changes.

## Milestones

1. Initial implementation: commit `6064663`.
2. Follow-up review found that the initial commit had accidentally replaced the original CSS. Restored the original stylesheet verbatim before the new rules. The previous claim of completed browser validation was too broad.
3. Corrected drawer focus containment, closed-drawer inertness, background inertness, Escape/focus restoration and breakpoint transitions. Made drawer content scrollable, retained filter selection/focus after rendering, and contained narrow asset cards.
4. Added persistent announcements, unit pressed state, and descriptive replay labels between the four named stages. Improved stale-label contrast while retaining the existing palette.
5. Added dependency-free replay regression script and this verification record. Git can create and remove `.git/index.lock` in this clone; no alternate clone or permission changes were needed.

## Executed checks

- Full application JavaScript parsing in the browser's JavaScript engine: passed.
- Data-logic checks using functions extracted from the actual application: 74 scenario/replay cases and two unit-conversion checks passed. Covers deterministic replay, asset count, incident lifecycle consistency, active/resolved filtering, and final-stage incident totals.
- Original CSS prefix comparison against commit `1389ee7`: passed.
- Browser verification: 83 assertions passed using a loopback-only preview. All five views were checked at 320, 390, 768 and 1440 CSS pixels with no document-level horizontal overflow. Verified responsive incident cards/table, mobile drawer open/close, Escape/backdrop behavior, focus trap and restoration, inertness, breakpoint transition, short-screen drawer scrolling, skip link, view announcements, filter persistence, replay stages and scenarios, displayed Celsius/Fahrenheit values, both timezones, and contact form required-field validation and close/cancel buttons. No live inquiry was sent.
- Original stylesheet is preserved verbatim as the prefix of the current stylesheet.
- `git diff --check`: passed.

The Node regression script itself was not run because Node is not available on PATH; the equivalent checks were run against the actual application source in the browser. The browser test did not verify native dialog Escape handling: the hosted browser did not emit a native `cancel` event for Escape on either the app dialog or a minimal dialog probe. Explicit close/cancel buttons and required-field validation passed. Screen-reader announcements were checked in the DOM but not with assistive technology.

## Remaining independent review

Repeat the visual and interaction checks in an independently controlled browser and with assistive technology. Confirm native dialog Escape behavior in a regular browser; the hosted browser harness did not expose the native cancel event. The contact form was not submitted.

## Commands

```powershell
node --check app.js
node tests/replay-regression.mjs
git diff --check
git status --short --branch
```

The two Node commands require Node.js, which was not present on PATH during this verification.

## Release 2 recommendations

Add browser-level regression coverage in an approved existing tooling environment; introduce a vendor-neutral data adapter before live integration; evaluate URL-addressable views and accessible chart summaries. Keep authentication, live incident actions, and deployment out of this release.

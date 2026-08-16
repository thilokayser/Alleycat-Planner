# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Alleycat Dispatch is an organizer tool for alleycat races (bike checkpoint races): create events, place checkpoints on a map, print bib numbers/spokecards, run finish-line check-in, keep a leaderboard, export a manifest as PDF. It ships as two self-contained HTML files (local/server storage variants) opened directly in a browser — but those files are **generated**, not hand-edited. See Architecture below before touching anything.

## Commands

No `npm install`, no dependencies — `build.js` is plain Node.

- **Build the app**: `node build.js` — reads `src/` and `templates/`, writes `dist/alleycat-dispatch-local.html` and `dist/alleycat-dispatch-server.html`. Run this after every source change before testing in a browser.
- **Run the app**: open `dist/alleycat-dispatch-local.html` (or `dist/alleycat-dispatch-server.html`) directly in a browser after building.
- **Run tests**: paste the contents of `test-suite.js` into the browser console of a running `dist/` build, then call `runAlleycatTestSuite()`. It exercises event CRUD, all checkpoint types, teams, the full check-in flow, leaderboard, manifest, PDF export, and storage roundtrip end-to-end.
- **PHP backend local testing**: no automated way — run `php-backend/` against a local PHP+MySQL setup (e.g. XAMPP) and point `dist/alleycat-dispatch-server.html`'s setup screen at it.

## Architecture

### Never edit `dist/*.html` directly

`dist/` is Git-ignored, fully generated output — `node build.js` overwrites it every time. **All source changes go in `src/` or `templates/`.** If you're about to edit an HTML file and its path starts with `dist/`, stop and find the corresponding file in `src/core/`, `src/storage/`, `src/styles/`, or `templates/` instead.

### Module layout

```
src/
  core/            # shared between BOTH variants — must build to byte-identical output
    utils.js           formatters, uid, escapeHtml, downloadJSON
    checkpoint.js       CHECKPOINT_TYPES, custom-type CRUD, checkpoint edit/drag, renderSidebar, event-field handlers (name/date/start/curfew)
    team.js             evt.teams CRUD, computeTeamStats, teamBadgeHtml
    map.js              Leaflet init/markers/click, sidebar resize, Nominatim search
    rider.js            withRiderDefaults, generateRiderSlots, renderRiders, QR dataurl
    checkin.js          full check-in flow incl. QR scan, live countdown, computeCurfewResult, riderStatusBadgeHtml
    leaderboard.js       renderLeaderboard, filters, sortRidersForOverview
    export-csv.js / export-gpx.js / export-pdf.js
    dashboard.js         withEventDefaults, event CRUD, renderDashboard
    ui-headquarter.js    state, showToast, init(), navigation, render() dispatcher, renderTopbar, settings/themes/icon packs
  storage/
    storage-local.js     sql.js/IndexedDB backend
    storage-server.js    PHP/MySQL fetch backend
  styles/
    base.css / themes.css
templates/
  local.template.html / server.template.html   # {{THEMES_CSS}} {{BASE_CSS}} {{STORAGE_JS}} {{CORE_JS}} placeholders
build.js
```

`build.js`'s `CORE_FILES` order is not load-bearing — almost everything is hoisted function declarations, so cross-module call order doesn't matter. It only matters that `{{STORAGE_JS}}` and `{{CORE_JS}}` both land before the trailing `init();` call in the template.

### The two storage-capability seams

Everything in `src/core/*` must build to **byte-identical** output across both variants — any variant-specific behavior belongs in `src/storage/storage-{local,server}.js` instead, exposed through one of these two seams that shared code calls into:

- **`initStorageBackend()`** — called first thing in `ui-headquarter.js`'s `init()`. Local: awaits `initSqliteStorage()`, always returns `true`. Server: returns `false` and renders the PHP setup screen if unconfigured, `true` otherwise. `init()` bails out if this returns falsy.
- **`renderStorageDashboardExtras()`** — called from `dashboard.js`'s `renderDashboard()` toolbar. Local: returns the SQLite import/export buttons HTML (only when `!hasSharedStorage`). Server: returns `''`.

If you add a new variant-specific behavior, follow this pattern rather than branching on `hasSharedStorage`/`typeof sqlDb` etc. inside a `core/*` file.

### Storage abstraction

All persistence goes through three async functions with a stable contract regardless of backend: `storageGet(key)` → `{value: string} | null`, `storageSet(key, value)` → `bool`, `storageDelete(key)` — defined per-backend in `src/storage/*`. Everything above this layer (`loadEvent`, `saveCurrentEvent`, `loadEventsIndex`, `debouncedSave`, etc., in `ui-headquarter.js`) is backend-agnostic.

### App structure (single global `state`)

- `state` (top of `ui-headquarter.js`) holds `currentEvent`, `eventsIndex`, `view`, `appSettings`, etc. There is no framework — `render()` is called after any state change and re-renders the active view by toggling `.active` on `#view-*` containers and calling the matching `render<ViewName>()` function.
- **`CHECKPOINT_TYPES`** (`checkpoint.js`, a mutable `let`) is the single source of truth for checkpoint kinds. User-defined custom types get merged in at load time from `checkpointTypes:custom` in storage and must stay after the built-in types (`BUILTIN_CHECKPOINT_TYPE_KEYS`) when persisted.
- **`THEMES`** and **`ICON_PACKS`** (`ui-headquarter.js`) drive the Settings page; themes are pure CSS variables swapped via `data-theme` on `<html>` (see `src/styles/themes.css`), icon packs lazy-load their CDN (Font Awesome / Material Symbols) on selection.
- Escaping conventions are deliberate and must be preserved when adding new export paths: `escapeHtml()` (`utils.js`) for all interpolated HTML, a local `esc()` inside `exportRouteGPX()` for XML, and `csvEscape()` for CSV — the latter also neutralizes leading `= + - @` to prevent formula-injection when the export is opened in Excel/Sheets.

### `php-backend/`

Separate deployment target (PHP + MySQL, no framework) consumed only by the server variant. `install.php` is a one-time web installer (creates the `kv` table, generates an API key, writes `config.php` — then must be deleted from the server). `api.php` is the REST endpoint (`GET`/`POST`/`DELETE` via `?key=...`, auth via `X-Api-Key` header) mirroring the `storageGet`/`storageSet`/`storageDelete` contract above. `config.php` holds plaintext DB credentials and is gitignored — never commit it.

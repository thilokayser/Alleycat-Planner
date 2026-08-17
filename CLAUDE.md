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
    i18n.js             translations dict + t(key, params), getCurrentLanguage()/setLanguage() (device-local via localStorage)
    utils.js            formatters, uid, escapeHtml, downloadJSON, haversineDistanceKm, computeRouteLegs
    checkpoint.js       CHECKPOINT_TYPES, custom-type CRUD, checkpoint edit/drag, renderSidebar (incl. per-CP lock, duplicate, personnel CRUD, group-by-type), event-field handlers (name/date/start/curfew)
    team.js             evt.teams CRUD, computeTeamStats (scoring modes), teamBadgeHtml
    category.js         CATEGORY_PRESETS, evt.categoryGroups CRUD (incl. cascading option rename/delete), rider.categories assignment, JSON export/import
    map.js              Leaflet init/markers/click, sidebar resize, Nominatim search
    rider.js            withRiderDefaults, generateRiderSlots, renderRiders, QR dataurl
    checkin.js          full check-in flow incl. QR scan, live countdown, computeCurfewResult, riderStatusBadgeHtml
    leaderboard.js       renderLeaderboard, filters, sortRidersForOverview
    export-csv.js / export-gpx.js / export-pdf.js
    race-state.js        race status machine (planning/ready/running/completed), CP-lock, start-time dialog
    dashboard.js         withEventDefaults, event CRUD, renderDashboard, per-event Overview tab (widget catalog, compute + render functions, visibility/order controls)
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
- **i18n**: every visible UI string goes through `t('namespace.key', params)` (`i18n.js`) rather than being hardcoded — only `de` is populated today, but the structure is translation-ready. Never wrap `t()` calls around user-entered content (checkpoint/team/category names, clues) — those stay raw. Watch for arrow-function params named `t` shadowing the global `t()` inside `.map()` callbacks (rename to e.g. `ct`/`tm`/`th`).
- **Race status machine** (`race-state.js`): `evt.status` moves `planning → ready → running → completed` (backward always allowed, with a confirm). Forward transitions are validated (`markReady` blocks without ≥1 checkpoint + `expectedRiders` set; `completeRace` warns about riders without a finish time, excluding those marked DNF/DNS); only reachable via `onStatusSelectChange()` (topbar dropdown) or the blocking start-time dialog (`checkStartDialog()`, polled every second from `init()`, renders into `#start-dialog-root` — independent of `render()`/the active view since it must persist across navigation). `isCpLocked(evt)` gates checkpoint structure edits in `checkpoint.js`'s `renderSidebar()` once `status` is `running`/`completed` (with a `cpLockOverride` escape hatch during `running`) — this is the only read-only enforcement in place; other views do not yet respect race status.
- **Rider race status** (`rider.raceStatus`, `''|'dnf'|'dns'`, set via `setRiderRaceStatus()` in `checkin.js`): independent of `finishTime` — `riderStatusBadgeHtml()` checks it before falling back to curfew logic. Confirming a rider at the finish (`confirmRiderAtFinish()`) always clears it.
- **Category groups** (`category.js`): `evt.categoryGroups = [{id, name, options[], sortOrder}]`, orthogonal to and independent of the Teams system. `rider.categories = {[groupId]: selectedOption}`. Option values are raw user text (from presets or custom input) and never go through `t()` — same rule as checkpoint/team names. Renaming or deleting an option cascades into every rider's assignment; deleting a group clears the corresponding key on every rider.
- **Team scoring mode** (`evt.teamScoringMode`, `'bestTime'|'allMustFinish'`, set in `rider.js`'s Teams section): `computeTeamStats()` in `team.js` computes `bestTime`/`worstTime`/`allFinished` per team and sorts accordingly — `bestTime` ranks by the fastest member's finish time, `allMustFinish` requires every member to have finished and ranks by the slowest member's time (teams with an unfinished member sort last).
- **Checkpoint order mode** (`evt.checkpointOrderMode`, `'frei'|'fest'`, toggle in `checkpoint.js`'s `renderSidebar()`): purely advisory in `'frei'`. In `'fest'`, `checkin.js`'s `checkOrderBeforeComplete()` gates `onCheckinToggleCheckpoint`/`onCheckinSetScore` — completing a checkpoint out of `order` sequence prompts a confirm; accepting appends `{checkpointId, at}` to `rider.checkpointOrderOverrides` as an audit log. Distance (`computeRouteLegs()` in `utils.js`, plain Haversine on CP coordinates, no API call) is only shown in `'fest'` mode, per-leg between consecutive `cp-row`s plus a total — intentionally omitted in `'frei'` mode since sequence-less checkpoints have no meaningful "route length".
- **Overview tab / dashboard widgets** (`dashboard.js`): a per-event "Übersicht" tab (`state.view === 'overview'`, `openOverview()`/`renderOverview()`), separate from the HQ home view (`state.view === 'dashboard'`, event list). `DASHBOARD_WIDGET_KEYS` is the widget catalog (`statusTiles`/`cpLoad`/`recentActivity`/`categoryDistribution`/`miniLeaderboard`/`countdown`/`todos`); each has a `compute*`/`render*Widget` pair. Visibility and order are stored per-event on `evt.dashboardWidgetOrder`/`evt.dashboardWidgetVisibility` (defaults: statusTiles/cpLoad/countdown visible, rest hidden) and edited via the in-page settings panel (`toggleOverviewSettings()`, checkbox + up/down reorder — no drag-and-drop). `computeDashboardTodos()` surfaces only structural completeness gaps (missing checkpoints/positions/start time/capacity/unassigned category groups/unprinted bibs+spokecards/no manifest yet/checkpoints without personnel) — no time-threshold warnings. The countdown widget ticks live via `startOverviewTick()`/`updateOverviewCountdown()` (same self-stopping `setInterval` pattern as `checkin.js`'s live countdown, keyed on `state.view !== 'overview'`), patching `#overview-countdown-value` directly rather than a full re-render.
- **Per-checkpoint lock** (`cp.locked`, toggled via `toggleCpLocked()` in `checkpoint.js`): independent of and orthogonal to the race-status CP lock (`isCpLocked(evt)`) — protects a single checkpoint's position/type/clue/staff from edits (and blocks `moveCp`/`duplicateCheckpoint`/`confirmDeleteCp`) regardless of race status, for e.g. a scouted-and-confirmed position. The sidebar row computes `itemLocked = isCpLocked(evt) || cp.locked` and swaps in the same read-only `cp-edit-readonly` block used for the race-status lock when either is true; only UI-gated (consistent with the existing race-status lock), not re-checked inside every handler, except where the whole point of the flag is to block a specific action (`moveCp`, `confirmDeleteCp`, `duplicateCheckpoint`, `addCpStaff`, `toggleCpLocked` itself all re-check defensively).
- **Checkpoint list enhancements** (`checkpoint.js`): each `cp-row` shows a live check-in load badge (riders whose `completed` includes the checkpoint), a time-window status badge (`cpTimeWindowStatus()` → `upcoming`/`open`/`closed`, computed at render time, not ticking), a personnel count badge, and duplicate/lock quick-action icons. `state.cpListGroupBy` (`'order'|'type'`) toggles between the normal sequence list and CHECKPOINT_TYPES-grouped sections (`renderCpListRows()`) — drag/move controls are hidden in the grouped view since reordering across type groups isn't meaningful. Clicking a row also `map.flyTo()`s to that checkpoint (`selectCp()`).
- **Checkpoint personnel** (`cp.staff = [{id, name, phone, role, shiftNote, notes}]`, CRUD via `addCpStaff()`/`removeCpStaff()`/`onCpStaffFieldChange()`): edited inline in the checkpoint's edit form, phone numbers rendered as `tel:` links. **Never** surfaced in `exportManifestPDF`/`buildRiderSheetDoc`/`buildSpokeCardsDoc` (rider-facing) — the only export that reads `cp.staff` is the separate, organizer-only `buildStaffBriefingDoc()`/`exportStaffBriefingPDF()` in `export-pdf.js`, reachable from the editor sidebar footer.

### `php-backend/`

Separate deployment target (PHP + MySQL, no framework) consumed only by the server variant. `install.php` is a one-time web installer (creates the `kv` table, generates an API key, writes `config.php` — then must be deleted from the server). `api.php` is the REST endpoint (`GET`/`POST`/`DELETE` via `?key=...`, auth via `X-Api-Key` header) mirroring the `storageGet`/`storageSet`/`storageDelete` contract above. `config.php` holds plaintext DB credentials and is gitignored — never commit it.

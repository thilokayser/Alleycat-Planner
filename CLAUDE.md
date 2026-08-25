# CLAUDE.md

Guidance for Claude Code (claude.ai/code) on this repo. Kept under ~5k tokens on purpose — deep "why we built it this way" detail per feature lives in [`docs/implementation-notes.md`](docs/implementation-notes.md), not here.

## What this is

Alleycat Dispatch: organizer tool for alleycat races (bike checkpoint races) — create events, place checkpoints on map, print bib numbers/spokecards, run finish-line check-in, keep leaderboard, export manifest as PDF. Ships as two self-contained HTML files (local/server storage variants), opened directly in browser — files are **generated**, not hand-edited. See Architecture below before touching anything.

## Project docs

- [`docs/alleycat-dispatch-roadmap-14-23.md`](docs/alleycat-dispatch-roadmap-14-23.md) — active roadmap, source of truth for what's next. Check status table before assuming a package isn't done — occasionally out of sync with per-package write-ups below (fixed once already, watch for recurrence).
- [`docs/implementation-notes.md`](docs/implementation-notes.md) — detailed build rationale per feature (why, not just what), for deep history.
- [`docs/handover/`](docs/handover/) — two original spec/handover docs, still worth reading for design detail the roadmap checklist skips.
- [`docs/archive/`](docs/archive/) — superseded planning snapshots, historical context only.
- [`examples/`](examples/) — sample event JSON + sample manifest PDF.

## Tech stack

Plain JS (no framework, no bundler, no `npm install`) — single global `state` object; `render()` re-renders active view on every state change. Third-party libraries CDN-loaded in templates: **Leaflet** + **Leaflet.draw** (map + zone editor — the one deliberate dependency exception, see `docs/archive/PROJEKT-UEBERSICHT.md` §9), **jsPDF** (all PDF export), **sql.js** (WASM SQLite, local-storage variant only), **QRCode.js** (bib/spokecard QR codes). Server variant's backend: plain **PHP + MySQL/MariaDB**, no framework, in `php-backend/`. `build.js` is plain Node, zero dependencies.

## Commands

- **Build**: `node build.js` — reads `src/` + `templates/`, writes `dist/alleycat-dispatch-local.html` and `dist/alleycat-dispatch-server.html`. Run after every source change, before testing in browser.
- **Run**: open `dist/alleycat-dispatch-local.html` (or `-server.html`) directly in browser after building.
- **Test**: paste `test-suite.js`'s contents into browser console of running `dist/` build, call `runAlleycatTestSuite()`. No CI — always manual, in-browser run. See Test coverage gaps below.
- **PHP backend local testing**: no automated way — run `php-backend/` against local PHP+MySQL setup (e.g. XAMPP), point `dist/alleycat-dispatch-server.html`'s setup screen at it.

## Architecture

### Never edit `dist/*.html` directly

`dist/` is Git-ignored, fully generated output — `node build.js` overwrites it every time. **All source changes go in `src/` or `templates/`.**

### Module layout (`src/core/`, order from `build.js`'s `CORE_FILES`)

Everything here must build **byte-identical** across both variants — order not load-bearing (hoisted function declarations), except `{{STORAGE_JS}}`+`{{CORE_JS}}` must land before template's trailing `init();`.

| File | Owns |
|---|---|
| `i18n.js` | translations dict (`de` source), `t(key, params)`, `BUILTIN_LANGS`, community language packs |
| `utils.js` | formatters (distance/time/coords), `escapeHtml`, `uid`, `haversineDistanceKm`, `computeRouteLegs` |
| `checkpoint.js` | `CHECKPOINT_TYPES`, checkpoint CRUD/edit/drag/personnel, editor sidebar render |
| `team.js` | `evt.teams` CRUD, `computeTeamStats` (scoring modes) |
| `category.js` | `evt.categoryGroups` CRUD, rider category assignment, JSON export/import |
| `zones.js` | zone data model (circle/polygon) + geometry helpers |
| `event-locations.js` | HQ/Afterparty + Orga-Pins data model |
| `logistics.js` | TSP route estimator, proximity-cluster warnings |
| `geo-import.js` | GPX/GeoJSON/KML drag-and-drop import |
| `action-log.js` | generic undo log (`logUndoableAction`/`undoLoggedAction`) |
| `bulk-import.js` | CSV rider import: parse/map/validate/apply |
| `feature-registry.js` | `FEATURE_REGISTRY` device/event toggles, Settings-Hub search |
| `empty-states.js` | `emptyStateHtml()` reusable component |
| `social-share.js` | Canvas result-card renderer (top 3, Web Share API) |
| `map.js` | Leaflet init/markers/search/sidebar-resize |
| `rider.js` | rider roster CRUD + sidebar nav (Fahrerliste/CSV-Import/Teams/Kategorien/Kartendesign) |
| `checkin.js` | check-in flow, QR scan, curfew, live countdown |
| `leaderboard.js` | leaderboard render/filters/sort |
| `export-csv.js` / `export-gpx.js` | CSV / GPX export |
| `pdf-blocks.js` | PDF-Baukasten block CRUD + auto-flow layout |
| `export-pdf.js` | manifest/spokecards/bibs/staff-briefing PDF rendering |
| `race-state.js` | race status machine (planning→ready→running→completed) |
| `rules-engine.js` | generic game-mode trigger/condition/effect evaluator |
| `game-modes.js` | 7 game-mode presets (`GAME_MODE_DEFS`) |
| `dashboard.js` | event CRUD, HQ dashboard, per-event Übersicht widgets |
| `demo-event.js` | seeded first-run example event ("Kölner Kurierrennen") |
| `sound-hook.js` | `AlleycatSounds` registry (register/play/unregister) |
| `live-sync.js` | `BroadcastChannel` for game-mode event-log entries |
| `beamer.js` | `#/beamer/<id>` route, countdown/GO/live phases |
| `beamer-modes.js` | game-mode-aware beamer widgets (zone map, points board, ticker) |
| `offline-tiles.js` | offline map-tile IndexedDB cache |
| `data-safety.js` | auto-backup (toggleable, default off), beforeunload, wake lock, storage APIs |
| `command-palette.js` | Cmd/Ctrl+K fuzzy-search palette |
| `splashscreen.js` | Hero-Startbildschirm vor dem Dashboard (jeder App-Start, per Setting abschaltbar) |
| `onboarding.js` | Geführte Spotlight-Tour durchs Demo-Event (6 Views), Auto-Start nach dem Splashscreen |
| `documentation.js` | In-App-Nachschlagewerk unter Settings → Hilfe (11 Themen, Suchfilter) |
| `rider-sync.js` | Rider-App-Fundament: QR-Payload-Parser, Publish, Log-Merge, Anmeldungen bestätigen. Alles Netzabhängige läuft über Seams |
| `ui-headquarter.js` | `state`, `init()`, `render()` dispatcher, Settings-Hub sidebar |

`src/storage/storage-{local,server}.js` (backend-specific), `src/styles/base.css`+`themes.css`, `templates/{local,server}.template.html`.

### Storage-capability seams

Variant-specific behavior never branches on `hasSharedStorage`/`typeof sqlDb` inside `src/core/*` — goes through one of four seams, implemented per-backend in `src/storage/*`. **This is enforced by `build.js`, not just convention** — see Core guard below.

- **`initStorageBackend()`** — called first in `init()`. Local always returns `true`; server returns `false` (renders PHP setup screen) until configured.
- **`renderStorageDashboardExtras()`** — dashboard toolbar extra HTML (local: SQLite import/export buttons; server: `''`).
- **`exportBackupBlob(evt)`** — local: `.sqlite` export of whole DB; server: `.json` export of just `evt`; both `null` when `hasSharedStorage` (hides Auto-Backup entirely).
- **`supportsLocalBackup()`** — sync, `!hasSharedStorage` in both variants. The *capability* question behind `exportBackupBlob`, for the two render paths that need to hide backup UI without producing a blob (`renderDataSafetySection`, `renderBackupStatusLine`).
- **`riderAppBaseUrl()`** — sync, `''` when there can be no rider app (local variant always; server variant until a rider-app URL is configured). **Ask this before mutating anything rider-related** — the three async seams below only reveal `null` after the call, by which point an event would already carry a `publicId` and tokens nobody will use.
- **`publishRiderConfig(payload)` / `pollRiderLog(publicId, since)` / `confirmRiderSlot(publicId, bib, status)`** — `null` in the local variant. Server variant posts to `rider.php`, whose URL is derived from the configured `api.php` endpoint (same directory).

### Core guard (`build.js`)

`assertCoreIsBackendAgnostic()` runs before either variant is built and **fails the build** (exit 1, with file, line, and the violated rule) if any `CORE_FILES` module contains: `hasSharedStorage`, `sqlDb`, a `*.php` endpoint name, or a function defined in `src/rider/`. The `.php` rule exempts `i18n.js`, where `api.php`/`install.php` legitimately appear in PHP-setup placeholder strings — translation text is data, not endpoint knowledge. The `src/rider/` rule is inert until that directory exists.

Rationale: the two variants share ~97.5% of their code (11.2k lines in `src/core/`, ~290 variant-specific), so a repo/folder split would be far more expensive than an enforced boundary. If a guard rule blocks you, the fix is almost always a new seam, not an exemption.

Offline map-tile caching (`offline-tiles.js`) deliberately skips this pattern — raw per-device `indexedDB` cache, identical in both variants, no seam needed.

### Storage abstraction

All persistence goes through `storageGet(key)`/`storageSet(key, value)`/`storageDelete(key)` (stable contract, backend-specific implementation). Everything above that layer (`loadEvent`, `saveCurrentEvent`, `debouncedSave`, etc., in `ui-headquarter.js`) is backend-agnostic.

## Code style & naming conventions

- **Language split**: UI-facing strings authored in German first, routed through `t('namespace.key', params)` (`i18n.js`) — never hardcode visible text; never wrap `t()` around user-entered content (checkpoint/team/category names, clues). Code identifiers (functions, variables, CSS classes, comments) stay English. `de` (source, in `i18n.js`) and `en` (`src/i18n/en.json`, injected by `build.js` as `translations.en`) both `BUILTIN_LANGS`, always shipped, selectable in Settings — `t()`'s per-key fallback to `de` means new keys safe to add German-only. **Do not edit `src/i18n/en.json` proactively on string changes** — user syncs it separately, on request.
- **Function naming**: `renderX()` returns/writes HTML; `onXChange()`/`onXInput()` = input handlers; `toggleX()`/`selectX()` flip UI state; `computeX()` = pure derived-data functions, no side effects.
- **Escaping**: `escapeHtml()` for HTML interpolation, local `esc()` inside `exportRouteGPX()` for XML, `csvEscape()` for CSV (also neutralizes leading `= + - @` against formula injection).
- **Numeric config gotcha**: never read with `config.x || default` — real `0` is falsy, silently falls back. Use `numOr(value, fallback)` helper (`Number.isFinite` check).
- **Sidebar-nav pages** (Settings, Riders, Manifest — more may follow): reuse `.settings-layout`/`.settings-sidebar`/`.settings-content`/`.settings-nav-*`/`.settings-mobile-*` CSS classes verbatim, not page-specific names — purely structural, zero new layout CSS per page. Tests querying these classes must scope to page's root id (`#view-settings .settings-content`, not bare `.settings-content`) since class is shared. Manifest's variant (2026-08-19) splits two previously-conflated functions (table/column customization vs. PDF-Baukasten extra pages) into distinct sidebar sections, plus Drucken/Export as own sections; manifest table renders unconditionally below active section's panel in `.settings-content` (not toggled) — shared context for all four sections.
- **`t` shadowing**: arrow-function params named `t` inside `.map()` callbacks shadow the global `t()` — rename to `ct`/`tm`/`th` etc.
- Watch for stray "unused" `.md` docs or module-map entries drifting from reality — this file's module table + roadmap's summary table both went stale before, after a feature landed without doc update in same pass.

## Known issues & open TODOs

- **PHP backend untested on real host.** `php-backend/` code-complete (pre-flight checks, migrations, hardened error handling) but only verified against local MariaDB/PHP dev server — never installed on real shared hosting. Needs user to run `install.php` on their host, record result in `php-backend/COMPATIBILITY.md`.
- **`pdf_page_format` (A4/US Letter switch + crop marks) deliberately deferred.** `exportManifestPDF()` uses absolute pt coordinates throughout, not page-size-relative fractions — naive format switch risks clipping content on US Letter (50pt shorter than A4). Needs own focused pass.
- **Storage protocol: last writer wins — but no longer for check-ins.** One key = one whole event JSON blob, and two devices editing the same event still overwrite each other; there is no optimistic locking or ETag. Rider check-ins and registrations are the exception: since the rider-app foundation (2026-08-25) they are append-only rows in `<prefix>_rider_log`, never blob writes, and `mergeRiderLogRows()` is idempotent — so two organizer devices reading the same log converge instead of clobbering. Anything else the organizer edits is still last-writer-wins.
- **Not built yet**: the rider-facing app itself (`dist/alleycat-rider.html` — login, progress, checkpoint scan, offline queue), the spokecard-QR format switch and checkpoint-QR PDF (sub-project 2), plus the beamer live ping and the public pre-registration page (sub-project 3). See [`docs/superpowers/specs/2026-08-25-rider-app-fundament-design.md`](docs/superpowers/specs/2026-08-25-rider-app-fundament-design.md) §13.
- **Server variant is the active one.** Since 2026-08-25 new features go into the server variant only; the local variant is feature-frozen but must not regress — `test-suite.js` against the local build plus `node build.js --core-hash` are the gates.
- **Cargo module / Trackbike attributes / clue-sheet PDF block were built, then fully removed** on user request (no technical reason). Clue-sheet removal (2026-08-19) also deleted `src/core/race-formats.js` outright — existed solely for clue-sheet cipher helpers. If asked to re-add any of these, don't assume old implementation recoverable via `git blame` alone — removal was total, not a toggle.
- **Deferred/skipped on user request**: Beamer `speechSynthesis` announcer + voice check-in (Paket 7); "Kopfgeld" (bounty/leader) game mode; Offline-Gerätesync (Screen-to-Camera QR sync, idea only).

## Test coverage gaps

- `test-suite.js` is always a manual browser-console paste — no CI, no automated runner.
- **The suite needs a *visible* browser pane, not just an active tab.** If the pane is collapsed, `innerWidth/innerHeight` are 0 and `document.hidden` is `true` even for the fronted tab; Leaflet's `flyTo` then gets `NaN`, `selectCp` throws, and the run aborts partway looking like a real failure (it also trips the app's own error boundary). Check with `JSON.stringify({v:[innerWidth,innerHeight],h:document.hidden})` before blaming a change — `tabs_select` and `resize_window` do **not** un-collapse the pane. Two known flakes on top of that: `formatMinutesAgo erkennt "gerade eben"` (timing) and `selectCp (inkl. Karten-Zentrierung)` (map size not settled yet on the first run after load). Both pass on a second run; neither is a real bug.
- **Don't run the suite in a tab you've been poking at.** It reuses `state.currentEvent`, so leftover stubs or a checkpoint left on the wrong type from earlier console work produce failures that look like regressions. Reload first.
- PHP backend concurrency/load tests only ran against PHP's built-in dev server (`PHP_CLI_SERVER_WORKERS=8`), never against real shared-hosting PHP-FPM/Apache behavior. This now also covers `rider.php`'s rate limiter, which counts failures in a shared table — worth re-checking under PHP-FPM's parallel worker processes.
- Rider-app load was only ever generated by `curl`, never by real phones on real mobile networks.
- No visual regression baseline — UI changes checked via ad hoc screenshots during session, not saved for comparison.

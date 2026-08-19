# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. Kept under ~5k tokens on purpose — deep "why we built it this way" detail per feature lives in [`docs/implementation-notes.md`](docs/implementation-notes.md), not here.

## What this is

Alleycat Dispatch is an organizer tool for alleycat races (bike checkpoint races): create events, place checkpoints on a map, print bib numbers/spokecards, run finish-line check-in, keep a leaderboard, export a manifest as PDF. Ships as two self-contained HTML files (local/server storage variants) opened directly in a browser — but those files are **generated**, not hand-edited. See Architecture below before touching anything.

## Project docs

- [`docs/alleycat-dispatch-roadmap-14-23.md`](docs/alleycat-dispatch-roadmap-14-23.md) — active roadmap, source of truth for what's next. Check its status table before assuming a package isn't done; it's occasionally out of sync with the detailed per-package write-ups below it (fixed once already, watch for it recurring).
- [`docs/implementation-notes.md`](docs/implementation-notes.md) — detailed build rationale per feature (why, not just what) for anyone needing the deep history.
- [`docs/handover/`](docs/handover/) — the two original spec/handover documents, still worth reading for design detail the roadmap checklist doesn't carry.
- [`docs/archive/`](docs/archive/) — superseded planning snapshots, historical context only.
- [`examples/`](examples/) — sample event JSON + sample manifest PDF.

## Tech stack

Plain JS (no framework, no bundler, no `npm install`), a single global `state` object, `render()` re-renders the active view on every state change. Third-party libraries loaded via CDN in the templates: **Leaflet** + **Leaflet.draw** (map + zone editor — the one deliberate dependency exception, see `docs/archive/PROJEKT-UEBERSICHT.md` §9), **jsPDF** (all PDF export), **sql.js** (WASM SQLite, local-storage variant only), **QRCode.js** (bib/spokecard QR codes). Server variant's backend is plain **PHP + MySQL/MariaDB**, no framework, in `php-backend/`. `build.js` is plain Node with zero dependencies.

## Commands

- **Build**: `node build.js` — reads `src/` + `templates/`, writes `dist/alleycat-dispatch-local.html` and `dist/alleycat-dispatch-server.html`. Run after every source change before testing in a browser.
- **Run**: open `dist/alleycat-dispatch-local.html` (or `-server.html`) directly in a browser after building.
- **Test**: paste `test-suite.js`'s contents into the browser console of a running `dist/` build, call `runAlleycatTestSuite()`. No CI — this is always a manual, in-browser run. See Test coverage gaps below.
- **PHP backend local testing**: no automated way — run `php-backend/` against a local PHP+MySQL setup (e.g. XAMPP) and point `dist/alleycat-dispatch-server.html`'s setup screen at it.

## Architecture

### Never edit `dist/*.html` directly

`dist/` is Git-ignored, fully generated output — `node build.js` overwrites it every time. **All source changes go in `src/` or `templates/`.**

### Module layout (`src/core/`, order from `build.js`'s `CORE_FILES`)

Everything here must build **byte-identical** across both variants — order isn't load-bearing (hoisted function declarations), except `{{STORAGE_JS}}`+`{{CORE_JS}}` must land before the template's trailing `init();`.

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
| `ui-headquarter.js` | `state`, `init()`, `render()` dispatcher, Settings-Hub sidebar |

`src/storage/storage-{local,server}.js` (backend-specific), `src/styles/base.css`+`themes.css`, `templates/{local,server}.template.html`.

### Storage-capability seams

Variant-specific behavior never branches on `hasSharedStorage`/`typeof sqlDb` inside `src/core/*` — it goes through one of three seams implemented per-backend in `src/storage/*`:

- **`initStorageBackend()`** — called first in `init()`. Local always returns `true`; server returns `false` (renders PHP setup screen) until configured.
- **`renderStorageDashboardExtras()`** — dashboard toolbar extra HTML (local: SQLite import/export buttons; server: `''`).
- **`exportBackupBlob(evt)`** — local: `.sqlite` export of the whole DB; server: `.json` export of just `evt`; both `null` when `hasSharedStorage` (hides Auto-Backup entirely in that mode).

Offline map-tile caching (`offline-tiles.js`) deliberately skips this pattern — it's a raw per-device `indexedDB` cache, identical in both variants, no seam needed.

### Storage abstraction

All persistence goes through `storageGet(key)`/`storageSet(key, value)`/`storageDelete(key)` (stable contract, backend-specific implementation). Everything above that layer (`loadEvent`, `saveCurrentEvent`, `debouncedSave`, etc. in `ui-headquarter.js`) is backend-agnostic.

## Code style & naming conventions

- **Language split**: UI-facing strings are authored in German first, routed through `t('namespace.key', params)` (`i18n.js`) — never hardcode visible text, and never wrap `t()` around user-entered content (checkpoint/team/category names, clues). Code identifiers (functions, variables, CSS classes, comments) are English. `de` (source, in `i18n.js`) and `en` (`src/i18n/en.json`, injected by `build.js` as `translations.en`) are both `BUILTIN_LANGS`, always shipped, selectable in Settings — `t()`'s per-key fallback to `de` means new keys are safe to add German-only. **Do not edit `src/i18n/en.json` proactively when adding/changing strings** — the user syncs it in a separate pass, on request.
- **Function naming**: `renderX()` returns/writes HTML, `onXChange()`/`onXInput()` are input handlers, `toggleX()`/`selectX()` flip UI state, `computeX()` are pure derived-data functions with no side effects.
- **Escaping**: `escapeHtml()` for HTML interpolation, a local `esc()` inside `exportRouteGPX()` for XML, `csvEscape()` for CSV (also neutralizes leading `= + - @` against formula injection).
- **Numeric config gotcha**: never read with `config.x || default` — a real `0` is falsy and silently falls back. Use the `numOr(value, fallback)` helper (`Number.isFinite` check).
- **Sidebar-nav pages** (Settings, Riders, Manifest — more may follow): reuse `.settings-layout`/`.settings-sidebar`/`.settings-content`/`.settings-nav-*`/`.settings-mobile-*` CSS classes verbatim rather than inventing page-specific names — purely structural, zero new layout CSS per page. Any test that queries these classes must scope to the page's root id (`#view-settings .settings-content`, not bare `.settings-content`) since the class is shared. Manifest's variant (2026-08-19) separates two previously-conflated functions (table/column customization vs. PDF-Baukasten extra pages) into distinct sidebar sections, plus Drucken/Export as their own sections; the manifest table itself renders unconditionally below the active section's panel in `.settings-content` (not toggled) since it's the shared context for all four sections.
- **`t` shadowing**: arrow-function params named `t` inside `.map()` callbacks shadow the global `t()` — rename to `ct`/`tm`/`th` etc.
- Watch for stray "unused" `.md` docs or module-map entries drifting from reality — this file's own module table and the roadmap's summary table have both gone stale before after a feature landed without the doc being updated in the same pass.

## Known issues & open TODOs

- **PHP backend untested on a real host.** `php-backend/` is code-complete (pre-flight checks, migrations, hardened error handling) but only verified against a local MariaDB/PHP dev server — never installed on real shared hosting. Needs the user to run `install.php` on their host and record the result in `php-backend/COMPATIBILITY.md`.
- **`pdf_page_format` (A4/US Letter switch + crop marks) deliberately deferred.** `exportManifestPDF()` uses absolute pt coordinates throughout, not page-size-relative fractions — a naive format switch risks clipping content on US Letter (50pt shorter than A4). Needs its own focused pass.
- **Storage protocol: last writer wins.** One key = one whole event JSON blob; concurrent edits to the same event from two devices/tabs aren't merged, the last save overwrites. No optimistic locking/ETags. Blocks real live multi-marshal check-in (see below) until addressed.
- **Not built yet** (from README's own Roadmap): rider self-registration (public signup link instead of organizer-generated slots); live multi-checkpoint check-in / live spectator leaderboard (server variant only, needs the storage-protocol fix above first).
- **Cargo module / Trackbike attributes / clue-sheet PDF block were built, then fully removed** on user request (no technical reason). The clue-sheet removal (2026-08-19) also deleted `src/core/race-formats.js` outright, since it existed solely for the clue-sheet cipher helpers. If asked to re-add any of these, don't assume the old implementation is recoverable via `git blame` alone — the removal was total, not a toggle.
- **Deferred/skipped on user request**: Beamer `speechSynthesis` announcer + voice check-in (Paket 7); "Kopfgeld" (bounty/leader) game mode; Offline-Gerätesync (Screen-to-Camera QR sync, idea only).

## Test coverage gaps

- `test-suite.js` is always a manual browser-console paste — no CI, no automated runner.
- One known flaky check: `formatMinutesAgo erkennt "gerade eben"` — timing-dependent, fails occasionally under a slow/throttled tab. Not a real bug.
- PHP backend concurrency/load tests only ran against PHP's built-in dev server (`PHP_CLI_SERVER_WORKERS=8`), never against real shared-hosting PHP-FPM/Apache behavior.
- No visual regression baseline — UI changes are checked via ad hoc screenshots during the session, not saved for comparison.

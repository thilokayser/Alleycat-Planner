# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Alleycat Dispatch is an organizer tool for alleycat races (bike checkpoint races): create events, place checkpoints on a map, print bib numbers/spokecards, run finish-line check-in, keep a leaderboard, export a manifest as PDF. There is no build step, no package manager, and no test runner — the app ships as self-contained HTML files opened directly in a browser.

## Commands

There is no `package.json`, linter, or build tooling. Development is: edit the HTML file, open it in a browser, reload.

- **Run the app**: open `alleycat-dispatch-local.html` (or `alleycat-dispatch-server.html`) directly in a browser — no server required for the local variant.
- **Run tests**: paste the contents of `test-suite.js` into the browser console of a running instance of either variant, then call `runAlleycatTestSuite()`. It exercises event CRUD, all checkpoint types, the full check-in flow, leaderboard, manifest, PDF export, and storage roundtrip end-to-end.
- **PHP backend local testing**: no automated way — run `php-backend/` against a local PHP+MySQL setup (e.g. XAMPP) and point `alleycat-dispatch-server.html`'s setup screen at it.

## Architecture

### Two independent variants — this is the thing most likely to bite you

`alleycat-dispatch-local.html` and `alleycat-dispatch-server.html` are **not** generated from a shared source — they are two full copies of the same app that differ only in their storage backend. Any change to shared logic (UI, checkpoint types, PDF/CSV/GPX export, etc.) must be manually applied to **both** files. See [README.md](README.md#entwicklung) for the sync procedure. When making a change, always ask whether it belongs in one variant or both before editing.

The two files differ in exactly these regions (diff them to confirm nothing else drifted):
- **`alleycat-dispatch-local.html`**: sql.js CDN `<script>` tag, the `storageGet`/`storageSet`/`storageDelete` + IndexedDB persistence block, `init()`'s call to `initSqliteStorage()`, and the SQLite export/import dashboard buttons.
- **`alleycat-dispatch-server.html`**: the `storageGet`/`storageSet`/`storageDelete` + `phpRequest`/`getPhpConfig` block, `init()`'s redirect to `renderPhpSetup()` when unconfigured, and the PHP setup-screen functions.

Both variants first check `window.storage` (a shared Artifact-runtime storage API) and only fall back to their own backend if it's unavailable — this fallback check must stay identical across both files.

### Storage abstraction

All persistence goes through three async functions with a stable contract regardless of backend: `storageGet(key)` → `{value: string} | null`, `storageSet(key, value)` → `bool`, `storageDelete(key)`. Everything above this layer (`loadEvent`, `saveCurrentEvent`, `loadEventsIndex`, etc.) is backend-agnostic and identical in both files — this is the layer that keeps the two variants' core logic aligned even though the backend implementation differs.

### App structure (single file, single global `state`)

- `state` (defined near the top of the `<script>`) holds `currentEvent`, `eventsIndex`, `view`, `appSettings`, etc. There is no framework — `render()` is called after any state change and re-renders the active view by toggling `.active` on `#view-*` containers and calling the matching `render<ViewName>()` function (`renderDashboard`, `renderSidebar` for the editor, `renderManifest`, `renderRiders`, `renderCheckin`, `renderLeaderboard`, `renderSettings`).
- **`CHECKPOINT_TYPES`** (a mutable `let`) is the single source of truth for checkpoint kinds (QR, photo, item, custom question, marshal-scored challenge). It drives the type dropdown, map icons, manifest layout, and check-in UI. User-defined custom types get merged in at load time from `checkpointTypes:custom` in storage and must stay after the built-in types (`BUILTIN_CHECKPOINT_TYPE_KEYS`) when persisted.
- **`THEMES`** and **`ICON_PACKS`** (near `renderSettings`) drive the Settings page; themes are pure CSS variables swapped via `data-theme` on `<html>`, icon packs lazy-load their CDN (Font Awesome / Material Symbols) on selection.
- Escaping conventions are deliberate and must be preserved when adding new export paths: `escapeHtml()` for all interpolated HTML, a local `esc()` inside `exportRouteGPX()` for XML, and `csvEscape()` for CSV — the latter also neutralizes leading `= + - @` to prevent formula-injection when the export is opened in Excel/Sheets.

### `php-backend/`

Separate deployment target (PHP + MySQL, no framework) consumed only by `alleycat-dispatch-server.html`. `install.php` is a one-time web installer (creates the `kv` table, generates an API key, writes `config.php` — then must be deleted from the server). `api.php` is the REST endpoint (`GET`/`POST`/`DELETE` via `?key=...`, auth via `X-Api-Key` header) mirroring the `storageGet`/`storageSet`/`storageDelete` contract above. `config.php` holds plaintext DB credentials and is gitignored — never commit it.

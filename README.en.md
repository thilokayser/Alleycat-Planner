# Alleycat Dispatch

*[Deutsch](README.md)*

```
ALLEYCAT DISPATCH
Organize, print, and score bike checkpoint races.
──────────────────────────────────────────────────────────
STATUS    Single-file app · no server required
BUILD     node build.js  (0 third-party dependencies)
STORAGE   local (SQLite/WASM) · or server (PHP/MySQL)
```

![Frontend: Vanilla JS](https://img.shields.io/badge/Frontend-Vanilla_JS-1a1816?style=flat-square&labelColor=d9622b&logoColor=white)
![Build: zero dependencies](https://img.shields.io/badge/Build-0_Dependencies-1a1816?style=flat-square&labelColor=d9622b)
![Ships as: single HTML file](https://img.shields.io/badge/Ships_as-1_HTML_File-1a1816?style=flat-square&labelColor=d9622b)

Organizer tool for alleycats (bike checkpoint races): create events, place checkpoints on a map, print bib numbers & spokecards, run finish-line check-in, keep a leaderboard, and export a manifest as PDF.

The source is modular (`src/`), but output stays a single HTML file per variant — a small, dependency-free Node build script stitches it all together.

## Screenshots

| | |
|---|---|
| ![Dashboard](docs/screenshots/01-dashboard.png) **Dashboard** — all events at a glance, import/export as SQLite or JSON | ![Overview](docs/screenshots/02-event-overview.png) **Event overview** — status tiles, checkpoint load, countdown, beamer access |
| ![Map](docs/screenshots/03-map-checkpoints.png) **Map editor** — place checkpoints by clicking, checkpoint types (QR/photo/item/riddle/challenge), route with distances | ![Riders/spokecards](docs/screenshots/04-riders.png) **Rider list & spokecards** — bib numbers, teams, print-ready QR-code export as PDF |
| ![Leaderboard](docs/screenshots/05-leaderboard.png) **Leaderboard** — live progress per checkpoint, status (finished/DNF/DNS), points when game modes are active | |

## Quickstart

1. Run `node build.js` — produces `dist/alleycat-dispatch-local.html` and `dist/alleycat-dispatch-server.html`
2. Open `dist/alleycat-dispatch-local.html` directly in a browser — runs immediately, no server, no `npm install` needed
3. Done — a demo event ("Kölner Kurierrennen") is already seeded on first launch

```bash
node build.js
```

## Two variants

Both have identical functionality, differing only in storage backend:

| File | When to use | Storage |
|---|---|---|
| `dist/alleycat-dispatch-local.html` | One organizer, one device | Local SQLite database in the browser (sql.js/WASM, persisted in IndexedDB) — includes `.sqlite` export/import as backup |
| `dist/alleycat-dispatch-server.html` | Multiple organizers/devices need to see the same events | Own PHP/MySQL backend (see [`php-backend/`](php-backend/)) |

Both variants first check whether `window.storage` is available (e.g. when running inside a compatible Artifact runtime) and prefer it if present.

**Server quickstart:** illustrated guide in [`php-backend/INSTALL.md`](php-backend/INSTALL.md) — in short: upload `php-backend/` to a PHP+MySQL webspace, call `install.php` once, copy the API endpoint + key, then delete `install.php`. Then open `dist/alleycat-dispatch-server.html` and enter the credentials in the setup screen.

## Features

### Map & checkpoints
- Events with any number of checkpoints, positioned via map (Leaflet) or coordinates
- Checkpoint types: QR-code scan, photo proof, item drop-off, riddle question, checkpoint scoring (challenge, points-based) — plus custom checkpoint types definable in settings
- Checkpoint order free or fixed — with a fixed order, finish-line check-in warns on out-of-order confirmations (with a logged override) and shows straight-line distances between checkpoints plus total distance
- Checkpoint list with live load, time-window status, manual locking/duplicating of individual checkpoints, and grouping by order or type; checkpoint staff (name/phone/role/shift) with their own organizer-internal staff briefing PDF (never on the rider manifest/spokecards)
- Map editor: collapsible sidebar for more map space, hover sync between checkpoint list and map markers, shift-click multi-select of checkpoints with bulk actions (assign type, mark mandatory, lock, delete)

### Riders & teams
- Rider list with bib numbers, emergency-contact field (never shown on printed bib numbers/spokecards)
- Teams (solo/team assignment, team scoring with a selectable scoring mode: best individual time or everyone must finish) and freely definable category groups (drivetrain/gender presets or custom) per rider
- CSV bulk import for rider lists: column mapping (bib/name/team/emergency contact), validation before import with an error list instead of silent failure, auto-creates missing teams

### Race flow
- Race state machine (planning → ready → running → completed) with checkpoint-structure lock while the race runs and a blocking start dialog at the scheduled start time
- Overview tab per event with customizable widgets (status tiles, checkpoint load, recent activity, category distribution, mini leaderboard, live countdown, next to-dos) — visibility and order freely configurable, saved per event
- Finish-line check-in flow with confirm/undo, plus DNF/DNS marking
- Leaderboard with combinable filters (status, team, categories) and CSV export (Excel-DE compatible, semicolon-separated, optionally split by team/category)
- Generic undo/action log for recent actions (e.g. rider deleted, category changed) — in addition to the existing finish-line check-in undo

### Game modes & beamer
- Game-mode engine: 7 predefined, independently combinable modes (time-window checkpoints, bonus checkpoints with rank points, secret checkpoints with an unlock precondition, Battle Royale with a shrinking zone, wildcard/joker checkpoint per rider, chain-reaction bonus for a perfect order, sudden-death elimination on inactivity) — activating a points-awarding mode switches the leaderboard to points scoring (time stays visible as extra info), point origins are viewable per rider
- Beamer view (own route, second tab/machine): countdown to start time with number of registered riders, full-screen GO overlay with sound trigger at race start, then a live leaderboard (time since start, rank, name, bib number, checkpoint progress) — synced via BroadcastChannel + storage polling; standalone sound-hook module (file upload per event, test button)
- Live beamer for game modes: once at least one mode is active, the beamer view automatically gains a points leaderboard, a live ticker of recent events (bonus secured, checkpoint revealed, zone shrinking, rider eliminated/finished) with per-event sound hooks, a small Battle Royale zone map, and a full-screen overlay on elimination — with no active mode, the beamer behaves exactly as without game modes

### Export & print
- PDF page builder: freely assembled extra pages (liability waiver with signature line, race rules, sponsor logos, checkpoint overview, notes, custom text, emergency info) selectable per target document (manifest and/or spokecards), freely sortable order, exportable/importable as a template
- Manifest as well as bib-number/spokecard PDF export; manifest and staff briefing open an in-app preview instead of downloading directly
- Route export as GPX
- Social-share cards: automatically generated result image (top 3, club logo) after race end, for download or direct sharing (Web Share API)

### Platform & comfort
- Data safety & offline: automatic backup-download interval while a race is running, warning against accidentally closing the tab, wake lock (screen stays on during finish-line check-in/beamer), storage estimate + request for persistent storage; offline map-tile cache per event (bounding box around the checkpoints, downloadable in settings) with a warning on a stale cache
- 5 themes (Feldpost, Light, Dark, Dracula, Sunlight — a high-contrast mode for outdoor use) and 3 icon packs (Emoji, Font Awesome, Material Symbols) via settings
- Command palette (Cmd/Ctrl+K) with fuzzy search over navigation, riders, checkpoints, and quick actions; global number shortcuts (1–6) for navigation and Esc to cancel active modes/overlays
- Feature overview in settings: every toggleable feature (social-share cards, sound effects, offline map tiles, categories, game modes) in one place with search, toggle, and a jump to its detail configuration
- Friendly placeholders instead of empty lists (checkpoint list, rider list, leaderboard before race start, overview "recent activity") with direct quick actions
- Error screen instead of a blank screen on an unexpected app error, noting that the data is safely stored

## More files

- [`examples/koeln-alleycat-beispiel.json`](examples/koeln-alleycat-beispiel.json) — sample event to browse/import
- [`examples/kölner_kurier-alleycat-manifest.pdf`](examples/kölner_kurier-alleycat-manifest.pdf) — sample manifest export
- [`test-suite.js`](test-suite.js) — end-to-end test suite; paste its contents into the browser console of a running `dist/` build and call `runAlleycatTestSuite()`. Runs unchanged against both variants.
- [`docs/`](docs/) — roadmap ([`docs/alleycat-dispatch-roadmap-14-23.md`](docs/alleycat-dispatch-roadmap-14-23.md)) plus spec and archive documents from project planning (German only).

## Development

Source lives in `src/` (see [`CLAUDE.md`](CLAUDE.md) for the module overview), `dist/` is pure, non-versioned build output — **never edit `dist/*.html` directly**, it gets overwritten by the next `node build.js`.

Everything in `src/core/` must build byte-identical across both variants; backend-specific behavior belongs in `src/storage/storage-local.js` or `storage-server.js`, wired through the two storage seams `initStorageBackend()` and `renderStorageDashboardExtras()` (details in `CLAUDE.md`). After every change: `node build.js`, then `diff dist/alleycat-dispatch-local.html dist/alleycat-dispatch-server.html` — should still differ only in the known storage regions.

## Roadmap

13 of 14 planned work packages are done (details: [`docs/alleycat-dispatch-roadmap-14-23.md`](docs/alleycat-dispatch-roadmap-14-23.md)). Open:

- **Test the PHP backend on real hosting** — only verified against local MariaDB so far, not yet installed on real shared hosting
- **Rider self-registration** — a public signup link instead of only organizer-generated bib-number slots
- **Live multi-checkpoint check-in / live spectator leaderboard** — only possible via `alleycat-dispatch-server.html`, currently still blocked by the missing concurrency protection in the storage protocol (last writer wins)

Deliberately deferred: offline device sync via screen-to-camera QR (idea only, not an active work package).

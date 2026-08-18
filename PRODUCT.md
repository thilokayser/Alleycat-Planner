# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, roughly equal in importance: volunteer/community organizers from the bike-messenger/alleycat scene running a single event (technically comfortable with a browser app, no IT team, usually a tight budget), and professional event organizers running multiple events per year, sometimes with checkpoint-marshal staff. Both act through the app's single role — "Organizer" — who plans the event, places checkpoints, prints materials, runs finish-line check-in, and monitors the race live.

## Product Purpose

Alleycat Dispatch lets an organizer run an entire alleycat (bike checkpoint race) end to end: create an event, place checkpoints on a map, print bib numbers and spokecards, run finish-line check-in, keep a live leaderboard, and export a manifest as PDF. Success means an organizer can plan and run raceday logistics — including under unreliable connectivity — without needing a server, an account, or IT support.

## Positioning

Purpose-built for the alleycat checkpoint-race format, not a generic event-ticketing tool. Checkpoint types map to real alleycat mechanics (QR scan, photo proof, item drop-off, riddle/custom question, marshal-scored challenge), and the app layers on race-specific systems no generic tool offers: a game-modes engine (Battle Royale with shrinking zones, Bezirke/districts, bonus/secret checkpoints, sudden death, and more), a race-status state machine with curfew logic, offline map-tile caching for spotty raceday connectivity, and a live beamer/projector display synced across devices. The local variant needs zero server, zero account, and zero install — open one HTML file in a browser.

## Operating Context

Used across the full event lifecycle: pre-race planning (placing checkpoints on a map, defining routes, printing bib numbers/spokecards/manifest/staff briefings), raceday operation (finish-line check-in on a phone or tablet, often outdoors with variable connectivity and bright sunlight, a live beamer/projector screen for spectators, and per-checkpoint marshal staff who need printed briefings but must never see rider-facing exports), and post-race wrap-up (leaderboard export, results/social-share cards). Two deployment variants cover the two device scenarios: a local SQLite-in-browser build for a single organizer/device, and a PHP/MySQL-backed build for multiple organizers/devices sharing the same event. Runs directly from a single HTML file with no build step for the end user; German is the only populated UI language today (the i18n structure is translation-ready but only `de` exists).

## Capabilities and Constraints

Event/checkpoint CRUD with 5 built-in plus custom checkpoint types; teams and freeform category groups; a race-status machine (planning → ready → running → completed) with checkpoint-structure locking and a blocking scheduled-start dialog; free or fixed checkpoint order (fixed order enforces sequence with an audited override); a 7-mode game-modes engine plus a generic zones system (circle/polygon, continuous or staged shrink) and HQ/Afterparty special locations; a block-based PDF builder (waiver, rules, sponsors, checkpoint list, notes, emergency info, event locations) attachable to manifest and/or spokecards; CSV bulk rider import with validation; offline map-tile caching, auto-backup, and Wake Lock during a running race; a live beamer view synced via BroadcastChannel + storage polling; 5 themes (including a high-contrast "Sonnenlicht" outdoor mode) and 3 icon packs. Deliberately dependency-arm: only Leaflet (plus the explicitly documented Leaflet.draw exception), jsPDF, and sql.js are external runtime dependencies. Everything in `src/core/` must build byte-identical across both storage variants; backend-specific behavior is isolated behind two storage seams (`initStorageBackend()`, `renderStorageDashboardExtras()`).

## Brand Commitments

Name: "Alleycat Dispatch." Visual identity is already established in the shipped app — not a blank slate: a stamp/dispatch-inspired "AC" mark, a terracotta/safety-orange accent (`--hivis`, `#ff5f1f`) on a dark asphalt base theme plus a paper/cream secondary theme, JetBrains Mono (mono/technical labels) + Oswald (display) + Inter (body) typography, 5 selectable themes, and 3 icon packs (Emoji, Font Awesome, Material Symbols).

## Evidence on Hand

A seeded example event ("Kölner Kurierrennen") ships with the local variant to give first-time users a working example using all 5 checkpoint types; a sample manifest PDF and an example event JSON live in the repo root. No customer testimonials, case studies, or press — this is a single-developer/community project, not a commercially validated product, and future work must not fabricate any.

## Product Principles

- Solve for raceday reality: unreliable connectivity, phones in sunlight, checkpoint marshals who aren't the organizer — never design as if the organizer's laptop on perfect wifi is the only device that matters.
- Stay dependency-arm and install-free: the local variant's entire value proposition is "open one HTML file," so new features should not silently require a server, account, or heavy new dependency without an explicit, documented exception.
- Rider-facing and organizer-facing outputs stay strictly separate: personnel contact info, staff briefings, and internal notes must never leak into rider-facing exports (manifest, spokecards, bib numbers).
- Serve both the volunteer running one event and the professional running many — features should not assume either deep technical sophistication or a dedicated IT/ops team.
- Planning aids inform, they don't overwrite: tools like the route estimator or game-mode suggestions stay advisory and never silently mutate organizer-authored data (checkpoint order, manual settings).

## Accessibility & Inclusion

No formal accessibility standard has been established as a requirement. The "Sonnenlicht" (Outdoor) theme is a de facto accessibility feature — near-maximum contrast and enlarged touch targets for outdoor/sunlight use — but this was a raceday-usability decision, not a WCAG compliance effort.

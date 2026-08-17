# Alleycat Dispatch — Roadmap Phasen 14–23

Stand: 17.08.2026. Fasst die zehn offenen Phasen aus `alleycat-dispatch-feature-uebergabe_1.md` (14–17) und `ubergabe2.md` (18–23) neu zusammen — nicht mehr in der ursprünglichen Dokument-Reihenfolge, sondern semantisch gruppiert und nach Aufwand/Abhängigkeit sortiert. Baut direkt auf [alleycat-dispatch-abgleich-status.md](alleycat-dispatch-abgleich-status.md) und [alleycat-dispatch-abgleich-status-teil2.md](alleycat-dispatch-abgleich-status-teil2.md) auf (dort steht der Zeile-für-Zeile-Code-Abgleich, hier die Planung darauf).

---

## 1. Warum umsortiert? — Die Planungslogik

Die beiden Übergabedokumente wurden nacheinander geschrieben und nummerieren die Phasen chronologisch nach Brainstorming-Reihenfolge, nicht nach Bau-Reihenfolge. Vier Beobachtungen, die zu einer anderen Reihenfolge führen:

1. **Datei-Überschneidung vermeiden.** Phase 15 (Zonen-System) und Phase 18 (Karten-Logistik) bauen beide `map.js` und die Checkpoint-Sidebar um. Phase 17 (PDF-Baukasten 2.0) und Phase 20 (internationale Formate) bauen beide `export-pdf.js` um. Werden solche Paare getrennt nacheinander abgearbeitet, wird dieselbe Datei zweimal grundlegend angefasst — mehr Merge-Aufwand, mehr Regressionsfläche. Sinnvoller: zusammenlegen, in einem Zug bauen.
2. **Infrastruktur vor ihren Konsumenten.** Phase 16 (Feature-Registry) soll *jedes* schaltbare Feature zentral auffindbar machen. Wird sie erst gebaut, nachdem 15, 18 und 21 bereits neue Toggles (Zonen-Modi, Cargo-Modus, Trackbike-Kategorien) eingeführt haben, müssen diese nachträglich verkabelt werden. Registry zuerst spart diesen zweiten Durchgang.
3. **Aufwand/Risiko-Verhältnis.** Phase 19 hat bereits zwei funktionierende Bausteine im Code (Sidebar-Resize, Enter-Submit im Check-in) und keine Abhängigkeiten — günstiger, risikoarmer früher Gewinn. Die Zonen-Migration aus Phase 15 dagegen ist die einzige "echte" Migration unter allen zehn Phasen (bestehender, gestesteter Battle-Royale-Code muss umgebaut werden, ohne `test-suite.js` zu brechen) — bewusst mit Zeit/Testabsicherung eingeplant, nicht verdrängt.
4. **Experimentelles zuletzt.** Phase 22 (Screen-to-Camera-QR-Sync) ist technisch neuartig für dieses Projekt, ohne verlässliche Aufwandsschätzung, und keine andere Phase wartet auf sie. Gehört ans Ende, nicht weil sie unwichtig ist, sondern weil ihr Risiko am wenigsten vorhersehbar ist.

**Entscheidung (17.08.2026):** `alleycat-dispatch-feature-uebergabe_1.md`, Abschnitt 7, hält fest, dass UI-Politur bewusst erst *nach* vollständigem MVP angegangen werden soll. Phase 16 (Settings-Hub, Empty-States) und Phase 19 (Command Palette, Themes, Hover-Sync) sind im Kern genau das — UI-Politur. Bewusste Ausnahme von dieser Regel: beide Pakete werden **jetzt zuerst** gebaut, noch vor dem Backend-Fundament, weil sie der schnellste Weg zu echtem Nutzer-Testing/Feedback sind — ein spürbarer UX-Sprung, den Nutzer sofort merken, ohne dass ein Server-Setup nötig ist. Backend-Härtung (Paket 1) bringt dagegen keinen für Endnutzer sichtbaren Unterschied.

---

## 2. Roadmap: 7 aktive Arbeitspakete + 1 zurückgestellte Idee

| # | Arbeitspaket | Enthält | Aufwand | Status heute |
|---|---|---|---|---|
| **1** | **Schnelle Effizienz-Gewinne** | Phase 19 komplett | M | ✅ abgeschlossen (17.08.2026) |
| 2 | Ordnung vor mehr Features | Phase 16 komplett | M–L | ✅ abgeschlossen (17.08.2026) |
| **3** | **Backend-Fundament** ⭐ jetzt als nächstes | Phase 14 komplett | M | ⚠️ Teilbausteine vorhanden (Prepared Statements, API-Key, `.htaccess`) — Kernstück (Pre-Flight-Check) offen |
| 4 | Großes Karten-Programm | Phase 15 + Phase 18 zusammengelegt | XL | ⚠️ Battle Royale existiert in alter Form (Phase 11), Rest offen |
| 5 | Export & Lokalisierung | Phase 17 + Phase 20 zusammengelegt | L | ❌ vollständig offen |
| 6 | Spezielle Rennformate | Phase 21 komplett | M–L | ❌ vollständig offen |
| 7 | Beamer-Erweiterungen | Phase 23 komplett | S–M | ⚠️ Event-Ticker-Infrastruktur (Phase 12) bereits vorhanden, nur nicht vertont |
| — | *Idee, zurückgestellt:* Offline-Gerätesync (früher Paket 8) | Phase 22 komplett | L (unsicher) | ⚠️ Kamera/QR-Grundlage (jsQR) bereits vorhanden, Stream-Protokoll komplett offen — **kein aktives Arbeitspaket**, wandert zu den "vertagten Ideen" wie Kopfgeld-Modus/Service-Worker in der ursprünglichen Übergabe |

Aufwand-Skala: S = klein (wenige, isolierte Änderungen), M = mittel (ein neues Modul oder mehrere verteilte Änderungen), L = groß (neues Modul + Umbau bestehender Kernlogik), XL = sehr groß (mehrere neue Module + Migration bestehender, produktiver Daten).

**Entscheidung 17.08.2026:** Pakete 1 und 2 (vormals 2 und 3) werden bewusst vor das Backend-Fundament gezogen — als Ausnahme von "MVP vor UI-Politur", um schnell echtes Nutzer-Feedback zu bekommen. Paket "Offline-Gerätesync" (vormals Paket 8) ist aus der aktiven Roadmap raus, bleibt als Idee vorgemerkt.

**Abhängigkeiten zwischen den Paketen:**
- Paket 2 (Registry) sollte vor Paket 4 und 6 stehen, da beide neue Toggles einführen, die die Registry sonst nachträglich aufnehmen muss.
- Paket 5 sollte vor Paket 6 stehen: der neue `clue_sheet`-PDF-Block aus Phase 21 baut sinnvoll auf dem in Phase 17 erweiterten Block-System auf (Breiten/Layout), nicht auf dem alten linearen.
- Paket 3 (Backend) ist zu allen anderen unabhängig (reines PHP-Backend) — kann parallel zu jedem anderen Paket laufen, falls Kapazität für zwei Spuren gleichzeitig da ist.
- Paket 7 ist zu allen anderen unabhängig.

**Aktuelle Bau-Reihenfolge:** 1 → 2 → 3 → 4 → 5 → 6 → 7, mit der Möglichkeit, Paket 3 jederzeit parallel einzuschieben, da es keine gemeinsamen Dateien mit den anderen Paketen berührt.

---

## 3. Detaillierte To-Do-Liste

Checkboxen markieren, was laut Code-Abgleich bereits existiert. Alles ohne `[x]` ist noch zu bauen.

### Paket 3 — Backend-Fundament (Phase 14)

- [x] Prepared Statements durchgängig (`api.php`)
- [x] API-Key ≥32 Byte, zufällig
- [x] `.htaccess`-Schutz für `config.php`
- [x] `utf8mb4` als Charset gesetzt
- [ ] Pre-Flight-Check-Modul (PHP-Version, Extensions, `utf8mb4`-Fallback, MySQL-Version, Schreibrechte, `max_execution_time`, `memory_limit`) + Einhängen in `install.php` vor jedem DB-Schreibvorgang
- [ ] `utf8mb4`→`utf8`-Fallback-Logik (aktuell hart verdrahtet ohne Fallback)
- [ ] `display_errors` in Produktion deaktivieren + serverseitiges Fehler-Logging statt Fehlerausgabe im Response-Body
- [ ] API-Key-Hashing in der DB (aktuell Klartext in `config.php`)
- [ ] `install.php`-Selbstsperre/Löschhinweis nach Erstnutzung
- [ ] Server-seitiger Backup-Export-Endpoint (DB als JSON/SQL-Dump)
- [ ] Migrations-Verifikation gegen frische + befüllte Test-DB
- [ ] Race-Condition-Testfälle (Doppel-Check-in, gleichzeitiges Bearbeiten)
- [ ] Mini-Lasttest (~100 Fahrer, 10 CPs, parallele Requests)
- [ ] `COMPATIBILITY.md` anlegen
- [ ] Realer Testlauf auf `hasencore.de`, Ergebnis in `COMPATIBILITY.md` eintragen
- [ ] `INSTALL.md`/README um Mindestanforderungen + "bei Rot → lokale Variante empfehlen" ergänzen

### Paket 1 — Schnelle Effizienz-Gewinne (Phase 19) ✅ abgeschlossen (17.08.2026)

- [x] Resizable Sidebar mit `localStorage`-Persistenz (`map.js`)
- [x] Enter-Submit im Check-in-Startnummernfeld (Grundlage für Numpad-Workflow)
- [x] Vollständiges Einklappen der Sidebar (Toggle-Button)
- [x] Globale Tab-Shortcuts (1–6 für Navigation, Esc bricht aktive Modi/Modals ab)
- [x] Command Palette (Cmd/Ctrl+K, Fuzzy-Suche über Navigation/Fahrer/Checkpoints/Schnellaktionen)
- [x] High-Contrast Outdoor-Theme (5. Theme, `theme-outdoor`)
- [x] Hover-Sync zwischen Checkpoint-Sidebar-Zeile und Karten-Marker
- [x] Bulk-Actions (Shift-Klick-Mehrfachauswahl + Aktionsleiste) für Checkpoint-Zeilen
- [x] In-Page-PDF-Vorschau (Modal statt Direkt-Download bei Manifest/Personal-Briefing)

Details siehe [CLAUDE.md](CLAUDE.md), Abschnitt "Paket 1 (Phase 19): UI-Effizienz-Gewinne". 38 neue Checks in `test-suite.js` (361/361 bestanden), inkl. eines während der Verifikation gefundenen und behobenen echten Bugs (Leaflet-Kartengröße konnte durch einen verzögerten `invalidateSize()`-Aufruf bei ausgeblendetem Karten-Container auf 0×0 einfrieren).

### Paket 2 — Ordnung vor mehr Features (Phase 16) ✅ abgeschlossen (17.08.2026)

- [x] `src/core/feature-registry.js`: `FEATURE_REGISTRY` + `isFeatureEnabled(id, evt)`/`toggleFeature(id)`
- [x] Bestehende Features nachträglich eintragen (Kategorien, Spielmodi, Sound-Hook, Offline-Cache) — reine Verkabelung
- [x] Settings-Hub-UI (Liste, Toggle, Suche, Sprung zu Detail-Konfiguration)
- [x] `src/core/empty-states.js` (wiederverwendbare Komponente)
- [x] Empty States einbauen: Checkpoint-Liste, Fahrerliste, Leaderboard vor Rennstart, Dashboard "Letzte Aktivität" — Zonen-Editor verschoben, da das Zonen-System selbst erst mit Paket 4 entsteht
- [x] `src/core/social-share.js` (Canvas-Rendering + Web Share API mit Download-Fallback)
- [x] Social-Share-Button in der Übersicht (Status "Abgeschlossen") — Beamer-Podium-Screen folgt, sobald Paket 4 ihn liefert

Details siehe [CLAUDE.md](CLAUDE.md), Abschnitt "Paket 2 (Phase 16): Feature-Registry & Settings-Hub". 33 neue Checks in `test-suite.js` (391/391 bestanden). Scoping-Entscheidungen: `battle_royale`/`districts` fehlen bewusst in der Registry (existieren erst mit dem Zonen-System aus Paket 4); die Event-Scope-Einträge `categories`/`game_modes` sind reine, additive UI-Sichtbarkeits-Flags (`evt.featureFlags`) und lassen die bestehenden Datenmodelle (`categoryGroups`/`gameModes`) unangetastet.

### Paket 4 — Großes Karten-Programm (Phase 15 + 18)

*Teil A — Zonen-Fundament (aus Phase 15, zuerst — Phase 18 baut mit auf der aktualisierten Karten-Renderpipeline auf):*
- [ ] `src/core/zones.js`: Datenmodell (Kreis + Polygon) + Geometrie-Helfer (Point-in-Circle/Polygon) + Tests
- [ ] Leaflet.draw einbinden (bewusste Dependency-Ausnahme, in README/`PROJEKT-UEBERSICHT.md` dokumentieren) + Zonen-Editor-UI
- [ ] Bestehenden Battle-Royale-Code (`zone_active` in `game-modes.js`/`rules-engine.js`) auf das neue Zonen-System migrieren — **Regressionsgefahr, bestehende Battle-Royale-Tests müssen grün bleiben**
- [ ] Neuer Spielmodus-Preset "Bezirke" (mehrere gleichzeitig aktive Zonen)
- [ ] `src/core/event-locations.js`: HQ/Afterparty-Datenmodell, Checkpoint-Checkbox "ist HQ", freistehender Marker
- [ ] Kartenrendering (HQ + Beamer) um Polygon-Support, Sichtbarkeits-Toggles, Legende erweitern
- [ ] Mobile `CollapsibleMapPanel` (Default eingeklappt <768px, `localStorage`-persistiert) — Ausnahme: Zonen-Editor ignoriert Collapse-Zustand
- [ ] PDF-Block `event_locations`, Dashboard-Zeile Afterparty, Beamer-Podium-/Afterparty-Screen

*Teil B — Logistik-Intelligence (aus Phase 18, auf derselben aktualisierten Karte):*
- [ ] TSP-Routen-Estimator (2-Opt-Heuristik) + Richtzeit-Rechner, Legenden-Integration (Min./Max.-Distanz)
- [ ] Proximity-Puffer-Ringe (schaltbares Layer) + Klumpen-Warnung im To-dos-Widget
- [ ] Logistik-Overlay: Marker-Farbbadges nach Personal-/Material-Status, Klick-zu-Inline-Bearbeitung
- [ ] Orga-Pins (`event_orga_pins`) + Rechtsklick-Kontextmenü (Checkpoint anlegen / HQ setzen / Afterparty definieren / Notiz anheften / Adresse suchen)
- [ ] GeoJSON/GPX/KML-Import per Drag & Drop + 1-Klick-Checkpoint-Übernahme aus importiertem Track
- [ ] Clue-Vorschau-Modus (Toggle blendet Rätseltexte statt Checkpoint-Namen ein)

### Paket 5 — Export & Lokalisierung (Phase 17 + 20)

*Teil A — Einheiten/Formate-Fundament (aus Phase 20, zuerst — Teil B nutzt diese Helfer):*
- [ ] `formatDistance(meters)` zentraler Helfer mit Metrisch/Imperial-Switch, alle bestehenden Distanzstellen darauf umstellen
- [ ] 12h/24h-Zeitformat-Switch für `formatDateTime`/`formatTimeOnly`
- [ ] Koordinatenanzeige-Switch (Dezimalgrad/DMS/UTM/MGRS)
- [ ] Community-Sprachpakete: JSON-Import/Export in `i18n.js` + Settings-UI

*Teil B — PDF-Baukasten 2.0 (aus Phase 17, nutzt Teil A für z. B. den `table`-Block mit Checkpoint-Distanzen):*
- [ ] `width`/`page_break_before`-Feld an `pdf_blocks` (Default `'full'`, rückwärtskompatibel)
- [ ] `layoutBlocks()` Auto-Flow-Rendering + Tests (Breiten-Kombinationen, Seitenumbruch, Edge Case >100%)
- [ ] `pdf_page_format` (A4/US Letter) im Event, dynamischer Satzspiegel in `export-pdf.js`, optionale Schnittmarken
- [ ] UI: Breiten-Dropdown + Seitenumbruch-Checkbox pro Block
- [ ] Neue Blocktypen: `image` (mit Client-Komprimierung), `table` (App-Daten-Quellen), `variable_text` (Platzhalter-Interpolation)
- [ ] Vorschau-Funktion (PDF im Hintergrund gerendert, als Bild angezeigt)
- [ ] Dokument-Typ-Vorlagen (Default-Blocksets pro Dokumenttyp) + "Auf Standard zurücksetzen"
- [ ] Vorlagen-Export/-Import um Breiten/Dokumenttyp erweitern
- [ ] Regressionstest: bestehende Manifeste/Spokecards vor der Migration müssen optisch identisch bleiben

### Paket 6 — Spezielle Rennformate (Phase 21)

- [ ] Cargo-Modul: `is_cargo_event`, `cp.cargo_item` (Name/Gewicht/Volumen/Bonuspunkte), `rider.cargo_capacity_kg`, Punkteberechnung im Ziel-Check-in (andockend an `points_ledger` aus Phase 11)
- [ ] Trackbike-Attribute: `gear_ratio`, `is_brakeless`, `is_workbike` + Leaderboard-Filter/Badges ("Fastest Brakeless", "Best Workbike")
- [ ] PDF-Block `clue_sheet` (nutzt das in Paket 5 erweiterte Block-System)

### Paket 7 — Beamer-Erweiterungen (Phase 23)

- [x] Event-Ticker-Infrastruktur bereits vorhanden (`pushEventLog()`, Phase 12) — liefert die Ereignisse, die vertont werden sollen
- [ ] `speechSynthesis`-Integration: Beamer-Settings-Toggle, Stimme/Lautstärke/Geschwindigkeit einstellbar
- [ ] `SpeechRecognition`-Integration: Voice-Check-in im Ziel-Marshal-Flow ("Startnummer 42 Ziel")

---

## 4. Zurückgestellte Ideen (nicht Teil der aktiven Roadmap)

### Offline-Gerätesync (Phase 22, Screen-to-Camera Optical Sync)

Vorerst nur Idee, kein aktives Arbeitspaket — Entscheidung vom 17.08.2026. Einzige Phase mit unsicherem Aufwand, adressiert einen Nischen-Anwendungsfall (Checkpoints ganz ohne Mobilfunknetz). Steht im selben "vertagt/offen"-Bereich wie Kopfgeld-Modus oder Service-Worker aus der ursprünglichen Übergabe — wird erst wieder aufgegriffen, wenn konkreter Bedarf entsteht.

- [x] Kamera-Zugriff + QR-Decoding-Grundlage bereits vorhanden (`jsQR`, bestehender QR-Scan-Checkpoint-Typ in `checkin.js`) — falls die Idee später aktiviert wird, muss hier nicht bei null gestartet werden
- [ ] Sender: animierter Multi-Frame-QR-Code-Stream (JSON-Paket-Encoding über mehrere Frames)
- [ ] Empfänger: Webcam-Loop-Decoding mehrerer Frames zu vollständigem Datensatz, Einfügen in HQ-DB

---

## 5. Offene Rückfrage

**Kapazität für Parallel-Spuren:** Paket 3 (Backend) berührt keine Datei, die die anderen Pakete anfassen — lohnt es sich, es wirklich parallel zu Paket 1/2 zu bauen, oder bleibt strikt sequenziell (ein Paket nach dem anderen) einfacher zu verfolgen? Bisher unentschieden, aber nicht blockierend für den Start von Paket 1.

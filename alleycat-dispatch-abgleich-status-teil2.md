# Abgleich Teil 2: `ubergabe2.md` (Phasen 18–23) vs. Code-Stand

Stand: 17.08.2026. Ergänzt [alleycat-dispatch-abgleich-status.md](alleycat-dispatch-abgleich-status.md) (Phasen 0–17) um den Abgleich der zweiten Übergabe. Direkt gegen `src/core/`, `src/styles/`, `templates/` geprüft.

## Kurzfassung

Von den sechs neuen Phasen ist ebenfalls **keine** umgesetzt. Zwei Stellen im Code sind aber bereits nah an Teilanforderungen aus Phase 19 dran — der Rest (18, 20, 21, 22, 23) ist vollständiger Neubau ohne Vorarbeit.

---

## Phase 18 — Karten-Planungsmodus & Logistik-Intelligence: **nicht umgesetzt**

| Anforderung | Code-Realität |
|---|---|
| TSP-Routen-Estimator (2-Opt) | ❌ nicht vorhanden — `computeRouteLegs()` (`utils.js`) berechnet nur die Distanz in fester `sequence`-Reihenfolge, keine Rundreise-Optimierung |
| Proximity-Puffer-Ringe (`state.mapSettings.showProximityRings`) | ❌ nicht vorhanden |
| Klumpen-Warnung im To-dos-Widget | ❌ `computeDashboardTodos()` prüft aktuell keine CP-Abstände zueinander |
| Logistik-Overlay (Marker-Farbbadges 🔴🟡🟢📦) | ❌ nicht vorhanden — Checkpoint-Marker sind aktuell nach Checkpoint-**Typ**, nicht nach Personal-Status eingefärbt |
| Sidebar-Personal-Badge (👤 0/👤 2) | ⚠️ teilweise verwandt — es gibt bereits einen Personal-**Count**-Badge in der CP-Zeile (`checkpoint.js`, Teil der „Checkpoint-Liste"-Erweiterung aus Phase 7), aber ohne die hier geforderte Klick-zu-Inline-Bearbeitung als explizites Verhalten dokumentiert und ohne Ampel-Logik |
| Orga-Pins (`event_orga_pins`) + Rechtsklick-Kontextmenü | ❌ nicht vorhanden, kein `contextmenu`-Handling auf der Karte |
| GeoJSON/GPX/KML-Import per Drag & Drop | ❌ nicht vorhanden (der bestehende GPX-Bezug in `export-gpx.js` ist reiner **Export**, kein Import) |
| Clue-Vorschau-Modus | ❌ nicht vorhanden |

**Einordnung:** Baut auf denselben Kartengrundlagen wie Phase 15 (`map.js`, Checkpoint-Sidebar) auf, ist aber inhaltlich unabhängig von der dortigen Zonen-Migration — beide Phasen könnten parallel geplant, sollten aber nicht gleichzeitig an `map.js` gearbeitet werden (Merge-Risiko), falls beide in Angriff genommen werden.

---

## Phase 19 — Performance UI/UX & Keyboard-Workflow: **nicht umgesetzt**, zwei Teilanforderungen bereits erfüllt

| Anforderung | Code-Realität |
|---|---|
| Command Palette (Cmd/Ctrl+K) | ❌ nicht vorhanden |
| Numpad-Fast-Check-in (Enter bestätigt sofort) | ✅ **im Kern bereits vorhanden** — `checkin-bib-input` in `checkin.js` ruft bei Enter bereits `findCheckinRider()` auf, Fokus-Workflow existiert strukturell schon (auch wenn nicht explizit als "Numpad-Modus" benannt) |
| Globale Tab-Shortcuts (1–6, Esc) | ❌ nicht vorhanden — keine `keydown`-Listener auf Dokumentebene für Navigation |
| Resizable Sidebar mit `localStorage`-Persistenz | ✅ **bereits vorhanden** — `map.js`s `sidebar resize`-Abschnitt (aus Phase 0) persistiert die Breite exakt wie hier gefordert (`alleycat:sidebarWidth` in `localStorage`) |
| Vollständiges Einklappen der Sidebar (Toggle `◄`/`►`) | ❌ fehlt — nur stufenloses Ziehen, kein Ein-Klapp-Button |
| High-Contrast Outdoor-Theme (5. Theme) | ❌ nicht vorhanden — weiterhin nur die 4 bestehenden Themes (Feldpost/Hell/Dunkel/Dracula) in `themes.css` |
| Hover-Sync (Sidebar-Zeile ↔ Karten-Marker-Pulse) | ❌ nicht vorhanden |
| Bulk-Actions (Shift-Klick-Mehrfachauswahl) | ❌ nicht vorhanden — Checkpoint-Zeilen unterstützen aktuell nur Einzel-Aktionen |
| In-Page-PDF-Vorschau (statt Download) | ❌ nicht vorhanden — alle PDF-Exporte (`export-pdf.js`) lösen direkt einen Download aus, kein Vorschau-Modal |

**Einordnung:** Die einzige Phase der ganzen zweiten Übergabe mit echtem Vorlauf im Code. Wer hier anfängt, baut auf zwei bereits funktionierenden Bausteinen auf (Resize-Mechanik, Enter-Submit im Check-in) statt bei null.

---

## Phase 20 — Internationale Standards & Lokalisierung: **nicht umgesetzt**

| Anforderung | Code-Realität |
|---|---|
| Metrisch/Imperial-Switch, `formatDistance(meters)` | ❌ nicht vorhanden — Distanzformatierung in `utils.js` ist aktuell fest auf km/m verdrahtet, kein zentraler `formatDistance()`-Helfer mit Einheiten-Parameter |
| 12h/24h-Zeitformat-Switch | ❌ nicht vorhanden — `formatDateTime`/`formatTimeOnly` (`utils.js`) sind fest auf `de-DE`-Konventionen (24h) |
| UTM/MGRS/DMS-Koordinatenanzeige | ❌ nicht vorhanden, nur Dezimalgrad |
| `pdf_page_format` (A4 vs. US Letter) | ❌ nicht vorhanden — `export-pdf.js` nutzt durchgängig feste A4-Maße |
| Community-Sprachpakete (JSON-Import/Export für `i18n.js`) | ❌ nicht vorhanden — `i18n.js` hat weiterhin nur den `de`-Block, keinerlei Import/Export-Mechanismus |

**Einordnung:** Größte Einzelmenge an neuer Infrastruktur-Arbeit (Einheiten-Abstraktion zieht sich durch viele bestehende Formatierer), aber sauber vom Rest entkoppelt — reine Zusatzschicht über bestehenden Funktionen, kein Umbau-Risiko wie bei Phase 15.

---

## Phase 21 — Spezielle Alleycat-Rennformate: **nicht umgesetzt**

| Anforderung | Code-Realität |
|---|---|
| Cargo-Modul (`is_cargo_event`, `cp.cargo_item`, `rider.cargo_capacity_kg`) | ❌ nicht vorhanden |
| Trackbike-Attribute (`gear_ratio`, `is_brakeless`, `is_workbike`) + Leaderboard-Badges | ❌ nicht vorhanden |
| Clue-Sheet-PDF-Block | ❌ nicht vorhanden — die 7 bestehenden `PDF_BLOCK_TYPES` in `pdf-blocks.js` enthalten keinen `clue_sheet`-Typ |

**Einordnung:** Cargo-Punktelogik würde sinnvoll an die bestehende `rules-engine.js`/`points_ledger`-Infrastruktur aus Phase 11 andocken (gleiches Muster wie `first_n`/`sequence_match`), ist aber inhaltlich komplett neu.

---

## Phase 22 — Screen-to-Camera Optical Sync: **nicht umgesetzt**

| Anforderung | Code-Realität |
|---|---|
| Sender: animierter QR-Code-Stream | ❌ nicht vorhanden |
| Empfänger: Webcam-Loop via `jsQR` | ⚠️ **Grundstein vorhanden** — `jsQR` ist bereits als CDN-Dependency in beiden Templates eingebunden und wird in `checkin.js` bereits für den bestehenden QR-Scan-Checkpoint-Typ verwendet (`getUserMedia`-Kamerazugriff existiert also strukturell schon im Projekt) — die eigentliche Stream-Encoding/Decoding-Logik für mehrframige JSON-Pakete fehlt aber komplett |

**Einordnung:** Technisch der ungewöhnlichste Punkt im ganzen Dokument, aber die Grundvoraussetzung (Kamera-Handling + QR-Decoding im Browser) ist durch die bestehende Check-in-QR-Funktion bereits einmal gelöst und wiederverwendbar.

---

## Phase 23 — Beamer-Moderator & Web Speech API: **nicht umgesetzt**

| Anforderung | Code-Realität |
|---|---|
| `speechSynthesis`-Integration im Beamer | ❌ nicht vorhanden |
| `SpeechRecognition`/Voice-Check-in | ❌ nicht vorhanden |

**Einordnung:** Reine Zusatzschicht über den bereits existierenden Event-Ticker (`pushEventLog()` in `rules-engine.js`, aus Phase 12) — die Ereignisse, die vorgelesen werden sollen, werden strukturell schon erzeugt, nur eben aktuell nur visuell im Beamer-Ticker angezeigt, nicht vertont.

---

## Gesamteinschätzung Teil 2

Auch dieses Dokument überzeichnet nichts — alle sechs Phasen sind tatsächlich vollständig offen. Bemerkenswert für die Priorisierung:

- **Phase 19** hat als einzige bereits zwei funktionierende Bausteine im Code (Sidebar-Resize, Enter-Submit im Check-in) und keine Abhängigkeit zu offenen Phasen aus Teil 1 — günstigster Einstiegspunkt, falls UI/UX vor den größeren Datenmodell-Phasen (18, 20, 21) Priorität bekommen soll.
- **Phase 22** und **Phase 23** docken beide an bereits bestehende Infrastruktur an (QR-Kamera-Handling bzw. Event-Ticker) — geringeres Neubau-Risiko als es die ungewöhnlichen Themen vermuten lassen.
- **Phase 18** teilt sich die Karten-Codebasis mit dem noch offenen Phase 15 aus Teil 1 (`map.js`, Checkpoint-Sidebar) — bei paralleler Priorisierung beider Dokumente lohnt sich, Phase 15 und Phase 18 gemeinsam zu planen statt nacheinander unabhängig, um doppelte Kartenrendering-Umbauten zu vermeiden.

**Zusammen mit Teil 1 ergibt sich damit ein Gesamtbild von 10 offenen Phasen (14–23).** Keine davon überschneidet sich inhaltlich in einer Weise, die eine Reihenfolge zwingend vorgibt — außer der oben genannten Karten-Überschneidung zwischen 15 und 18, und der bereits in Teil 1 festgehaltenen Empfehlung, Phase 14 zuerst zu machen (Fundament für die Server-Roadmap).

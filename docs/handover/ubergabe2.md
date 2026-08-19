Alleycat Dispatch — Feature-Übergabe für Agenten (Teil 2: Phasen 18–23)

Dieses Dokument setzt den Arbeitsauftrag und Phasenplan aus alleycat-dispatch-feature-uebergabe_1.md nahtlos fort. Es dient als verbindliche Spezifikation für KI-Agenten (Claude Code / Sonnet) zur Umsetzung der nächsten Entwicklungsstufen mit Fokus auf HQ-Planungsmodus, UI/UX-Workflow, internationale Community-Features, Spezial-Rennformate und dezentrale Offline-Sync-Technologien.

Inhaltsverzeichnis

Architecture Constraints & Paritäts-Gebot (Refresher)
Phasen-Übersicht (Phasen 18–23)
Phase 18: Karten-Planungsmodus & Logistik-Intelligence (HQ Map Mode)
Phase 19: Performance UI/UX, Keyboard-Driven Workflow & Layout-Flexibilität
Phase 20: Internationale Standards & Lokalisierung (i18n & Formate)
Phase 21: Spezielles Alleycat-Rennformate-Modul (Cargo, Trackbike & Clues)
Phase 22: Screen-to-Camera Optical Sync (Lokal-dezentraler Kamera-Sync)
Phase 23: Beamer-Moderator & Auditive Barrierefreiheit (Web Speech API)
Scope-Tabelle (Local-First vs. Server-only)
Test-Driven Parity & Refactoring-Guide
1. Architecture Constraints & Paritäts-Gebot (Refresher)

Vor jeder Implementierung im Rahmen dieser Übergabe gelten folgende unumstößliche Prinzipien:

Local-First & Zero-Server-Dependency: Alle Features der lokalen Variante (alleycat-dispatch-local.html) müssen zu 100 % im Browser ohne aktiven HTTP-Server, ohne Node-Laufzeit und ohne externe Cloud-APIs funktionieren.
Byte-Identischer Quellcode in src/core/: Alle neuen Features werden in Modulen unter src/core/ abgelegt. storage-local.js und storage-server.js bedienen weiterhin ausschließlich die definierten Storage-Seams.
Keine Direkt-Edits in dist/*.html: Änderungen erfolgen ausschließlich in src/ und templates/. Jeder Entwicklungszyklus schließt mit node build.js ab.
Keine schweren Fremd-Frameworks: Reines Vanilla JS mit direktem DOM-Rendering. Für spezialisierte Aufgaben (z. B. Leaflet.draw für Zonen, QR-Decoding via jsQR) werden leichtgewichtige, vendorisierte bzw. fest eingebundene Bibliotheken verwendet.
i18n-Konformität ab Zeile 1: Jede Benutzeroberflächen-Zeichenkette verwendet das t('namespace.key')-Pattern.
2. Phasen-Übersicht (Phasen 18–23)

Phase	Thema	Priorität	Kerninhalt
18	Karten-Planungsmodus & Logistik-Intelligence	Sehr Hoch	TSP-Routen-Estimator, Proximity-Puffer-Ringe, Logistik-Overlay, Orga-Pins, GeoJSON/GPX-Import, Clue-Preview
19	Performance UI/UX & Keyboard Workflow	Sehr Hoch	Command Palette (Cmd+K), Numpad-Fast-Check-in, Resizable Sidebar, Outdoor-High-Contrast-Theme, Hover-Sync, In-Page PDF Preview
20	Internationale Standards & Lokalisierung	Hoch	Metrisch/Imperial, 12h/24h, UTM/MGRS, US Letter vs. A4, Community-i18n-Import/Export
21	Spezielle Alleycat-Rennformate	Mittel	Cargo-Alleycat-Modul (Gewicht/Volumen), Trackbike/Workbike-Kategorien, Clue-Sheet-Generator
22	Screen-to-Camera Optical Sync	Mittel	Dezentraler Kamera-Sync via animiertem QR-Code-Stream (Screen-to-Cam) ohne Netzwerk
23	Beamer-Moderator & Web Speech API	Zukünftig	Browser-native Sprachausgabe (Text-to-Speech) für den Beamer & Voice-Check-in
3. Phase 18: Karten-Planungsmodus & Logistik-Intelligence (HQ Map Mode)

18.1 TSP-Routen-Estimator & Distanz-Analyse

Problem: Bei freier Checkpoint-Reihenfolge ist schwer einzuschätzen, wie viele Kilometer die schnellste Linie hat und wo die Schmerzgrenze für Curfews liegt.
Spezifikation:
Clientseitige Berechnung der mathematisch kürzesten Rundreise (Traveling Salesperson Problem via 2-Opt Heuristik) sowie einer realistischen ungünstigen Route.
Legenden-Integration: In der schwarzen Karten-Legende (unten links) wird live die geschätzte Streckenlänge eingeblendet: 📏 Min. 8.4 km / Max. 14.2 km (Luftlinie)
Richtzeit-Rechner: Eingabe einer geschätzten Durchschnittsgeschwindigkeit (z. B. 22 km/h Kurier-Schnitt) berechnet automatisch die geschätzte Mindestfahrzeit zur Konfiguration der Zielschluss-Zeit (Curfew).
18.2 Proximity-Puffer-Ringe & Dichte-Check

Spezifikation:
Schaltbares Layer auf der Karte (state.mapSettings.showProximityRings).
Zeichnet semi-transparente Puffer-Kreise (500m / 1km / 2km) um jeden Checkpoint.
Klumpen-Warnung: Liegen zwei Pflicht-Checkpoints unter 300 Meter auseinander, erscheint eine Warnung im Dashboard-Widget "To-dos" ("Checkpoints X und Y liegen sehr nah beieinander").
18.3 Logistik-Overlay für Checkpoints (Personal & Material)

Spezifikation:
Karten-Marker-Badges: Checkpoint-Marker auf der Karte erhalten Farbindikatoren für den Besetzungsstatus:
🔴 Personal fehlt
🟡 Personal zugewiesen, Schicht unbestätigt
🟢 Vollständig besetzt
📦 Material eingeplant (Stempel/Requisiten)
Sidebar-Anzeige: Neben den Schnell-Aktionen (Duplizieren/Sperren) zeigt jede CP-Zeile ein kompaktes Badge (👤 0, 👤 2).
Klick-Verhalten: Klick auf das Personal-Badge öffnet direkt die Inline-Bearbeitung für das Personal (cp.staff), ohne den Kartenkontext zu verlassen.
18.4 Orga-Pins & Kontext-Aktionen auf der Karte

Spezifikation:
event_orga_pins: id, event_id, lat, lng, type ('warning'|'danger'|'note'|'info'), title, notes, visible_on_hq_only (Standard: true).
Orga-Pins sind rein interne Planungsmarker (Baustellen, gefährliche Kreuzungen, Sammelpunkte). Sie werden niemals auf Fahrer-Manifesten oder in der Beamer-Ansicht gerendert.
Rechtsklick-Kontextmenü (Leaflet contextmenu Event):
┌─────────────────────────────────────────┐
│ + Checkpoint hier anlegen               │
│ 🏠 HQ hierher setzen                    │
│ 🎉 Afterparty definieren               │
│ 📌 Orga-Notiz anheften                  │
│ 🔍 Adresse / Ort suchen                 │
└─────────────────────────────────────────┘
18.5 GeoJSON / GPX / KML Multi-Layer Import

Spezifikation:
Drag & Drop von .gpx-, .geojson- oder .kml-Dateien direkt auf das Kartenfeld.
Datei wird als temporärer oder persistenter Referenz-Layer gerendert (z. B. städtisches Hauptradnetz, Komoot-Vorplanung).
1-Klick-Übernahme: Klick auf einen Waypoint in einem importierten Track bietet die Option [ Als Checkpoint übernehmen ].
18.6 Clue- & Rätsel-Vorschau-Modus

Spezifikation:
Toggle-Button im Karten-Header: [ 👁 Clue-Vorschau ].
Blendet die Standard-Checkpoint-Namen aus und zeigt stattdessen die hinterlegten Rätsel- und Hinweistexte direkt in den Karten-Popups und in der Sidebar an.
Ermöglicht dem Organizer das gedankliche "Abfahren" und Validieren der Rätsel-Logik vor dem Druck.
4. Phase 19: Performance UI/UX, Keyboard-Driven Workflow & Layout-Flexibilität

19.1 Command Palette (Cmd/Ctrl + K)

Spezifikation:
Globales, zentriertes Modal (Overlay), getriggert durch Cmd+K oder Strg+K.
Fuzzy-Suche über:
Navigation (HQ, Karte, Fahrer, Ziel-Check-in, Leaderboard, Settings)
Fahrer (Suche nach Name, Startnummer oder Team)
Checkpoints (Suche nach Name, Typ oder Clue)
Schnellaktionen (Rennen starten, Backup herunterladen, Theme wechseln)
Tastatur-Navigation mit ↑/↓ und Enter zur sofortigen Ausführung.
19.2 Numpad Fast-Check-in & Keyboard Shortcuts

Spezifikation:
Numpad-Workflow im Ziel-Check-in: Fokus liegt standardmäßig im Such/Startnummern-Eingabefeld. Eingabe der Startnummer + Enter bestätigt die Ankunft des Fahrers sofort.
Globale Tab-Shortcuts:
1: Übersicht
2: Karte
3: Fahrer
4: Ziel-Check-in
5: Leaderboard
6: Manifest / Drucken
Esc: Bricht den aktiven Modus "CHECKPOINT SETZEN" oder offene Modals sofort ab.
19.3 Resizable & Collapsible Sidebar

Spezifikation:
Vertikaler Drag-Separator zwischen Kartenfeld und rechter Sidebar (#map-sidebar-resizer).
Ziehen passt das Breitenverhältnis stufenlos an (Breite in localStorage hinterlegt).
Toggle-Button [ ◄ ] / [ ► ] zum vollständigen Einklappen der Sidebar für maximale Kartensicht auf kleinen Laptops.
19.4 High-Contrast Outdoor-Theme ("Sonnenlicht-Modus")

Spezifikation:
Erweitert die bestehenden 4 Themes um ein 5. Theme: theme-outdoor.
Maximierte Kontraste (reines Schwarz #000000 auf reinem Weiß #ffffff), vergrößerte Schriftgrade (12pt Body-Baseline), fette Linienstärken (3px Rahmen) und vergrößerte Touch-Ziele (min. 48px).
Speziell optimiert für Nutzung im Freien unter direkter Sonneneinstrahlung.
19.5 Hover-Synchronisation & Bulk-Actions

Spezifikation:
Hover-Sync: Bewegt sich der Mauszeiger über eine Checkpoint-Zeile in der Sidebar, pulsiert der zugehörige Marker auf der Karte optisch (CSS Keyframe Scale/Opacity Pulse) und umgekehrt.
Bulk-Actions: Shift-Klick erlaubt die Mehrfachauswahl von Checkpoint-Zeilen in der Sidebar.
Aktions-Leiste bei Mehrfachauswahl: [ Typ zuweisen ▾ ], [ Als Pflicht markieren ], [ Sperren ], [ Löschen ].
19.6 In-Page PDF-Druckvorschau

Spezifikation:
Ein Klick auf MANIFEST GENERIEREN oder PERSONAL-BRIEFING (PDF) generiert das PDF im Hintergrund und öffnet ein In-App-Modal mit einer PDF.js / <iframe>-Vorschau.
Vermeidet unnötige Downloads bei Layout-Anpassungen.
5. Phase 20: Internationale Standards & Lokalisierung (i18n & Formate)

20.1 Einheiten & Koordinatensysteme

Spezifikation:
Globaler Switch in den App-Settings:
Distanzen: Metrisch (km, m) vs. Imperial (mi, ft).
Zeitformat: 24-Stunden (14:30) vs. 12-Stunden AM/PM (2:30 PM).
Koordinatenanzeige: Dezimalgrad (50.9375, 6.9603), DMS (50°56'15"N 6°57'37"E), UTM oder MGRS.
Alle Distanzberechnungen (computeRouteLegs) rechnen intern stets in Metern und formatieren erst bei der Ausgabe über formatDistance(meters).
20.2 Papierformat-Adaption (A4 vs. US Letter)

Spezifikation:
Event-Einstellung pdf_page_format: 'a4' | 'letter'.
Dynamische Anpassung des Satzspiegels in export-pdf.js:
A4: 210mm x 297mm
US Letter: 215.9mm x 279.4mm (8.5 x 11 Zoll)
Optionale Druck-Schnittmarken (Crop Marks) für professionellen Druck von Spokecards.
20.3 Community-Sprachpakete (i18n Import/Export)

Spezifikation:
Erweiterung des i18n-Moduls (src/core/i18n.js): Möglichkeit, benutzerdefinierte JSON-Sprachdateien (alleycat-i18n-es.json, alleycat-i18n-fr.json etc.) hochzuladen.
UI in den App-Settings: "Sprachpaket importieren / exportieren".
Ermöglicht lokalen Crews weltweit die Übersetzung der Benutzeroberfläche ohne Code-Eingriff.
6. Phase 21: Spezielles Alleycat-Rennformate-Modul (Cargo, Trackbike & Clues)

21.1 Cargo-Alleycat-Modul

Spezifikation:
Neues Event-Attribut is_cargo_event: boolean.
Checkpoints erhalten Frachtgut-Definitionen: cp.cargo_item = { name: 'Sack Mehl', weight_kg: 5.0, volume_units: 2, bonus_points: 10 }.
Fahrerprofile erhalten Frachtkapazitäten: rider.cargo_capacity_kg.
Der Ziel-Check-in prüft abgegebene/gelieferte Frachtstücke und berechnet dynamische Zusatzpunkte nach Gewicht/Volumen.
21.2 Trackbike- & Spezial-Kategorien

Spezifikation:
Erweiterung der Fahrerattribute für Spezialkategorien:
rider.gear_ratio (z. B. 48x17 / 2.82)
rider.is_brakeless (bool)
rider.is_workbike (bool, z. B. Lastenrad im Kuriereinsatz)
Leaderboard-Filterung und Badges für "Fastest Brakeless", "Best Workbike" etc.
21.3 Kryptischer Clue-Sheet-Generator

Spezifikation:
Neuer PDF-Baukasten-Block clue_sheet.
Erzeugt hochauflösende, ausdruckbare Rätsel-Sheets mit Platzhaltern für Stempel, Straßennetz-Hinweisen und verschlüsselten Koordinaten – gedacht für klassische analoge Papier-Navigation ohne Smartphone-Nutzung während des Rennens.
7. Phase 22: Screen-to-Camera Optical Sync (Lokal-dezentraler Kamera-Sync)

22.1 Visual QR-Video Stream (Offline Device-to-Device Sync)

Problem: Dezentrale Checkpoints ohne Mobilfuntnetz müssen ihre Check-in-Daten am Ende des Rennens zügig auf den HQ-Laptop übertragen, ohne Kabel, Bluetooth-Pairing oder Server.
Spezifikation:
Sender (Checkpoint-Smartphone): Generiert einen animierten QR-Code-Stream (QR-Video mit 5–10 Frames/Sekunde). Jeder Frame enthält ein komprimiertes JSON-Paket signierter Check-in-Einträge.
Empfänger (HQ-Laptop WebCam): Nutzt eine integrierte Webcam-Schleife (via jsQR), liest den QR-Stream in wenigen Sekunden ab und fügt alle dezentralen Check-in-Zeiten lückenlos in die HQ-Datenbank ein.
100 % Offline & Netzunabhängig.
8. Phase 23: Beamer-Moderator & Auditive Barrierefreiheit (Web Speech API)

23.1 Web Speech Announcer (Beamer-Moderator)

Spezifikation:
Integration der browser-nativen Web Speech API (window.speechSynthesis).
Option im Beamer-Settings-Panel: [☑ Sprachausgabe für Live-Ereignisse aktivieren].
Events wie "Startnummer 12 hat das Ziel erreicht!", "Achtung: Zone 2 schrumpft in 3 Minuten!" oder "Neuer Führender in Kategorie FLINTA!" werden automatisch vom Beamer vorgelesen.
Einstellbare Stimme, Lautstärke und Sprechgeschwindigkeit.
23.2 Voice-Command Check-in (Hands-Free Ziel-Check-in)

Spezifikation:
Nutzung der webkitSpeechRecognition / SpeechRecognition API im Ziel-Check-in.
Hands-Free-Modus für den Ziel-Marshal bei Kälte oder Regen: Sprachbefehle wie "Startnummer 42 Ziel" lösen den Check-in direkt aus.
9. Scope-Tabelle (Local-First vs. Server-only)

Feature	Local-First (MVP)	Server-only
Phase 18: HQ Map Mode (TSP, Puffer, Logistik, Orga-Pins, GeoJSON)	✅	✅
Phase 19: UI/UX & Keyboard (Cmd+K, Shortcuts, Resizable Sidebar, Outdoor-Theme)	✅	✅
Phase 20: Internationale Standards (Imperial/Metrisch, US Letter, i18n-Import)	✅	✅
Phase 21: Spezielle Rennformate (Cargo, Trackbike, Clue-Sheet)	✅	✅
Phase 22: Screen-to-Camera Optical Sync (QR-Stream)	✅ (Kein Netz nötig)	➕ (Online Sync als Fallback)
Phase 23: Web Speech API (Beamer-Moderator, Voice-Check-in)	✅ (Browser-native API)	✅
10. Test-Driven Parity & Refactoring-Guide

Test-Suite Erweiterung (test-suite.js): Für jedes neue Modul (z. B. src/core/tsp-solver.js, src/core/command-palette.js) müssen entsprechende E2E- und Unit-Checks in test-suite.js ergänzt werden.
Build-Paritäts-Prüfung: Nach jedem Build via node build.js muss sichergestellt sein, dass beide Varianten (dist/alleycat-dispatch-local.html und dist/alleycat-dispatch-server.html) fehlerfrei bauen und die Parität in src/core/ gewahrt bleibt.

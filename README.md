# Alleycat Dispatch

Eine Single-File-Web-App zur Organisation von Alleycats (Fahrrad-Checkpoint-Rennen): Events anlegen, Checkpoints auf der Karte platzieren, Startnummern & Spokecards drucken, Ziel-Check-in durchführen, Leaderboard führen und ein Manifest als PDF exportieren.

Quellcode ist modular (`src/`), Ausgabe bleibt weiterhin eine einzelne HTML-Datei pro Variante — ein kleines Node-Build-Skript ohne Fremd-Dependencies fügt beides zusammen.

```bash
node build.js
```

erzeugt `dist/alleycat-dispatch-local.html` und `dist/alleycat-dispatch-server.html`. Diese Dateien direkt im Browser öffnen — kein Server, kein `npm install` nötig.

## Zwei Varianten

Beide haben denselben Funktionsumfang, unterscheiden sich nur im Speicher-Backend:

| Datei | Wann nutzen | Speicherort |
|---|---|---|
| `dist/alleycat-dispatch-local.html` | Ein Organizer, ein Gerät | Lokale SQLite-Datenbank im Browser (sql.js/WASM, persistiert in IndexedDB) — inkl. `.sqlite`-Export/Import als Backup |
| `dist/alleycat-dispatch-server.html` | Mehrere Organizer/Geräte sollen dieselben Events sehen | Eigenes PHP/MySQL-Backend (siehe [`php-backend/`](php-backend/)) |

Beide Varianten prüfen zusätzlich zuerst, ob `window.storage` verfügbar ist (z. B. beim Betrieb in einer kompatiblen Artifact-Laufzeit) und nutzen das bevorzugt, falls vorhanden.

**Schnellstart lokal:** `node build.js`, dann `dist/alleycat-dispatch-local.html` direkt im Browser öffnen — läuft sofort, keine weitere Einrichtung nötig.

**Schnellstart Server:** bebilderte Anleitung in [`php-backend/INSTALL.md`](php-backend/INSTALL.md) — kurz zusammengefasst: `php-backend/` auf einen PHP+MySQL-Webspace hochladen, `install.php` einmal aufrufen, API-Endpunkt + Key kopieren und danach `install.php` löschen. Anschließend `dist/alleycat-dispatch-server.html` öffnen und die Zugangsdaten im Setup-Screen eintragen.

## Features

- Events mit beliebig vielen Checkpoints, Position per Karte (Leaflet) oder Koordinaten
- Checkpoint-Typen: QR-Code-Scan, Foto-Beweis, Item-Abgabe, Rätselfrage, Checkpoint-Wertung (Challenge, gepunktet) — plus eigene Checkpoint-Typen über die Einstellungen definierbar
- Fahrerliste mit Startnummern, Notfallkontakt-Feld (nicht auf gedruckten Startnummern/Spokecards sichtbar)
- Teams (Solo/Team-Zuordnung, Team-Wertung mit wählbarem Wertungsmodus: beste Einzelzeit oder alle müssen finishen) und frei definierbare Kategorie-Gruppen (Presets Antrieb/Gender oder eigene) pro Fahrer
- Renn-Zustandsmaschine (Planung → Bereit → Läuft → Abgeschlossen) mit CP-Struktur-Sperre während des Rennens und blockierendem Start-Dialog bei geplanter Startzeit
- Übersicht-Tab pro Event mit anpassbaren Widgets (Status-Kacheln, Checkpoint-Auslastung, letzte Aktivität, Kategorie-Verteilung, Mini-Leaderboard, Live-Countdown, nächste To-dos) — Sichtbarkeit und Reihenfolge frei einstellbar, pro Event gespeichert
- Checkpoint-Reihenfolge frei oder fest wählbar — bei fester Reihenfolge warnt der Ziel-Check-in bei Out-of-Order-Bestätigungen (mit protokolliertem Override) und zeigt Luftlinien-Distanzen zwischen den Checkpoints inkl. Gesamtdistanz
- Checkpoint-Liste mit Live-Auslastung, Zeitfenster-Status, manuellem Sperren/Duplizieren einzelner Checkpoints und Gruppierung nach Reihenfolge oder Typ; Checkpoint-Personal (Name/Telefon/Rolle/Schicht) mit eigenem, organizer-internem Personal-Briefing-PDF (nie auf Fahrer-Manifest/Spokecards)
- Ziel-Check-in-Flow mit Bestätigen/Zurücksetzen inkl. Undo, sowie DNF-/DNS-Markierung
- Leaderboard mit kombinierbaren Filtern (Status, Team, Kategorien) und Export als CSV (Excel-DE-kompatibel, semikolon-getrennt, optional aufgeteilt nach Team/Kategorie)
- Manifest- sowie Startnummern-/Spokecards-PDF-Export
- Routen-Export als GPX
- 4 Themes (Feldpost, Hell, Dunkel, Dracula) und 3 Icon-Packs (Emoji, Font Awesome, Material Symbols) über die Einstellungen

## Weitere Dateien

- [`koeln-alleycat-beispiel.json`](koeln-alleycat-beispiel.json) — Beispiel-Event zum Reinschauen/Importieren
- [`kölner_kurier-alleycat-manifest.pdf`](kölner_kurier-alleycat-manifest.pdf) — Beispiel-Export eines Manifests
- [`test-suite.js`](test-suite.js) — End-to-End-Testsuite; Inhalt in die Browser-Konsole eines laufenden `dist/`-Builds einfügen und `runAlleycatTestSuite()` aufrufen. Läuft unverändert gegen beide Varianten.

## Entwicklung

Quellcode liegt in `src/` (siehe [`CLAUDE.md`](CLAUDE.md) für die Modul-Übersicht), `dist/` ist reiner, nicht versionierter Build-Output — **niemals direkt in `dist/*.html` editieren**, das wird beim nächsten `node build.js` überschrieben.

Alles in `src/core/` muss zwischen beiden Varianten byte-identisch bauen; Backend-spezifisches Verhalten gehört in `src/storage/storage-local.js` bzw. `storage-server.js`, angebunden über die beiden Storage-Seams `initStorageBackend()` und `renderStorageDashboardExtras()` (Details in `CLAUDE.md`). Nach jeder Änderung: `node build.js`, dann `diff dist/alleycat-dispatch-local.html dist/alleycat-dispatch-server.html` — sollte weiterhin nur in den bekannten Storage-Regionen abweichen.

## Roadmap

- Fahrer-Selbstregistrierung (öffentlicher Anmeldelink statt nur organizer-generierter Startnummern-Slots)
- Live-Multi-Checkpoint-Check-in / Live-Zuschauer-Leaderboard — geht nur über `alleycat-dispatch-server.html`, da einzige Variante mit echtem Server-Backend

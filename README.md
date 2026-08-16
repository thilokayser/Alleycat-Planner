# Alleycat Dispatch

Eine Single-File-Web-App zur Organisation von Alleycats (Fahrrad-Checkpoint-Rennen): Events anlegen, Checkpoints auf der Karte platzieren, Startnummern & Spokecards drucken, Ziel-Check-in durchführen, Leaderboard führen und ein Manifest als PDF exportieren.

Kein Build-Prozess, keine Installation — jede Variante ist eine einzelne HTML-Datei, die man direkt im Browser öffnet.

## Zwei Varianten

Beide haben denselben Funktionsumfang, unterscheiden sich nur im Speicher-Backend:

| Datei | Wann nutzen | Speicherort |
|---|---|---|
| [`alleycat-dispatch-local.html`](alleycat-dispatch-local.html) | Ein Organizer, ein Gerät | Lokale SQLite-Datenbank im Browser (sql.js/WASM, persistiert in IndexedDB) — inkl. `.sqlite`-Export/Import als Backup |
| [`alleycat-dispatch-server.html`](alleycat-dispatch-server.html) | Mehrere Organizer/Geräte sollen dieselben Events sehen | Eigenes PHP/MySQL-Backend (siehe [`php-backend/`](php-backend/)) |

Beide Varianten prüfen zusätzlich zuerst, ob `window.storage` verfügbar ist (z. B. beim Betrieb in einer kompatiblen Artifact-Laufzeit) und nutzen das bevorzugt, falls vorhanden.

**Schnellstart lokal:** `alleycat-dispatch-local.html` direkt im Browser öffnen — läuft sofort, keine weitere Einrichtung nötig.

**Schnellstart Server:** bebilderte Anleitung in [`php-backend/INSTALL.md`](php-backend/INSTALL.md) — kurz zusammengefasst: `php-backend/` auf einen PHP+MySQL-Webspace hochladen, `install.php` einmal aufrufen, API-Endpunkt + Key kopieren und danach `install.php` löschen. Anschließend `alleycat-dispatch-server.html` öffnen und die Zugangsdaten im Setup-Screen eintragen.

## Features

- Events mit beliebig vielen Checkpoints, Position per Karte (Leaflet) oder Koordinaten
- Checkpoint-Typen: QR-Code-Scan, Foto-Beweis, Item-Abgabe, Rätselfrage, Marshal-Bewertung (Challenge, gepunktet) — plus eigene Checkpoint-Typen über die Einstellungen definierbar
- Fahrerliste mit Startnummern, Notfallkontakt-Feld (nicht auf gedruckten Startnummern/Spokecards sichtbar)
- Ziel-Check-in-Flow mit Bestätigen/Zurücksetzen inkl. Undo
- Leaderboard, Export als CSV (Excel-DE-kompatibel, semikolon-getrennt)
- Manifest- sowie Startnummern-/Spokecards-PDF-Export
- Routen-Export als GPX
- 4 Themes (Feldpost, Hell, Dunkel, Dracula) und 3 Icon-Packs (Emoji, Font Awesome, Material Symbols) über die Einstellungen

## Weitere Dateien

- [`koeln-alleycat-beispiel.json`](koeln-alleycat-beispiel.json) — Beispiel-Event zum Reinschauen/Importieren
- [`kölner_kurier-alleycat-manifest.pdf`](kölner_kurier-alleycat-manifest.pdf) — Beispiel-Export eines Manifests
- [`test-suite.js`](test-suite.js) — End-to-End-Testsuite; Inhalt in die Browser-Konsole der laufenden App einfügen und `runAlleycatTestSuite()` aufrufen. Läuft unverändert gegen beide Varianten.

## Entwicklung

`alleycat-dispatch-local.html` und `alleycat-dispatch-server.html` sind unabhängige Dateien, die sich nur im Speicher-Layer unterscheiden. Nicht-Storage-Änderungen (UI, Features, Export-Funktionen etc.) müssen manuell in beiden Dateien nachgezogen werden — es gibt keinen gemeinsamen Build-Schritt. Nach jeder Änderung an einer Variante die andere entsprechend nachpflegen und per `diff` prüfen, dass nur die bekannten storage-spezifischen Stellen abweichen (Speicher-Funktionen, Init, ggf. zugehörige Dashboard-Buttons).

## Roadmap

- Fahrer-Selbstregistrierung (öffentlicher Anmeldelink statt nur organizer-generierter Startnummern-Slots)
- Live-Multi-Marshal-Check-in / Live-Zuschauer-Leaderboard — geht nur über `alleycat-dispatch-server.html`, da einzige Variante mit echtem Server-Backend

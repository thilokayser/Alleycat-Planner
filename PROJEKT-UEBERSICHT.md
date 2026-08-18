# Alleycat Dispatch — Projektübersicht

*Stand: 17.08.2026. Gedacht als Grundlage für ein Brainstorming (z. B. mit Claude Chat), um daraus einen neuen Phasenplan abzuleiten. Kein technisches Referenzdokument für Coding-Sessions — das ist [`CLAUDE.md`](CLAUDE.md).*

---

## 1. Was ist Alleycat Dispatch?

Ein Web-Tool für Organizer von **Alleycats** (Fahrrad-Checkpoint-Rennen): von der Streckenplanung über Startnummern-Druck bis zum fertigen Ergebnis-Manifest, alles in einer App.

**Zielgruppe:** Eine Person (oder ein kleines Orga-Team), die ein Alleycat von A bis Z organisiert — Strecke planen, Fahrer verwalten, am Renntag Zielzeiten erfassen, danach Ergebnisse veröffentlichen.

**Kernversprechen:** Kein Zusammenstückeln aus Excel-Tabellen, Google Forms und Copy-Paste-PDFs — ein Werkzeug, das den kompletten Ablauf abdeckt, offline-fähig ist und ohne Konto/Anmeldung sofort nutzbar ist.

---

## 2. Formfaktor

- **Zwei Bau-Varianten**, gleicher Funktionsumfang, unterschiedliches Speicher-Backend:
  - **Lokal** (`alleycat-dispatch-local.html`): eine Person, ein Gerät. Speichert in einer lokalen SQLite-Datenbank im Browser (sql.js/WASM → IndexedDB). Läuft komplett offline nach dem ersten Laden, keine Installation, kein Server.
  - **Server** (`alleycat-dispatch-server.html`): mehrere Organizer/Geräte sollen dieselben Events sehen. Braucht ein selbst gehostetes PHP+MySQL-Backend (im Repo enthalten, `php-backend/`).
- Ausgabe ist jeweils **eine einzelne HTML-Datei** — Doppelklick öffnet die App direkt im Browser, kein `npm install`, kein Build-Server nötig für den Betrieb (nur zum *Bauen* der Datei aus dem Quellcode braucht es einmalig Node).
- Kein Frontend-Framework (kein React/Vue) — reines JavaScript mit direktem DOM-Rendering. Leaflet für Karten, jsPDF für PDF-Export, sql.js für die lokale Datenbank.
- 4 Themes (Feldpost, Hell, Dunkel, Dracula) und 3 Icon-Packs (Emoji, Font Awesome, Material Symbols), pro Gerät wählbar.
- Sprache: aktuell nur Deutsch, aber technisch auf mehrsprachig vorbereitet (alle UI-Texte laufen über eine zentrale Übersetzungsfunktion).

---

## 3. Feature-Katalog (aktueller Stand)

### Event & Strecke
- Beliebig viele Events, beliebig viele Checkpoints, Position per Karten-Klick oder Koordinaten-Eingabe
- Checkpoint-Typen: QR-Code-Scan, Foto-Beweis, Item-Abgabe, Rätselfrage, Checkpoint-Wertung (gepunktete Challenge) — plus eigene, frei definierbare Checkpoint-Typen
- Checkpoint-Reihenfolge frei oder fest wählbar (bei "fest" wird beim Check-in vor Out-of-Order-Bestätigungen gewarnt, mit protokolliertem Override) inkl. Luftlinien-Distanzberechnung zwischen den Checkpoints
- Checkpoint-Liste: Zeitfenster-Status, manuelles Sperren/Duplizieren einzelner Checkpoints, Gruppierung nach Reihenfolge oder Typ
- Checkpoint-Personal (Name/Telefon/Rolle/Schicht) mit eigenem, organizer-internem Personal-Briefing-PDF (erscheint nie auf Fahrer-Dokumenten)
- Routen-Export als GPX

### Fahrer, Teams, Kategorien
- Fahrerliste mit automatisch generierten Startnummern, Notfallkontakt-Feld (nicht auf gedruckten Dokumenten sichtbar)
- **CSV-Bulk-Import**: Spalten-Zuordnung (Startnummer/Name/Team/Notfallkontakt), Validierung vor Import mit Fehlerliste, legt fehlende Teams automatisch an
- Teams (Solo/Team-Zuordnung) mit wählbarem Wertungsmodus (beste Einzelzeit oder alle müssen finishen)
- Frei definierbare Kategorie-Gruppen (Presets für Antrieb/Gender oder eigene), pro Fahrer zuweisbar

### Rennablauf
- Renn-Zustandsmaschine: Planung → Bereit → Läuft → Abgeschlossen, mit automatischer Sperre der Checkpoint-Struktur sobald das Rennen läuft
- Blockierender Start-Dialog bei geplanter Startzeit
- **Ziel-Check-in**: Bib-Suche, Bestätigen/Zurücksetzen inkl. Undo-Toast, DNF-/DNS-Markierung

### Übersicht (Dashboard pro Event)
- Anpassbare Widgets: Status-Kacheln, Checkpoint-Auslastung, letzte Aktivität, Kategorie-Verteilung, Mini-Leaderboard, Live-Countdown, nächste To-dos — Sichtbarkeit und Reihenfolge frei wählbar, pro Event gespeichert
- Direkter Zugang zu Beamer-Ansicht und Spielmodi-Konfiguration (Spielmodi-Sektion ist einklappbar)

### Leaderboard & Ergebnisse
- Kombinierbare Filter (Status, Team, Kategorien)
- CSV-Export (Excel-kompatibel, semikolon-getrennt, optional aufgeteilt nach Team/Kategorie)
- Manifest- sowie Startnummern-/Spokecards-PDF-Export

### Spielmodi-Engine
7 vordefinierte, unabhängig kombinierbare Renn-Varianten (kein freier Regel-Baukasten, sondern fertige Module mit Parametern):
1. **Zeitfenster-CPs** — Check-in nur innerhalb eines Zeitfensters
2. **Bonus-CPs** — Punkte nach Ankunftsrang an optionalen Checkpoints
3. **Geheime CPs** — Checkpoint wird erst nach einer Vorbedingung sichtbar
4. **Battle Royale** — schrumpfende Zone, Checkpoints außerhalb werden gesperrt
5. **Wildcard/Joker** — ein Checkpoint pro Fahrer gilt automatisch als erledigt
6. **Kettenreaktion** — Bonus-Punkte bei perfekter Reihenfolge ohne Override
7. **Sudden Death** — Ausscheiden bei Inaktivität nach Cutoff-Zeit

Aktivieren eines punktevergebenden Modus schaltet das Leaderboard automatisch auf Punkte-Wertung um (Zeit bleibt sichtbar), Punkte-Herkunft ist pro Fahrer nachvollziehbar.

### Beamer-Ansicht (Publikumsanzeige)
- Eigene Route, gedacht für einen zweiten Bildschirm/Rechner
- Countdown bis Startzeit, Vollbild-GO-Overlay mit Sound beim Start, danach Live-Leaderboard
- Bei aktiven Spielmodi automatisch erweitert um: Punkte-Leaderboard, Live-Ticker der letzten Ereignisse (mit eigenen Sounds), Battle-Royale-Zonenkarte, Vollbild-Overlay bei Ausscheiden
- Eigenständiges Sound-Hook-Modul (Datei-Upload pro Event/Ereignis, Test-Button)

### PDF-Baukasten
- Frei zusammenstellbare Zusatzseiten (Haftungsausschluss mit Unterschriftszeile, Renn-Regeln, Sponsoren-Logos, Checkpoint-Übersicht, Notizen, eigener Text, Notfall-Infos)
- Pro Block wählbar, ob er auf Manifest und/oder Spokecards erscheint; Reihenfolge frei sortierbar; als Vorlage exportier-/importierbar (JSON)

### Datensicherheit & Offline
- Automatisches Backup-Download-Intervall während laufendem Rennen
- Warnhinweis gegen versehentliches Schließen des Tabs während des Rennens
- Wake Lock (Bildschirm bleibt an im Ziel-Check-in/Beamer)
- Offline-Kartenkacheln-Cache pro Event (Bounding Box um die Checkpoints, herunterladbar), mit Warnhinweis bei veraltetem Cache

### Robustheit / Qualität
- Fehlerbildschirm statt weißem Bildschirm bei einem unerwarteten Programmfehler ("Daten sind sicher gespeichert, neu laden")
- Generisches Undo/Aktions-Log für die letzten Aktionen (z. B. Fahrer gelöscht, Kategorie geändert)
- Umfangreiche End-to-End-Testsuite (über 320 automatisierte Checks), läuft unverändert gegen beide Varianten

---

## 4. Architektur — was für's Brainstorming relevant ist

- **Kein Framework.** Ein globaler `state`, `render()` wird nach jeder Änderung aufgerufen und baut die aktive Ansicht neu zusammen. Das heißt: neue Features sind einfach hinzuzufügen (kein komplexes State-Management), aber es gibt keinen "kostenlosen" Komfort wie in React (z. B. für aufwendige Animationen oder komplexe Interaktions-States lohnt sich mehr Handarbeit).
- **Speicher-Trennung nach Prinzip:** fast der gesamte Code (`src/core/`) ist identisch für beide Varianten. Nur an klar definierten Stellen ("Seams") wird ins jeweilige Backend verzweigt. Das bedeutet: neue Features, die reine Datenlogik/UI sind, funktionieren automatisch in beiden Varianten. Nur Features, die *echte Mehrgeräte-/Mehrpersonen-Synchronität* brauchen, sind grundsätzlich auf die Server-Variante beschränkt.
- **Die lokale Variante ist strukturell Single-Device.** SQLite lebt im Browser des einen Geräts. Es gibt keinen Cloud-Sync für diese Variante (bewusste Entscheidung — Zielgruppe ist "ein Organizer, ein Laptop/Handy am Start").
- **Die Server-Variante ist die einzige mit echter Mehrgeräte-Fähigkeit.** Das PHP-Backend ist aber bisher nur gegen einen Mock getestet, nicht gegen einen echten Produktiv-Server verifiziert.
- **i18n-Grundgerüst existiert**, aber nur Deutsch ist befüllt. Eine zweite Sprache wäre "nur" Übersetzungsarbeit, keine Architekturänderung.
- **Kein Login/Konto-System.** Passt zum "sofort startklar"-Versprechen, bedeutet aber: alles, was nach Nutzerkonten, Rechten/Rollen oder geteiltem Zugriff über eine URL hinaus verlangt, wäre eine grundlegend neue Baustelle.

---

## 5. Entwicklungshistorie (grober Überblick)

Die App ist in klar abgegrenzten Phasen gewachsen — nützlich, um zu sehen, was bereits gelöst ist und was noch offen ist:

| Phase | Inhalt |
|---|---|
| 0 | Umbau von drei fast identischen Dateien auf zwei sauber getrennte Varianten + modularer Quellcode mit Build-Skript |
| 1 | Teams-Feature |
| 2 | i18n-Grundgerüst (alle Texte hinter Übersetzungsfunktion) |
| 3 | Renn-Zustandsmaschine (Planung → Bereit → Läuft → Abgeschlossen) |
| 4 | Dashboard/Übersicht-Tab mit anpassbaren Widgets |
| 5 | Kategorien, DNF/DNS-Status, Team-Wertungsmodi |
| 6 | Checkpoint-Reihenfolge (frei/fest) + Distanzberechnung |
| 7 | Checkpoint-Liste-Erweiterungen, Checkpoint-Personal |
| 8 | Beamer-Ansicht (Basis) + Sound-Hook-Modul |
| 9 | Datensicherheit & Offline-Features |
| 10 | PDF-Baukasten |
| 11 | Spielmodi-Engine (7 Modi) |
| 12 | Live-Beamer für Spielmodi (Ticker, Punkte-Board, Zonenkarte, Ausscheiden-Overlay) |
| 13 | QoL: CSV-Bulk-Import, Fehlerbildschirm, Undo-Log |
| — | Diverse UX-Feinschliffe (Kontrast/Barrierefreiheit-Audit der Übersicht, Layout-Anpassungen) |

---

## 6. Bekannte Lücken / offene Baustellen

- **Keine Fahrer-Selbstregistrierung.** Startnummern werden bisher ausschließlich vom Organizer generiert (oder per CSV importiert) — kein öffentlicher Anmeldelink, über den sich Fahrer selbst eintragen können.
- **Kein Live-Multi-Marshal-Check-in.** Aktuell checkt eine Person an einem Gerät die Zielzeiten ein. Mehrere Personen, die gleichzeitig an verschiedenen Checkpoints (nicht nur am Ziel) Fahrer abhaken — mit Live-Sync zwischen den Geräten — existiert nicht. Das gilt als die **größte strukturelle Lücke** der App und wäre nur über die Server-Variante lösbar.
- **PHP-Backend ist produktiv unverifiziert.** Bisher nur gegen einen Mock-Server getestet, nicht auf einem echten PHP+MySQL-Hosting durchgespielt.
- **Kein Mehrpersonen-Aktivitätsprotokoll.** Wer hat wann was geändert, wenn mehrere Organizer gleichzeitig am selben Event arbeiten? Bisher nicht vorhanden (ergibt bei der lokalen Variante ohnehin keinen Sinn, wäre aber für die Server-Variante relevant, sobald mehrere Leute gleichzeitig editieren).
- **Nur Deutsch.** Struktur ist mehrsprachig-fähig, aber keine zweite Sprache ist tatsächlich übersetzt.
- **Undo-Log ist bewusst klein** (die letzten 5 Aktionen, nur in der laufenden Sitzung rückgängig machbar) — kein vollständiges Änderungsprotokoll.

---

## 7. Bereits identifizierte Roadmap-Ideen (aus früherem Brainstorming)

Diese zwei Punkte standen zuletzt als "nächste Schritte" im Raum, wurden aber noch nicht begonnen:

1. **Fahrer-Selbstregistrierung** — öffentlicher Anmeldelink statt ausschließlich Organizer-generierter Startnummern-Slots.
2. **Live-Multi-Checkpoint-Check-in / Live-Zuschauer-Leaderboard** — mehrere Marshals an verschiedenen Checkpoints, live synchronisiert; setzt die Server-Variante und ein produktiv-verifiziertes PHP-Backend voraus.

---

## 8. Mögliche Gesprächsanstöße für den Brainstorm

Nicht als Vorgabe gedacht, sondern als Ausgangspunkte, falls hilfreich:

- Welche der beiden bekannten Roadmap-Ideen (Selbstregistrierung vs. Live-Multi-Marshal-Check-in) hat gerade die höhere Priorität — und lohnt es sich, das PHP-Backend zuerst produktiv zu härten, bevor darauf aufgebaut wird?
- Gibt es aus echten Renn-Einsätzen der App bereits Feedback/Pain-Points, die noch nicht in dieser Liste stehen?
- Soll die App langfristig auch für Zuschauer/Öffentlichkeit gedacht sein (z. B. öffentliche Leaderboard-Ansicht ohne Organizer-Zugang), oder bleibt der Fokus rein auf das Orga-Team?
- Wie wichtig ist eine zweite Sprache (z. B. Englisch) für internationale Alleycats?
- Gibt es Bedarf an einer mobilen/nativen App-Version (im Langzeit-Vision-Dokument war mal eine Electron-Variante angedacht), oder reicht "Web-App im Browser" dauerhaft?
- Sollte das Undo-/Aktions-Log ausgebaut werden (mehr Aktionstypen, längere Historie), oder ist der aktuelle Umfang ausreichend?

---

## 9. Technische Leitplanken für neue Vorschläge

Damit ein neuer Phasenplan realistisch bleibt, ein paar Rahmenbedingungen, die sich in der bisherigen Entwicklung als wichtig erwiesen haben:

- **Kein Fremd-Framework einführen** — die App ist bewusst dependency-arm gehalten (Leaflet, jsPDF, QRCode-Lib, jsQR, sql.js — alle über CDN, kein `npm install` für den Betrieb). Einzige bewusste Ausnahme seit Paket 4 (18.08.2026): **Leaflet.draw** (`leaflet.draw@1.0.4`, ebenfalls CDN) für den Zonen-Editor auf der Karte — kein allgemeines Framework, sondern ein eng begrenztes Leaflet-Plugin für genau eine Aufgabe (Kreis/Polygon zeichnen+editieren), degradiert ohne Fehler falls die CDN-Datei mal nicht lädt (`initZoneDrawControl()` in `map.js` prüft `L.Control.Draw` vor der Nutzung).
- **`src/core/` muss zwischen beiden Varianten byte-identisch bleiben.** Neue Variante-spezifische Logik muss sauber über die Storage-Seams laufen, nicht als Verzweigung mitten im gemeinsamen Code.
- **Alles muss weiterhin ohne Server funktionieren können** (zumindest die lokale Variante) — Features, die zwingend einen Server voraussetzen, sollten das für die lokale Variante nicht kaputt machen (im Zweifel: Feature nur in der Server-Variante sichtbar).
- **Die Test-Suite (`test-suite.js`) sollte mit jeder neuen Phase mitwachsen** — bisher hat sich das bewährt, um Regressionen über 13 Phasen hinweg zu vermeiden.

---

*Diese Datei liegt im Repo unter `PROJEKT-UEBERSICHT.md` und kann bei Bedarf aktualisiert werden, wenn sich der Stand ändert.*

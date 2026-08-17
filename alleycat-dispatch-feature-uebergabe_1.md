# Alleycat Dispatch — Feature-Übergabe für Agenten

Dieses Dokument fasst eine ausführliche Brainstorming-Session zusammen und dient als Arbeitsauftrag. Es ist in folgende Teile gegliedert:

1. Architektur-Grundentscheidung (zuerst umsetzen)
2. Empfohlene Umsetzungsreihenfolge (Phasen)
3. Prozess-Richtlinien für den Agenten
4. Detail-Spezifikationen je Feature
5. Scope-Tabelle: Local-First vs. Server-only vs. Roadmap
6. Klarstellungen zu bestehenden Features
7. Bewusst vertagte / offene Entscheidungen
8. Verworfene Ideen
9. Roadmap (unverändert + Ergänzungen)
10. **Status-Update: Umsetzung in Claude Code (Stand 17.08.2026)**
11. **Priorisierungsentscheidung (aktueller Stand)**
12. **Phase 14: Backend-Härtung & breite Hosting-Kompatibilität**
13. **Phase 15: Karten-Erweiterungen — Sonderorte, Zonen-Editor & Bezirke-Modus**
14. **Phase 16: Feature-Registry, Settings-Hub & Politur-Features**
15. **Phase 17: PDF-Baukasten 2.0 — Layout, neue Blöcke, Dokument-Vorlagen**

---

## 0. Kontext: Ausgangslage

**Alleycat Dispatch** ist eine Single-File-Web-App zur Organisation von Alleycats (Fahrrad-Checkpoint-Rennen). Zwei Varianten mit identischem Funktionsumfang, unterschiedlichem Speicher-Backend:

- `alleycat-dispatch-local.html` — SQLite im Browser (sql.js/WASM, IndexedDB), ein Organizer/ein Gerät
- `alleycat-dispatch-server.html` — PHP/MySQL-Backend, mehrere Organizer/Geräte

Kein Build-Prozess bisher, keine Installation — jede Variante war bisher eine einzelne HTML-Datei. **Das ändert sich mit diesem Auftrag** (siehe Abschnitt 1).

> **Hinweis zur Fortschreibung:** Dieses Dokument wird laufend ergänzt, sobald neue Phasen besprochen werden. Abschnitte 0–9 sind der ursprüngliche Auftrag (Phasen 0–13, mittlerweile umgesetzt). Ab Abschnitt 10 folgt der aktuelle Stand und alles, was danach neu hinzukommt.

Bestehende Features: Events mit Checkpoints (Karte via Leaflet/Koordinaten), Checkpoint-Typen (QR, Foto-Beweis, Item-Abgabe, Rätselfrage, Marshal-Bewertung, custom), Fahrerliste mit Startnummern + Notfallkontakt, Ziel-Check-in mit Undo, Leaderboard, CSV-Export (Excel-DE, Semikolon), Manifest-/Startnummern-/Spokecards-PDF-Export, GPX-Routen-Export, 4 Themes, 3 Icon-Packs.

---

## 1. Architektur-Grundentscheidung: Modul-Split (zuerst umsetzen)

**Problem bisher:** Beide HTML-Dateien sind Monolithen. Nicht-Storage-Änderungen müssen manuell in beiden nachgezogen werden, per Diff geprüft. Das ist fehleranfällig und für einen Agenten (Kontextfenster) ineffizient.

**Lösung:** Quelltext modular, Ausgabe bleibt weiterhin eine einzelne Datei pro Variante (Hybrid-Ansatz).

```
alleycat-dispatch/
├── src/
│   ├── core/                    # gemeinsam für local + server
│   │   ├── i18n.js
│   │   ├── rider.js
│   │   ├── checkpoint.js
│   │   ├── category.js
│   │   ├── leaderboard.js
│   │   ├── distance.js
│   │   ├── event-state.js       # Renn-Zustandsmaschine
│   │   ├── dashboard.js
│   │   ├── rules-engine.js
│   │   ├── game-modes.js
│   │   ├── live-sync.js
│   │   ├── beamer.js
│   │   ├── beamer-modes.js
│   │   ├── sound-hook.js
│   │   ├── map.js
│   │   ├── pdf-blocks.js
│   │   ├── export-pdf.js
│   │   ├── export-csv.js
│   │   ├── export-gpx.js
│   │   ├── checkpoint-staff.js
│   │   ├── storage-health.js    # Wake Lock, Storage Persist/Estimate
│   │   └── ui-headquarter.js
│   ├── storage/
│   │   ├── storage-local.js     # sql.js/IndexedDB
│   │   └── storage-server.js    # PHP/MySQL-API-Calls
│   ├── styles/
│   │   ├── base.css
│   │   └── themes.css
│   └── vendor/                  # Leaflet, sql.js-WASM etc., lokal vorgehalten
├── templates/
│   ├── local.template.html      # Platzhalter {{CORE_JS}}, {{STORAGE_JS}}, {{STYLES}}
│   └── server.template.html
├── build.js                     # reines Node, kein npm install nötig
├── dist/                        # Build-Output — NICHT ins Repo (.gitignore)
│   ├── alleycat-dispatch-local.html
│   └── alleycat-dispatch-server.html
├── php-backend/                 # unverändert
├── migrations/                  # nummerierte Schema-Migrationen, siehe 4.6
├── test-suite.js
├── MANUAL_QA.md
├── SCHEMA.md
├── CHANGELOG.md
├── README.md
└── package.json
```

**build.js — Prinzip:**
```js
const fs = require('fs');
const CORE_FILES = [ /* Liste aller src/core/*.js Module in Ladereihenfolge */ ];

function buildVariant(storageFile, templateFile, outputFile) {
  const core = CORE_FILES.map(n => fs.readFileSync(`src/core/${n}.js`, 'utf8')).join('\n\n');
  const storage = fs.readFileSync(`src/storage/${storageFile}`, 'utf8');
  const styles = fs.readFileSync('src/styles/base.css', 'utf8') + fs.readFileSync('src/styles/themes.css', 'utf8');
  const template = fs.readFileSync(`templates/${templateFile}`, 'utf8');
  const output = template
    .replace('{{STYLES}}', styles)
    .replace('{{CORE_JS}}', core)
    .replace('{{STORAGE_JS}}', storage);
  fs.writeFileSync(`dist/${outputFile}`, output);
}

buildVariant('storage-local.js', 'local.template.html', 'alleycat-dispatch-local.html');
buildVariant('storage-server.js', 'server.template.html', 'alleycat-dispatch-server.html');
```
Aufruf: `node build.js` — keine Dependencies nötig.

**Wichtige Regeln:**
- **Vendor-Libraries (Leaflet, sql.js-WASM, Icon-Packs) werden beim Build fest eingebettet**, nicht per CDN geladen. Ergebnis: beide `dist/*.html` sind von Anfang an zu 100 % offline-fähig, kein Laufzeit-Toggle nötig.
- **Der Agent darf niemals direkt in `dist/*.html` editieren** — nur in `src/`. Das ist generierter Output und wird beim nächsten Build überschrieben. Diese Regel gehört in eine Projektinstruktion (`CLAUDE.md` o. ä.).
- `dist/` wird nicht versioniert. Bei jedem GitHub-Release: lokal `node build.js` ausführen, beide Dateien als Release-Assets anhängen. Optional später: GitHub Action zur Automatisierung — vorerst manuell.
- Zusätzliches Skript `check-parity.js` (später): prüft, ob `storage-local.js` und `storage-server.js` dieselben exportierten Funktionssignaturen besitzen — verhindert vergessene Funktionen beim Server-Ausbau.

**Verifikation nach dem Split:** `node build.js` muss eine Datei erzeugen, die funktional identisch zur bisherigen `local.html` ist (Test-Suite bleibt unverändert grün — reines Refactoring, keine Verhaltensänderung).

---

## 2. Empfohlene Umsetzungsreihenfolge (Phasen)

Reihenfolge ist bewusst gewählt: Architektur zuerst (spart Mehrfacharbeit), dann Fundament-Features (Zustandsmaschine, Kategorien — viele andere Features hängen daran), dann Ausbau.

| Phase | Inhalt | Abhängig von |
|---|---|---|
| 0 | Modul-Split + Build-Skript (Abschnitt 1) | — |
| 1 | Renaming HQ/Checkpoint + Code-Sprache Englisch (4.1) | 0 |
| 2 | i18n-Grundgerüst, nur Deutsch befüllt (4.2) | 0 |
| 3 | Renn-Zustandsmaschine (4.6) | 0 |
| 4 | Dashboard-Tab inkl. Widget-System (4.7) | 3 |
| 5 | Kategorien + Solo/Team + Leaderboard-Filter (4.3, 4.4) | 0 |
| 6 | CP-Reihenfolge (frei/fest) + Distanzberechnung (4.5) | 0 |
| 7 | Checkpoint-Liste + Checkpoint-Personal (4.10, 4.11) | 6 |
| 8 | Beamer-Ansicht Basis: Countdown, GO-Trigger, Sound-Hook, Live-Leaderboard (4.8, 4.9) | 3 |
| 9 | Datensicherheit/Offline: Auto-Backup, Beforeunload, Kartenkacheln-Cache, Storage-APIs, Wake Lock (4.12, 4.13) | 0 |
| 10 | PDF-Baukasten-System (4.14) | 0 |
| 11 | Spielmodi-Engine (4.15) | 3, 6 |
| 12 | Live-Beamer für Spielmodi (4.16) | 8, 11 |
| 13 | QoL MVP-relevant: Bulk-Import, Error Boundary, Undo-Log (4.17) | 0 |
| — | **UI-Politur, erst NACH vollständigem MVP** (Abschnitt 7) | alle oben |

Jede Phase sollte in einem eigenen, überprüfbaren Schritt abgeschlossen werden (siehe Abschnitt 3 für den Ablauf pro Phase).

---

## 3. Prozess-Richtlinien für den Agenten (Claude Code / Sonnet)

- **Kontextfenster-Ökonomie:** Gezielte Edits (Suchen/Ersetzen), nicht ganze Dateien neu generieren. Bei Bedarf vorher eine Gliederung mit Zeilennummern erstellen lassen.
- **Git-Commit nach jeder Phase**, nicht nur mündliches "fertig" berichten — echte Rücksprungpunkte.
- **Checklisten-Dateien vor größeren Umbauten:** z. B. `RENAMING_TODO.md` (alle Fundstellen `marshal`/`organizer`) und `I18N_TODO.md` (alle UI-Strings mit Datei+Zeile), gegen die abgehakt wird. Zwingt zu Vollständigkeit statt "gefühlt fertig".
- **Manuelles Testen zwischen Phasen:** `test-suite.js` läuft in der Browser-Konsole (`runAlleycatTestSuite()`), kein Headless-Setup für diesen Umfang nötig — Nutzer bestätigt "Go" nach jeder Phase, bevor der Agent weitermacht.
- **Missing-Key-Warnung in `t()`:** im Dev-Modus (`?debug=1` oder `localStorage.debug`) fehlende i18n-Keys als `console.warn` ausgeben statt sie als Rohtext unbemerkt durchzureichen.
- **`CHANGELOG.md`** pro Release-relevanter Änderung mitschreiben, nicht rückwirkend rekonstruieren.
- **`SCHEMA.md`**: aktueller Soll-Zustand aller Tabellen (beide Storage-Backends synchron halten).
- **`MANUAL_QA.md`**: Klick-Pfade für manuelle Prüfung, die die Test-Suite nicht abdeckt (visuelle/UI-Prüfung).
- **`FEATURES`-Flag-Objekt** am Dateianfang (`const FEATURES = { categories: true, beamer: false, ruleEngine: false }`) für halb-fertige Features, damit kein unfertiger Code in einem zwischenzeitlichen Release aktiv sichtbar wird.
- **Konkreter Ablauf pro größerer Phase** (Vorlage, am Beispiel Phase 1+2):
  1. Agent liest betroffene Module, erstellt Todo-Checkliste(n)
  2. Nutzer reviewt Checkliste kurz (Vollständigkeitscheck)
  3. Umsetzung in `src/`, abgehakt gegen Checkliste, Commit
  4. `node build.js`, Nutzer testet manuell in `dist/`, gibt Go
  5. Weiter zur nächsten Phase

---

## 4. Detail-Spezifikationen

### 4.1 Renaming & Code-Sprache

| Alt | Neu (UI, Deutsch) | Neu (Code, intern, Englisch) |
|---|---|---|
| Organizer-Ansicht | **Headquarter** (HQ) | `headquarter` |
| Marshal-Ansicht | **Checkpoint** | `checkpoint` (Modus) |
| Checkpoint-Typ „Marshal-Bewertung" | **„Checkpoint-Wertung"** | `checkpoint_scoring` |
| Roadmap „Live-Multi-Marshal-Check-in" | „Live-Multi-Checkpoint-Check-in" | — |
| Fahrer | **Fahrer** (unverändert) | `rider` (bereits Englisch, unverändert) |

- **Migrations-/Kompatibilitäts-Alias nötig:** bestehende Events/JSON (z. B. `koeln-alleycat-beispiel.json`) können noch den alten Typnamen (`marshal_rating` o. ä.) enthalten — beim Laden automatisch auf `checkpoint_scoring` mappen.
- **Im selben Zug:** Code-Sprache (Variablen-, Funktions-, CSS-Klassennamen, Kommentare) konsequent auf Englisch vereinheitlichen, sofern noch nicht so. **Nicht betroffen:** UI-Texte (bleiben vorerst Deutsch, siehe 4.2) und alles, was der Nutzer selbst einträgt (Kategorie-Namen, Checkpoint-Namen, Team-Namen — bleiben unangetastet).
- Betrifft: beide Varianten (jetzt: `src/core/*`), README, `test-suite.js`, Beispiel-JSON.

### 4.2 i18n-Architektur (nur Vorbereitung, keine Übersetzung jetzt)

**Prinzip:** alle sichtbaren UI-Strings raus aus Markup/Funktionen, rein in ein zentrales Dictionary. Nur `de` befüllt, Struktur von Anfang an mehrsprachig-fähig.

```js
// src/core/i18n.js
const translations = {
  de: {
    common: { save: "Speichern", cancel: "Abbrechen", ... },
    hq: { title: "Headquarter", ... },
    checkpoint: { title: "Checkpoint", ... },
    rider: { bibNumber: "Startnummer", emergencyContact: "Notfallkontakt", ... },
    category: { drivetrain: "Antrieb", gender: "Gender", ... },
    leaderboard: { filter_search: "Name/Startnummer...", ... },
    export: { manifest_title: "Manifest", ... },
    dashboard: { ... },
    settings: { language: "Sprache", ... }
  }
  // en: { ... } später als zweiter Block ergänzt
};

function t(key, params = {}) {
  const lang = getCurrentLanguage();
  const dict = translations[lang] || translations['de'];
  let str = key.split('.').reduce((o, k) => o?.[k], dict)
            ?? key.split('.').reduce((o, k) => o?.[k], translations['de'])
            ?? key; // Fallback-Kette, Key selbst sichtbar bei Fehlern
  Object.entries(params).forEach(([k, v]) => { str = str.replace(`{${k}}`, v); });
  return str;
}
```

- **Sprachauswahl:** pro Gerät/Nutzer, nicht global/pro Event. Beim ersten Start `navigator.language` als Vorschlag, überschreibbar in Settings. Gespeichert lokal (lokale Variante: `meta`-Tabelle/Settings-Row der SQLite-DB; Server-Variante: ebenfalls lokal im Browser, nicht in der zentralen DB — da "pro Gerät", nicht pro Event/Server-weit).
- **PDF-Exporte werden ebenfalls übersetzt** (eigener Namespace `export.*`), Sprache = aktuell im Client eingestellte Sprache. Datumsformate an gewählte Sprache koppeln (`toLocaleDateString`, nicht hart `de-DE`).
- **CSV-Export bewusst ausgenommen** von der Sprachlogik beim Trennzeichen (bleibt Semikolon, technisch bedingt) — nur Spalten-Header-Labels laufen über `t()`.
- **Nutzereingaben werden NICHT übersetzt:** eigene Kategorie-/Checkpoint-/Team-Namen bleiben Rohdaten, unverändert, kein `t()`.
- Pluralisierung: für jetzt reicht einfacher `{count}`-Platzhalter, aber `t()` so bauen, dass sich später ein `t_plural(key, count)` ergänzen lässt, ohne alle Aufrufstellen anzufassen.

### 4.3 Kategorien-System & Solo/Team

**Kategorien: Presets + eigene Gruppen (orthogonale Gruppen, nicht eine einzelne Liste):**

```
category_groups: id, event_id, name, options[], sort_order
rider_categories: rider_id, group_id, selected_option
```

- **Presets** (Dropdown „Standard-Preset hinzufügen"): **Antrieb (Fixed/Free)**, **Gender (Open/FLINTA)** — je ein Klick fügt die Gruppe mit Standardwerten direkt hinzu.
- **Eigene Gruppe:** Name + eigene Optionsliste, gleiches UI-Pattern wie bei Checkpoint-Typen (Modal: Name, Optionen mit „+ Option", Speichern).
- **Export/Import als JSON**, wiederverwendbar zwischen Events (`alleycat-categories-<eventname>.json`), unabhängig von Fahrerdaten. Import zeigt Vorschau „X Gruppen gefunden — überschreibt bestehende Gruppen mit gleichem Namen".
- **Löschen/Umbenennen einer Option:** nicht-blockierend, Warnhinweis mit Bestätigung („X Fahrer betroffen — Zuordnung wird zurückgesetzt auf 'nicht zugeordnet'").

**Solo/Team — eigenständig, NICHT Teil der Kategorien:**

```
riders: + is_team_rider (bool), + team_id (nullable FK)
teams: id, event_id, name
```

- Fest im Fahrer-Registrierungsformular verankert (immer sichtbar, kein Feature-Toggle), unabhängig davon ob Kategorie-Gruppen aktiv sind.
- **Team-Auswahl mit Autocomplete:** Fuzzy-Match gegen bestehende Teams (tolerant bei Groß-/Kleinschreibung, Leerzeichen), „+ Neues Team anlegen: '…'" als expliziter separater Klick (kein versehentliches Anlegen durch Enter/Tab). Bei sehr ähnlichem Treffer (Levenshtein-Distanz 1–2): dezenter Hinweis „Meintest du 'X'?" über der Neu-anlegen-Option, nicht blockierend.
- **Team-Wertungsmodus** als Dropdown pro Team-Gruppe: „beste Einzelzeit" oder „alle müssen finishen, langsamste zählt".

**Fahrer-Formular (final):**
```
Startnummer: [__]
Name: [___________]
○ Solo   ○ Team → [Team wählen/neu ▾]
─── Kategorien (nur falls Gruppen aktiv) ───
Antrieb: [Fixed ▾]
Gender:  [Open ▾]
─────────────────────────────
Notfallkontakt: [___________]
```

### 4.4 Leaderboard-Filter

```
🔍 [Name/Startnummer...]  Status:[Alle ▾]
Antrieb:[Alle ▾]  Gender:[Alle ▾]  Team:[Alle ▾]
```

- Suchfeld: Live-Substring-Match über Name + Startnummer.
- Status-Filter: Alle / Unterwegs / Finished / DNF / DNS.
- Kategorie-Dropdowns nur sichtbar, wenn jeweilige Gruppe im Event aktiv ist.
- Alle Filter kombinierbar (UND-Verknüpfung), aktive Filter als entfernbare Chips + „Filter zurücksetzen"-Link.
- **Organizer-Ansicht:** ein Leaderboard mit Filtern. **Export/Druck:** Dropdown „Aufteilen nach: [keine / Antrieb / Gender / Team]" — nur EINE Gruppe gleichzeitig als Split, Ergebnis = separate Tabelle pro Optionswert dieser Gruppe.

### 4.5 CP-Reihenfolge & Distanzberechnung

- Neues Event-Feld: `checkpoint_order_mode: 'frei' | 'fest'` — **global pro Event**, nicht pro Checkpoint.
- **Fest:** Checkpoints bekommen `sequence`-Feld. Check-in bei Out-of-Order-Scan warnt mit Bestätigungsdialog (Override möglich, wird geloggt).
- **Frei:** kein Sequence-Zwang, „alle Pflicht-CPs erreicht" zählt fürs Finish.
- **Distanz:** reine Client-Berechnung per Haversine (Luftlinie, kein API-Call), live aus CP-Koordinaten. Bei „fest": Summe der Legs in Sequence-Reihenfolge zwischen CP-Karten/-Listeneinträgen + Gesamtdistanz. Bei „frei": keine sinnvolle „Streckenlänge" — ggf. weglassen oder nur Distanzmatrix.
- **UI-Hinweistext Pflicht:** „Luftlinie — reale Fahrstrecke ist länger."

### 4.6 Renn-Zustandsmaschine

```
in_planung  →  bereit  →  läuft  →  abgeschlossen
                  ↑___________|   (Rückwärts immer möglich, mit Bestätigungsdialog)
```

| Status | Bedeutung | Erlaubt |
|---|---|---|
| **In Planung** | CPs anlegen, Kapazität festlegen, Fahrer eintragen, Kategorien konfigurieren, Drucksachen erzeugen | Alles frei editierbar |
| **Bereit** | Vorbereitung abgeschlossen, Laptop kann mit | Strukturelle Änderungen weiterhin möglich, mit Warnhinweis |
| **Läuft** | Renntag, Check-ins aktiv | Check-in/Ziel aktiv, **CP-Struktur gesperrt** (read-only, Override mit Bestätigung möglich), Fahrer-Status (DNF etc.) änderbar |
| **Abgeschlossen** | Rennen vorbei | Read-only außer nachträgliche Zeitkorrektur (Pflicht-Notizfeld), Exporte weiterhin möglich |

**Übergänge:**
- **In Planung → Bereit:** manueller Klick „Vorbereitung abschließen". Blockierende Checks: ≥1 Checkpoint mit Position, Kapazität (`max_riders`) gesetzt. Nicht-blockierende Warnungen: Spokecards noch nicht gedruckt, Manifest noch nicht erzeugt.
- **Bereit → Läuft:** Beim Erreichen der Startzeit erscheint ein **blockierender Dialog** (kein Auto-Übergang):
  ```
  🏁 Startzeit erreicht
  [ Rennen jetzt starten ]
  [ +5 Minuten verschieben ]
  ```
  Mehrfach verschiebbar. Dialog erscheint im HQ (wo der Countdown sichtbar ist) — Annahme: Laptop bleibt während des Events offen am HQ, daher kein Push-Notification-Fallback nötig. Beamer bleibt bis zur Bestätigung in der Countdown-Phase hängen ("00:00:00 — wartet auf Start"), erst danach GO!-Trigger (siehe 4.8).
  Ab „Läuft": CP-Struktur wird gesperrt.
- **Läuft → Abgeschlossen:** manueller Klick „Rennen abschließen" (kein Auto-Trigger, da Alleycats kein festes Enddatum haben). Check davor: „Noch X Fahrer nicht im Ziel/nicht DNF gesetzt — trotzdem abschließen?"

```
events: + status ('planning'|'ready'|'running'|'completed')
        + status_changed_at (timestamp)
        + start_time (timestamp)
        + start_confirmed_at (timestamp, nullable — gesetzt beim Klick "jetzt starten")
        + max_riders (int) — Kapazitätslimit, siehe unten
```

**Wichtige Erkenntnis (Praxis-Constraint):** Checkpoints müssen VOR dem Renntag feststehen (Basis fürs Manifest), Teilnehmerkapazität muss VORAB feststehen (Basis für Spokecard-/Startnummern-Druck, da diese vor dem Event gedruckt werden, nicht erst bei Anmeldung). Daher `max_riders` als hartes Event-Feld; Startnummern-Slots 1..max_riders werden vorab angelegt, auch wenn noch nicht alle real zugeordnet sind. Es wird **keine** unregistrierten Starter geben (bestätigt) — kein Check „Fahrer ohne Startnummer" nötig.

**UI:** Status immer sichtbar im Event-Header, farbcodiert (Grau=Planung, Gelb=Bereit, Grün-pulsierend=Läuft, Blau=Abgeschlossen), Dropdown für manuellen Übergang.

### 4.7 Dashboard

- **Eigener Tab im HQ-Menü**, Inhalt kontextabhängig je Event-Status:
  - In Planung / Bereit → Vorbereitungs-Checkliste
  - Läuft → Live-Widgets
  - Abgeschlossen → Ergebnis-Zusammenfassung

**Widget-Katalog:**

| Widget | Inhalt |
|---|---|
| Status-Kacheln | Angemeldet / Unterwegs / Finished / DNF / DNS |
| Checkpoint-Auslastung | Alle CPs, Anzahl Check-ins, wenigste zuerst |
| Letzte Aktivität | Chronologische Mini-Liste letzter 5–10 Check-ins/Finishes, live |
| Kategorie-Verteilung | Balkendiagramm je aktiver Kategorie-Gruppe |
| Mini-Leaderboard | Top 5 + Link zum vollständigen Leaderboard |
| Event-Countdown | Zeit bis/seit Start |
| Nächste To-dos | Reine strukturelle Vollständigkeits-Checks, siehe unten |

**„Nächste To-dos"-Checks (nur strukturelle Lücken, kein Warnsystem mit Zeitschwellen):**
- Checkpoints ohne Position
- Event ohne Startzeit
- Keine Checkpoints angelegt
- Kategorie-Gruppe ohne zugeordnete Fahrer
- Kapazität (`max_riders`) nicht gesetzt
- Spokecards/Startnummern nicht gedruckt (`print_status: 'pending'|'printed'`)
- Manifest nicht final erzeugt
- Checkpoints ohne zugewiesenes Personal (siehe 4.11)
- Kartencache veraltet (>24h/>3 Tage, siehe 4.12)

**Anpassbarkeit:** Widgets ein-/ausblendbar UND in der Reihenfolge sortierbar (Drag-Handle, einfache vertikale Liste reicht — kein 2D-Grid nötig). Sinnvolle Default-Vorbelegung (Status-Kacheln, CP-Auslastung, Countdown aktiv; Rest optional).

```
dashboard_settings: event_id, widget_order[], widget_visibility{}
```
Pro Event gespeichert, nicht global.

### 4.8 Beamer-Ansicht (Basis)

- **Eigene Route**, z. B. `#/beamer/<event-id>`, kein Menü, Vollbild, hoher Kontrast (Dark-Theme evtl. erzwungen statt der 4 wählbaren Themes).
- **Phase 1 (vor Start):** Countdown bis Start-Zeit, Anzahl registrierter Fahrer.
- **GO!-Trigger:** beim Bestätigen des Starts (siehe 4.6) Vollbild-Overlay 3–5 Sek. ("🚦 GO!"), CSS-Puls/Fade-Animation, dann automatisch Übergang zu Phase 2. Sound-Hook `race_start` (siehe 4.9).
- **Phase 2 (nach Start):** Live-Leaderboard (Zeit seit Start, Platz, Name, Startnummer, CP-Fortschritt).
- **Separat erreichbar:** eigener Tab/eigene Route. In der **lokalen Variante** heißt „separat" praktisch: zweiter Tab im selben Browser auf demselben Gerät (IndexedDB ist origin-, nicht tab-gebunden) — Hinweistext beim Öffnen: „Läuft im selben Browser wie HQ — für externen Beamer-Rechner Server-Variante nutzen." Kein Cross-Device-Sync in local.
- **Sync-Mechanismus (lokal):** `BroadcastChannel` zwischen Tabs für sofortige Reaktion + IndexedDB-Polling alle 5–10 Sek. als robuster Fallback (falls Beamer-Tab neu geladen wurde/Broadcast verpasst hat). IndexedDB bleibt Wahrheitsquelle.

### 4.9 Sound-Hook (eigenständiges, wiederverwendbares Modul)

Bewusst als eigenständiges Modul gebaut (nicht Beamer-Einzeiler), da später auch für eine Server-Rider-App wiederverwendbar.

```js
// src/core/sound-hook.js
const AlleycatSounds = {
  sounds: {},
  register(key, url) { const a = new Audio(url); a.preload='auto'; this.sounds[key]=a; },
  play(key) {
    const a = this.sounds[key]; if (!a) return;
    a.currentTime = 0;
    a.play().catch(() => { /* Autoplay-Block, still ignorieren, optisches Fallback im UI */ });
  },
  isRegistered(key) { return !!this.sounds[key]; }
};

const SOUND_EVENTS = {
  race_start: 'Renn-Start (GO!)',
  checkpoint_scan: 'Checkpoint erfolgreich gescannt',
  rider_finished: 'Fahrer im Ziel',
  countdown_tick: 'Letzte 5 Sekunden',
  // ab Phase 12 (Spielmodi) ergänzt:
  zone_shrink: 'Zone schrumpft',
  rider_eliminated: 'Fahrer ausgeschieden',
  bonus_secured: 'Bonus-Checkpoint gesichert',
  checkpoint_revealed: 'Geheimer Checkpoint enthüllt'
};
```

- Nur `race_start` initial verdrahtet, Rest vorbereitet (kein totes UI-Feature — Slots tauchen erst auf, wenn zugehöriges Feature aktiv ist).
- Settings-UI: Datei-Upload (Base64 in Event-Settings/DB gespeichert, kein separates Dateisystem), Play-Test-Button. Kein Sound hinterlegt → `play()` macht nichts, kein Pflichtfeld.
- **Autoplay-Block-Hinweis:** Overlay „🔊 Klicken zum Aktivieren" falls `play()` scheitert.

### 4.10 Checkpoint-Liste (finale Spezifikation)

- **Spalten:** Name, Typ, Position, Reihenfolge-Nr., Auslastung (live), Zeitfenster-Status (offen/geschlossen), Distanz zum nächsten CP.
- **Sortierung/Gruppierung:** nach Reihenfolge (Sequence-Nr.), nach Checkpoint-Typ gruppiert.
- **Schnellaktionen** (direkt in der Liste, ohne Detailansicht): Sperren/Freigeben, Position inline anpassen, Duplizieren.
- **Karten-Kopplung:** Liste und Karte nebeneinander/synchronisiert — Klick auf Listeneintrag zentriert/zoomt die Karte auf diesen Checkpoint.

### 4.11 Checkpoint-Personal

```
checkpoint_staff: id, checkpoint_id, name, phone, role (optional), shift_note (optional), notes
```

- Mehrere Personen pro Checkpoint möglich (Liste, nicht nur ein Feld).
- UI in Checkpoint-Bearbeitung: Liste mit `tel:`-Link (direkt anrufbar), „+ Person hinzufügen".
- Checkpoint-Liste: optionale Spalte „Personal".
- Dashboard-To-do: „X Checkpoints ohne zugewiesenes Personal".
- **Datenschutz — wichtig:** Telefonnummern dürfen NICHT auf Manifest/Spokecards (fahrerseitig) erscheinen, analog zum Notfallkontakt-Feld. Neuer, separater interner Export **„Personal-Briefing"** (PDF, nur für den Organizer, klar getrennt vom Fahrer-Manifest), nutzt dieselbe PDF-Pipeline wie andere Dokumenttypen.
- **Forward-looking:** Grundlage für den späteren Checkpoint-Modus-Zugangscode (Server-Variante) — die hier zugewiesene Person bekommt später den Link für „ihren" Checkpoint.

### 4.12 Datensicherheit & Offline (Local-First)

**Auto-Backup (Download-Intervall):**
```js
function startAutoBackup(intervalMinutes = 10) {
  return setInterval(async () => {
    if (currentEvent.status !== 'running') return; // nur während "Läuft"
    const blob = await exportDatabaseAsSqlite();
    triggerDownload(blob, `alleycat-autobackup-${eventSlug}-${timestamp()}.sqlite`);
    updateLastBackupTimestamp();
  }, intervalMinutes * 60 * 1000);
}
```
- Intervall konfigurierbar in Settings, Default z. B. 10 Min. Nur während „Läuft" aktiv.
- Dashboard zeigt „Letztes Backup: vor X Min." als Transparenz-Statuszeile.
- Hinweistext beim ersten Start zu Browser-Mehrfach-Download-Bestätigung.
- Bekanntes offenes Problem (nicht MVP-kritisch): Downloads häufen sich im Ordner an, App kann sie nicht selbst löschen (kein Dateisystemzugriff) — ggf. später File System Access API nutzen (siehe 4.13).

**Beforeunload-Warnung:**
```js
window.addEventListener('beforeunload', (e) => {
  if (currentEvent?.status === 'running') { e.preventDefault(); e.returnValue = ''; }
});
```
Nur bei Status „Läuft". Custom-Text von Browsern nicht mehr unterstützt (nur generische Meldung) — zusätzlich dezenter Header-Hinweis „⚠ Tab bitte offen lassen".

**Offline-Kartenkacheln:**
- **Globaler Bereich „Offline-Bereitschaft" in den App-Settings** (nicht pro Event versteckt) — Liste aller Events mit Status „Bereit"/„Läuft" (nicht „In Planung", da CPs sich noch ändern), Checkbox pro Event, „Alle ausgewählten jetzt cachen"-Button, Gesamtspeicher-Anzeige.
- Vorab-Caching: Bounding Box aller CP-Positionen (+Puffer ~500m), Zoom 13–17, Speicherung als Blobs in IndexedDB: `tile_cache: {z}/{x}/{y} -> blob`.
- Leaflet `createTile` custom: erst IndexedDB prüfen, dann Netz, Fallback grauer Platzhalter.
- Geschätzte Downloadgröße vor dem Caching anzeigen.
- **iOS/Safari-Hinweis (Pflicht):** Storage-Eviction bei längerer Nichtbenutzung möglich. Einmaliger Hinweistext beim Aktivieren + wiederkehrende Warnung im „Nächste To-dos"-Widget, wenn `tile_cache_updated_at` älter als Schwellwert (z. B. >24h gelb, >3 Tage rot):
  ```
  ⚠ Kartencache ist 2 Tage alt
  iOS/Safari können Offline-Daten bei längerer Nichtbenutzung entfernen.
  Cache kurz vor dem Event aktualisieren.
  [ Jetzt aktualisieren ]
  ```
- Lizenz-Hinweis in der Doku: OSM-Tile-Nutzung für moderates, einmaliges Caching pro Event unproblematisch, keine Dauerlast — bei sehr häufiger Nutzung alternativen Tile-Provider erwägen.

**Storage-APIs:**
```js
async function requestPersistentStorage() {
  if (!(navigator.storage?.persist)) return null;
  if (await navigator.storage.persisted()) return true;
  return await navigator.storage.persist(); // Bitte, keine Garantie
}
async function getStorageEstimate() {
  if (!(navigator.storage?.estimate)) return null;
  const { usage, quota } = await navigator.storage.estimate();
  return { usedMB: usage/1024/1024, quotaMB: quota/1024/1024, percentUsed: usage/quota*100 };
}
```
- `requestPersistentStorage()` einmalig beim Erststart, ausgelöst durch Nutzerinteraktion.
- `getStorageEstimate()` in Settings anzeigen (ergänzt Kartencache-Anzeige), Warnung bei >80% genutzt.
- Ehrlich kommunizieren: kein Ersatz für Backups, nur Risikoreduktion gegen stille Browser-Löschung.

### 4.13 Weitere Browser-Plattform-Features

**Wake Lock API (Phase 9, mit Datensicherheit gebündelt):**
```js
let wakeLock = null;
async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return false;
  try { wakeLock = await navigator.wakeLock.request('screen'); return true; }
  catch { return false; }
}
document.addEventListener('visibilitychange', async () => {
  if (wakeLock && document.visibilityState === 'visible') await requestWakeLock();
});
```
Automatisch aktivieren: beim Öffnen der Beamer-Route, bei Status „Läuft" im HQ Ziel-Check-in-Screen. Bei fehlender Unterstützung nur dezenter Hinweis, kein Hack-Workaround. Support: Chrome/Edge gut, Safari ab iOS 16.4.

**Web App Manifest (ohne Service Worker, für "Zum Homescreen hinzufügen"):**
- Inline eingebettet via `data:application/manifest+json`, Icons als Base64.
- **Service Worker bewusst NICHT jetzt bauen** — siehe Abschnitt 7 (offene Entscheidung), da Konflikt mit Single-File-Prinzip.

### 4.14 PDF-Baukasten-System (customizable Inhalte)

```
pdf_blocks: id, event_id, type, target_documents[], enabled, sort_order, content, config{}
```

**Block-Typen:** `waiver` (Haftungsausschluss + Unterschriftszeile), `rules` (Renn-Regeln, Markdown), `sponsors` (Logos), `checkpoint_list` (CP-Übersicht mit Distanzen), `notes` (freies Event-Notizfeld), `custom_text` (frei definierbar), `emergency_info`.

**Settings-UI:** pro Dokumenttyp (Manifest, Spokecard) Liste aktivierbarer Blocks mit Drag-Handle (Reihenfolge) + Edit-Button. „+ Eigenen Block hinzufügen" (gleiches Muster wie Checkpoint-Typen/Kategorien). **Export/Import als Vorlage** (JSON) — einmal formulierten Waiver-/Regel-Text wiederverwenden.

**Waiver-Block Detail:** Markdown-Textfeld + Toggle „Unterschriftszeile anzeigen" + Toggle „Datum-Feld anzeigen". Rein Papier-Workflow (lokal kein digitales Signieren) — PDF rendert nur Linie + Label.

```js
function renderDocument(documentType, event) {
  const blocks = getBlocksFor(event.id, documentType).filter(b => b.enabled).sort((a,b) => a.sort_order - b.sort_order);
  return blocks.map(b => renderBlock(b, event)).join('\n');
}
```

**i18n-Bezug:** Block-**Titel** über `t()`, Block-**Inhalt** (Organizer-Freitext) bleibt unübersetzte Nutzereingabe, wie Kategorie-/Checkpoint-Namen.

### 4.15 Spielmodi-Engine (Rules Engine)

**MVP-Entscheidung:** nur vordefinierte Modi an-/ausschaltbar mit Parametern (analog Kategorie-Presets) — **kein visueller Regel-Baukasten im UI**, Engine bleibt intern generisch, damit spätere Modi nur Konfiguration statt Code-Umbau brauchen.

**Kernkonzept:** `Regel = WENN [Trigger] UND [Bedingung(en)] DANN [Effekt(e)]`

| Trigger | Bedingung | Effekt |
|---|---|---|
| `on_checkin` | `time_window` | `award_points` |
| `on_finish` | `zone_active` | `close_checkpoint` / `open_checkpoint` |
| `on_tick` (periodisch, nur Status „Läuft") | `prerequisite` | `reveal_checkpoint` |
| `manual` (HQ-Button) | `first_n` | `eliminate_rider` |
| | `rider_flag` | `set_rider_flag` |
| | `sequence_match` | `advance_zone_stage` |
| | `is_leader` | |

```
game_modes: id, event_id, mode_type, enabled, config{}
rule_runtime_state: event_id, key, value        -- z.B. aktuelle Zonen-Stufe, verborgene CPs, eliminierte Fahrer
points_ledger: id, event_id, rider_id, checkpoint_id, amount, reason, created_at
events: + scoring_mode ('time' | 'points')
```

**Preset-Katalog:**

| Modus | Zusammensetzung |
|---|---|
| Zeitfenster-CPs | `on_checkin` + `time_window` → Check-in nur im Fenster gültig |
| Battle Royale | `on_tick`+`manual` + `zone_active` → `close_checkpoint` außerhalb Zone, `advance_zone_stage` |
| Bonus-CPs | `on_checkin` + `first_n` → `award_points` (rangabhängig, z.B. 5/3/1) |
| Geheime CPs | `on_checkin` + `prerequisite` → `reveal_checkpoint` |
| Wildcard/Joker | `manual` (vor Start) → `set_rider_flag('joker_cp', cp_id)`, Ausnahme in Finish-Prüfung |
| Kettenreaktion | `on_finish` + `sequence_match` → `award_points` (Bonus-Multiplikator) |
| Sudden Death | `on_tick` (nach Cutoff), kein CP seit X Min. → `eliminate_rider` |
| Kopfgeld | **Phase 2 / spätere Erweiterung** — komplexer (laufende Leader-Neuberechnung + Tag-Interaktion zwischen Fahrern) |

**Battle-Royale-Zonen-Trigger:** konfigurierbar pro Event — `scheduled` (Zeitplan, automatisch), `manual` (nur HQ-Button), `both` (Zeitplan läuft, HQ kann vorziehen).
```
config: { trigger_mode: 'scheduled'|'manual'|'both', stages: [{radius, at_minute}] }
```

**Scoring-Integration:** Sobald ein Modus aktiviert wird, Warnhinweis-Dialog: „Wertung wechselt von Zeit zu Punkten. Zeit bleibt als Zusatzinfo im Leaderboard sichtbar." `scoring_mode='points'` → Sortierung nach Punkten, Zeit als Tiebreaker/Zusatzspalte, nicht rang-bestimmend. Punkte-Herkunft je Fahrer einsehbar (Klick → `points_ledger`-Einträge).

**Evaluierungs-Hooks:**
```js
recordCheckin(rider, checkpoint, timestamp);
evaluateRules(event, 'on_checkin', { rider, checkpoint, timestamp });
setInterval(() => evaluateRules(event, 'on_tick', { now: Date.now() }), 10000); // nur bei Status "Läuft"
evaluateRules(event, 'on_finish', { rider });
```

Module: `src/core/rules-engine.js` (generische Engine), `src/core/game-modes.js` (Preset-Katalog, Parameter-Formulare).

### 4.16 Live-Beamer für Spielmodi (lokal, kein Server)

Baut auf 4.8 auf, erweitert um modi-abhängige Widgets — bei keinem aktiven Modus verhält sich der Beamer exakt wie in 4.8 beschrieben.

```js
// src/core/live-sync.js
const channel = new BroadcastChannel('alleycat-live');
function broadcastEvent(type, payload) { channel.postMessage({ type, payload, timestamp: Date.now() }); }
channel.onmessage = (e) => handleLiveEvent(e.data);
// + IndexedDB-Polling alle 5 Sek als Fallback/Wahrheitsquelle (analog 4.8)
```

```js
function getBeamerLayout(event) {
  const modes = getActiveGameModes(event);
  return {
    showZoneMap: modes.some(m => m.type === 'battle_royale'),
    showPointsBoard: event.scoring_mode === 'points',
    showEventTicker: modes.length > 0,
    showZoneCountdown: modes.some(m => m.type === 'battle_royale' && m.config.trigger_mode !== 'manual')
  };
}
```

- **Zonen-Karte:** Leaflet-Kreis pro aktueller Battle-Royale-Stufe, CP-Marker eingefärbt (grün=offen+in Zone, rot=offen+außerhalb, grau=gesperrt, ausgeblendet=geheim+nicht enthüllt). Nutzt denselben Offline-Kachel-Cache wie 4.12.
- **Punkte-Leaderboard:** sortiert nach Punkten, Zeit als Zusatzinfo sichtbar.
- **Live-Ticker:** letzte 5–8 Ereignisse, neueste oben, Slide-in-Animation (🎯 Bonus gesichert, 🔓 Geheimer CP freigeschaltet, 💀 ausgeschieden, 🏁 im Ziel).
- **Elimination-Overlay:** wiederverwendet dieselbe Vollbild-Momentaufnahme-Mechanik wie der GO!-Trigger (3–4 Sek., dann zurück zur Live-Ansicht).
- **Sound-Hook-Erweiterung:** `zone_shrink`, `rider_eliminated`, `bonus_secured`, `checkpoint_revealed` — Engine bleibt entkoppelt vom Sound-Modul, ruft nur `AlleycatSounds.play(key)` an der jeweiligen Effekt-Stelle in `rules-engine.js`.

Module: `src/core/live-sync.js`, `src/core/beamer-modes.js` (getrennt von `beamer.js`, damit Events ohne aktive Modi diesen Code gar nicht laden).

**Später (Server-Variante):** `live-sync.js` innen durch WebSocket/API-Polling ersetzen, Widget-Logik (Zonen-Karte, Ticker, Punkte-Board) bleibt unverändert wiederverwendbar.

### 4.17 QoL — MVP-relevant (funktional, kein UI-Polish)

- **Bulk-Import (CSV) für Fahrerlisten:** Spalten-Mapping-UI, Validierung vor Import (doppelte Startnummern, fehlende Pflichtfelder), Fehlerliste statt stillem Scheitern.
- **Fehlerbildschirm/Error Boundary:** bei unerwartetem JS-Fehler nicht weißer Bildschirm, sondern „Etwas ist schiefgelaufen — Daten sind sicher in der Datenbank, [Neu laden]".
- **Generelles Undo/Aktions-Log:** über den bestehenden Ziel-Check-in-Undo hinaus, für die letzten paar Aktionen generell (Fahrer gelöscht, Kategorie geändert).

---

## 5. Scope-Tabelle: Local-First vs. Server-only vs. Roadmap

| Bereich | Local-First (MVP) | Server-only |
|---|---|---|
| Modul-Split, Build-Prozess | ✅ | ✅ (gemeinsame `src/core`) |
| Renaming HQ/Checkpoint, i18n-Grundgerüst | ✅ | ✅ |
| Kategorien, Solo/Team, Leaderboard-Filter | ✅ | ✅ |
| CP-Reihenfolge, Distanzberechnung | ✅ | ✅ |
| Renn-Zustandsmaschine, Dashboard | ✅ | ✅ |
| Checkpoint-Liste, Checkpoint-Personal | ✅ | ✅ |
| Beamer-Ansicht (Basis + Spielmodi) | ✅ (zweiter Tab, gleicher Browser) | ✅ (echtes zweites Gerät) |
| Sound-Hook | ✅ | ✅ (+ später Rider-App) |
| Datensicherheit/Offline (Backup, Beforeunload, Kartencache, Storage-APIs, Wake Lock) | ✅ | teilweise (Server hat ohnehin zentrales Backup) |
| PDF-Baukasten | ✅ | ✅ |
| Spielmodi-Engine | ✅ | ✅ |
| Bulk-Import, Error Boundary, Undo-Log | ✅ | ✅ |
| **Aktivitätsprotokoll (Mehrpersonen-Audit-Log)** | — | ✅ (erst bei mehreren gleichzeitigen Bearbeitern sinnvoll) |
| **Live-Multi-Checkpoint-Check-in** | — | ✅ (Roadmap) |
| **Fahrer-Selbstregistrierung** | — | ✅ (Roadmap) |
| **Rider-App** (inkl. echtem Foto-Upload) | — | ✅ (Roadmap, Zukunft) |
| **Foto-Beweis-Checkpoint-Typ mit HQ-Galerie** | — (nur Sichtprüfung, siehe 6.1) | ✅ (mit Rider-App) |

---

## 6. Klarstellungen zu bestehenden/geplanten Features

### 6.1 Checkpoint-Typ „Foto-Beweis"

- **Local-Variante:** reine **Sichtprüfung vor Ort** — Fahrer zeigt eigenes Foto, Organizer/Checkpoint-Person bestätigt „gesehen, passt" per Klick. **Kein** Kamera-Zugriff, **kein** Datei-Upload, **kein** Speichern des Bildes. Verhält sich UI-seitig wie ein einfacher Bestätigungs-Checkpoint (analog „Item-Abgabe"). **Keine HQ-Fotogalerie in local nötig.**
- **Server/Rider-App (Zukunft):** Fahrer lädt Foto über die App tatsächlich hoch, landet als Datei im Backend — dort ergibt eine HQ-Galerie zur nachträglichen Prüfung/Freigabe erst Sinn.

---

## 7. Bewusst vertagte / offene Entscheidungen

- **Service Worker:** aktuell nicht gebaut. Grund: Zielkonflikt zwischen Single-File-Prinzip und der Notwendigkeit einer eigenen SW-URL. Blob-URL-Registrierung funktioniert nicht in allen Browsern zuverlässig (Chrome/Edge strenger als Firefox). Drei Optionen bei späterer Entscheidung: (a) Blob-URL-Trick (Single-File bleibt, unzuverlässig), (b) separate `sw.js`-Datei (bricht Single-File, zuverlässig), (c) kein SW, nur Manifest (aktuell gewählt). Erneut aufgreifen, falls das Team bereit ist, Single-File für die lokale Variante bewusst aufzuweichen.
- **Kopfgeld-Modus** (Spielmodi-Engine): als Phase-2-Erweiterung markiert, nicht im initialen Preset-Katalog — braucht laufende Leader-Neuberechnung + Tag-Interaktion zwischen zwei Fahrern, komplexer als die anderen Modi.
- **UI-Politur generell** (Farbenblind-sichere Statusfarben, Toasts/Feedback-System, globale Schnellsuche Cmd/Strg+K, Tab-Titel als Statusanzeige, generische Spaltenauswahl in allen Tabellen, Changelog-Anzeige nach Update): explizit **erst nach vollständigem MVP** angehen, nicht vorher — sonst mehrfache Nacharbeit bei jedem neuen Feature.
- **Personalisierungs-Ideen-Pool (Admin/Widgets), NICHT final spezifiziert, nur gesammelt:**
  - Dashboard: Widget-Größe (klein/groß, Grid statt Liste), mehrere Dashboard-Profile („Vorbereitungs-/Renntag-/Nachbereitungs-Ansicht"), freies Notiz-Widget
  - Navigation: Event-Favoriten/anheften, eigene Nav-Reihenfolge, konfigurierbarer Startbildschirm
  - Visuell: freie Akzentfarbe, eigenes Vereinslogo im Header, Schriftgröße/Dichte-Einstellung
  - Effizienz: eigene Tastenkürzel, Schnellaktionen-Leiste, Text-Bausteine/Snippets
  - Gespeicherte Ansichten: Leaderboard-Filter-Presets, Fahrerlisten-Sortierung/Spalten speicherbar
  - Defaults: Standardwerte für neue Events (Kategorien/CP-Typen/Sound-Set vorbelegen), Bestätigungsdialoge ein/ausschaltbar
  - Multi-Organizer ohne Login: einfache Namens-Profile, eigene Widget-/Theme-Einstellungen, „zuletzt bearbeitet von"
  - Persönliches Cockpit: eigene freie To-do-Liste, „Zuletzt angesehen"-Verlauf

  → Bei Bedarf einzeln mit dem Nutzer priorisieren, bevor Umsetzung beginnt.

- **Weitere gesammelte, nicht tief spezifizierte Ideen** (eigene Bewertung/Scoping nötig, falls gewünscht):
  - Sweep-Rolle, Erste-Hilfe-Posten als CP-Typ, Vorfall-Log
  - **Dry-Run-Modus** (Event mit Fake-Check-ins/Zeitraffer simulieren, ohne echte Daten zu verschmutzen) — hervorgehoben als besonders wertvoll sobald die Spielmodi-Engine (4.15) existiert, um Timing vorab zu testen
  - Wetter-Widget (externe API) + manueller „wetterbedingt gesperrt"-CP-Status
  - Barcode-/RFID-Scanner-Support (Tastatur-Emulation), Sprach-Check-in (Web Speech API)
  - Hall of Fame / Fahrer-Profil-Historie über mehrere Events (Serie)
  - Freiwilligen-Verwaltung über CP-Personal hinaus (Foto, Merch, Bar)
  - Wechselbare Kartenebenen (Satellit/Terrain/Standard)
  - Ranking-Snapshots (archivierter Stand nach 1h, 2h)
  - File System Access API für Backup-Zielordner (statt unsortierter Downloads), Vibration API (Check-in-Feedback), getUserMedia (echter QR-Scan im späteren Checkpoint-Modus), Compression Streams API (Backup komprimieren), Clipboard API, Screen Orientation Lock (Beamer-Querformat), Web Workers (PDF-Generierung bei großen Startfeldern)

---

## 8. Verworfene Ideen

- **Instagram-Hashtag-Integration für den Beamer:** verworfen. Grund: Meta Graph API Hashtag-Search erfordert Business-Account + App-Review-Genehmigung, ist auf 30 Hashtags/Woche limitiert, aktuelle Quellen (Stand 2026) berichten von noch stärkeren Einschränkungen. Zusätzlich strukturell inkompatibel mit Local-First (App-Secret/OAuth-Handling gehört serverseitig, nicht in eine Client-HTML-Datei). Alternative, falls das Bedürfnis „Fotos am Beamer zeigen" später wieder aufkommt: eigene Foto-Wall mit direktem Upload (passt zur ohnehin geplanten Rider-App/Server-Variante) statt Instagram-Abhängigkeit.

---

## 9. Roadmap (unverändert übernommen + Ergänzungen aus dieser Session)

- Fahrer-Selbstregistrierung (öffentlicher Anmeldelink statt nur organizer-generierter Startnummern-Slots) — **Server-only**
- Live-Multi-Checkpoint-Check-in (umbenannt von „Live-Multi-Marshal-Check-in") / Live-Zuschauer-Leaderboard — **Server-only**
- Rider-App (inkl. echtem Foto-Upload für „Foto-Beweis"-Checkpoints, siehe 6.1) — **Server-only, Zukunft**
- Onboarding-Routine / interaktives Tutorial beim ersten Start — **ganz am Ende bauen**, wenn UI/Flows final stehen (sonst mehrfache Nacharbeit bei jeder Umbenennung/jedem neuen Feature)

---

## 10. Status-Update: Umsetzung in Claude Code (Stand 17.08.2026)

Phasen 0–13 aus diesem Dokument wurden umgesetzt (bestätigt durch projekteigene `PROJEKT-UEBERSICHT.md`). Bemerkenswerte Abweichungen/Ergänzungen gegenüber der ursprünglichen Spezifikation:

- **CSV-Bulk-Import** legt fehlende Teams automatisch an (Erweiterung ggü. Spec — sinnvoll, kein Einwand).
- **Kontrast-/Barrierefreiheit-Audit** des Dashboards wurde bereits durchgeführt, obwohl UI-Politur ursprünglich für "nach MVP" vorgesehen war (Abschnitt 7) — akzeptiert, da offenbar im Rahmen der Dashboard-Arbeit (Phase 4) miterledigt, kein separater Zeitverlust.
- **Undo-/Aktions-Log** realisiert als bewusst schmales Feature: letzte 5 Aktionen, nur innerhalb der laufenden Sitzung rückgängig machbar — kein vollständiges Änderungsprotokoll. Getrennt zu betrachten vom (weiterhin offenen) Mehrpersonen-Aktivitätsprotokoll für die Server-Variante.
- **320+ automatisierte Tests** in `test-suite.js`, wächst mit jeder Phase mit — hat sich über 13 Phasen hinweg zur Regressionsvermeidung bewährt.
- **`src/core/` ist byte-identisch zwischen beiden Varianten**, Storage-Trennung funktioniert wie geplant über klar definierte Seams.

**Bestätigte offene Lücken (laut `PROJEKT-UEBERSICHT.md`):**
- PHP-Backend nur gegen Mock getestet, **nicht** produktiv verifiziert → jetzt oberste Priorität, siehe Abschnitt 12
- Keine Fahrer-Selbstregistrierung (Server-only, Roadmap)
- Kein Live-Multi-Checkpoint-Check-in — wird jetzt als **größte strukturelle Lücke** der App bezeichnet (Server-only, Roadmap)
- Kein Mehrpersonen-Aktivitätsprotokoll (erst relevant, sobald mehrere Organizer gleichzeitig am selben Event arbeiten)
- Nur Deutsch im Frontend, i18n-Grundgerüst vorhanden aber ungenutzt für eine zweite Sprache

---

## 11. Priorisierungsentscheidung (aktueller Stand)

1. **Priorität 1 — PHP-Backend produktiv härten/kompatibel machen** (siehe Abschnitt 12). Begründung: ist das gemeinsame Fundament für beide offenen Roadmap-Punkte (Selbstregistrierung *und* Live-Multi-Checkpoint-Check-in) — beide brauchen echte Mehrgeräte-Fähigkeit, die bisher nur gegen einen Mock getestet ist.
2. **Zuschauer-/Öffentlichkeits-Feature** (öffentliches Leaderboard ohne Organizer-Zugang): zurückgestellt, später relevant, nicht jetzt priorisieren.
3. **Zweite Sprache (Englisch):** Frontend bleibt vorerst Deutsch. **Verbindliche Regel für alle künftigen Features, unabhängig vom Thema:** neue UI-Strings werden immer über die bestehende `t()`-Funktion/das i18n-Dictionary eingebunden, nie hart codiert — auch wenn nur Deutsch befüllt ist. Damit bleibt eine spätere Übersetzung reine Fleißarbeit statt einer Architekturänderung. Diese Regel gilt ab sofort für **jede** neue Phase, nicht nur für ein eigenes i18n-Projekt.

---

## 12. Phase 14: Backend-Härtung & breite Hosting-Kompatibilität

**Wichtiger Rahmenwechsel gegenüber der ersten Fassung dieses Plans:** Ursprünglich als "gegen einen bestimmten Host testen" gedacht. Da die App später an andere Menschen mit unbekannten Hosting-Umgebungen weitergegeben werden soll, liegt der Fokus jetzt bewusst auf **breiter Kompatibilität statt Einzel-Host-Verifikation**. Härtung heißt hier: die App erkennt und kommuniziert ihre eigenen Umgebungs-Grenzen selbst, statt dass im Voraus alle denkbaren Hoster durchgetestet werden (unmöglich).

### 14.1 Konservative Kompatibilitäts-Baseline
- **PHP-Ziel-Baseline: 7.4.** Kein Code, der PHP-8-only-Syntax voraussetzt (readonly-Properties, Enums, `match`-Expression ohne Fallback etc.) — viele günstige Shared-Hosting-Pakete hängen noch bei 7.x.
- **MySQL/MariaDB-Ziel-Baseline: MySQL 5.7 / MariaDB 10.2.** Keine CTEs, keine Window-Functions, kein nativer JSON-Spaltentyp — stattdessen `TEXT`-Spalten mit App-seitigem JSON-Encode/Decode. Macht unabhängig davon, ob der jeweilige Hoster diese Features unterstützt.
- **Charset:** `utf8mb4` explizit bei jeder Verbindung/Tabellenerstellung anfordern (wichtig wegen Emoji-Icon-Pack), mit automatischem Fallback auf `utf8`, falls nicht verfügbar. Fallback-Fall sichtbar im Pre-Flight-Check markieren (14.2), da Emoji-Icons dann eingeschränkt dargestellt werden könnten.

### 14.2 Pre-Flight-Check (Kernstück der Härtung)

Automatisierter Umgebungscheck, der `install.php` vorschaltet und bei **jeder** Installation auf **jedem** Hoster läuft — nicht nur einmalig gegen ein Testsystem:

```
┌─────────────────────────────────────────┐
│ Alleycat Dispatch — Umgebungscheck        │
│                                            │
│ ✅ PHP-Version: 8.1 (min. 7.4 erforderlich)│
│ ✅ PDO MySQL Extension vorhanden           │
│ ⚠️  utf8mb4 nicht verfügbar — Fallback     │
│    auf utf8, Emoji-Icons ggf. eingeschränkt│
│ ✅ MySQL-Version: 8.0                      │
│ ✅ Schreibrechte im Zielverzeichnis        │
│ ❌ max_execution_time zu niedrig (5s,      │
│    empfohlen: 30s) — bei großen Events     │
│    können Exporte fehlschlagen             │
│                                            │
│ [ Trotzdem installieren ]  [ Abbrechen ]  │
└─────────────────────────────────────────┘
```

- Läuft als allererster Schritt von `install.php`, **bevor** irgendetwas in die DB geschrieben wird.
- **Grün** = unkritisch, **Gelb** = funktioniert mit Einschränkung, **Rot** = würde die App kaputt machen — aber "Trotzdem installieren" bleibt als Override möglich für Nutzer, die es besser wissen.
- Geprüfte Punkte: PHP-Version, benötigte Extensions (`pdo_mysql`/`mysqli` — je nachdem was `storage-server.js`-Gegenstück im Backend nutzt), utf8mb4-Verfügbarkeit, MySQL/MariaDB-Version, Schreibrechte im Zielverzeichnis, `max_execution_time`, `memory_limit`.

### 14.3 Feature-Detection statt Versions-Parsing

Im laufenden Betrieb **keine** `if (mysqlVersion >= '8.0')`-Vergleiche — fragil, da MySQL- und MariaDB-Versionsnummern nicht dasselbe bedeuten. Stattdessen funktional prüfen: Test-Query mit `try/catch` ausführen, bei Fehler automatischer Fallback auf die einfachere/kompatiblere Variante. Robuster gegen die Vielfalt an Forks/Patches, die Hoster einsetzen.

### 14.4 `COMPATIBILITY.md` als lebendes Dokument

Wächst mit der Zeit: jede erfolgreiche (oder mit Problemen behaftete) Installation — bei dir oder später bei anderen Nutzern — wird dort eingetragen (Hoster-Name, PHP-/MySQL-Version, Besonderheiten/Workarounds). Baut sich organisch zu einer echten Kompatibilitäts-Datenbasis auf, statt im Voraus alle Hoster durchtesten zu müssen.

### 14.5 `INSTALL.md` ergänzen

Klare Mindestanforderungs-Liste ganz oben, bevor jemand überhaupt Dateien hochlädt: PHP ≥7.4, MySQL ≥5.7/MariaDB ≥10.2, `pdo_mysql`-Extension, Schreibrechte im Zielverzeichnis. Zusätzlicher Hinweis im README: falls der Pre-Flight-Check rot ausfällt und der Hoster nicht wechselbar ist → **lokale Variante empfehlen** (hat diese Server-Abhängigkeiten gar nicht).

### 14.6 Unverändert relevant aus dem allgemeinen Härtungsplan (nicht hostspezifisch)

- **Code-Audit:** SQL-Injection-Check (Prepared Statements/PDO-Parameterbindung überall, keine String-Concatenation in SQL), `display_errors` in Produktion aus (echte PHP-Fehler nie im Response-Body, stattdessen generische Fehlermeldung + serverseitiges Logging), API-Key ausreichend lang/zufällig (≥32 Byte) und wenn möglich gehasht in der DB, `.htaccess`-Schutz für Config-Dateien und `install.php` nach Erstnutzung.
- **Migrations-Verifikation:** Schema-Version-Mechanismus (`db_meta`) gegen frische UND bereits befüllte Datenbank testen. Testfall: alte Schema-Version simulieren, prüfen ob Migration sauber & ohne Datenverlust durchläuft.
- **Server-seitiges Backup ohne CLI-Zugriff:** eigener PHP-Export-Endpoint (DB als JSON/SQL-Dump zum Download), analog zum `.sqlite`-Export der lokalen Variante. Falls Cron über Control-Panel verfügbar: automatisierter täglicher Export als zusätzliches Sicherheitsnetz.
- **Nebenläufigkeit/Race Conditions**, konkrete Testfälle: zwei gleichzeitige Check-ins derselben Startnummer am selben Checkpoint (Duplikat-Schutz via Unique-Constraint/Transaktion?), gleichzeitiges Bearbeiten desselben Events von zwei Browsern (z. B. Kategorie löschen während ein anderes Gerät gerade einen Fahrer dieser Kategorie zuordnet).
- **Mini-Lasttest:** realistisches Szenario (~100 Fahrer, 10 Checkpoints, mehrere simulierte gleichzeitige Requests), prüfen ob Shared-Hosting-typische Skript-Laufzeit-/Memory-Limits zu Timeouts führen.

### 14.7 Praktischer erster Testlauf

Bestehender Webspace des Nutzers (`hasencore.de`, dort bereits eine andere App namens `rallykatcgn` in Betrieb) dient als **erster praktischer Durchlauf** — primär um zu verifizieren, dass der Pre-Flight-Check (14.2) selbst korrekt funktioniert (zeigt er die richtigen Werte an, bricht er sinnvoll ab bei echten Problemen), **nicht** als repräsentative Zielumgebung für alle künftigen Nutzer der App.

Vorgehen zur Ermittlung der dortigen PHP-/MySQL-Version:
1. Temporär eine `phpinfo.php` mit Inhalt `<?php phpinfo(); ?>` hochladen und aufrufen — zeigt PHP-Version, geladene Extensions, Memory-Limit, Max-Execution-Time.
2. MySQL/MariaDB-Version über phpMyAdmin-Login-Anzeige oder Query `SELECT VERSION();` ermitteln.
3. **`phpinfo.php` danach sofort löschen** — zeigt sicherheitsrelevante Server-Details öffentlich an, darf nie dauerhaft online bleiben.
4. Da am selben Hoster bereits `rallykatcgn` läuft, kann optional zunächst dieselbe DB-Instanz mit separatem Tabellen-Präfix für einen ersten Test genutzt werden, bevor ein eigener DB-Zugang für Alleycat Dispatch eingerichtet wird.

### 14.8 Reihenfolge innerhalb Phase 14

1. Pre-Flight-Check-Modul implementieren (14.2) + in `install.php` einhängen
2. Code-Audit durchführen (14.6, SQL-Injection/Error-Handling/API-Key/.htaccess)
3. Kompatibilitäts-Baseline im Backend-Code umsetzen (14.1, 14.3 — Feature-Detection statt Versions-Vergleiche)
4. Server-seitiger Backup-Endpoint (14.6)
5. Migrations-Verifikation gegen frische + befüllte Test-DB (14.6)
6. Race-Condition-Testfälle + Mini-Lasttest (14.6)
7. Realer Testlauf auf `hasencore.de` (14.7) — Pre-Flight-Check-Ausgabe verifizieren, `COMPATIBILITY.md` erstmalig befüllen
8. `INSTALL.md`/README aktualisieren (14.5)

Phase 15 (unten) ist unabhängig von Phase 14 umsetzbar (reine Karten-/Spielmodi-Erweiterung, kein Server-Bezug) und kann parallel oder davor laufen. Phase 16 (Live-Multi-Checkpoint-Check-in) und Phase 17 (Fahrer-Selbstregistrierung) sollten erst **nach** Abschluss von Phase 14 begonnen werden — Priorisierung zwischen den beiden noch offen, siehe Abschnitt 11.

---

## 13. Phase 15: Karten-Erweiterungen — Sonderorte, Zonen-Editor & Bezirke-Modus

Unabhängig von der Backend-Härtung (Phase 14) umsetzbar — reine Karten-/Spielmodi-Erweiterung ohne Server-Bezug, betrifft lokale wie Server-Variante gleichermaßen über `src/core/`.

### 15.1 Sonderorte: Headquarter & Afterparty

**Neues Konzept, getrennt von Checkpoints** — HQ und Afterparty sind Informationspunkte ohne Check-in-Logik, keine Checkpoints im eigentlichen Sinn.

```
event_locations: id, event_id, type ('headquarters' | 'afterparty'), 
                  name, lat, lng, address, notes,
                  linked_checkpoint_id (nullable FK)
```

- **HQ als Checkpoint markieren:** Checkbox „☐ Dies ist der Headquarter-Standort" in der Checkpoint-Bearbeitung. Setzt `linked_checkpoint_id`, Koordinaten werden automatisch vom Checkpoint übernommen (keine doppelte Pflege). Nur ein Checkpoint kann gleichzeitig HQ sein — beim Aktivieren eines zweiten wird der alte automatisch deaktiviert, mit Hinweis (nicht stillschweigend).
- **HQ ohne Checkpoint-Bezug:** falls Organizer nicht an einem Checkpoint sitzt — frei platzierbarer Marker auf der Karte, wie ein Checkpoint gesetzt, aber ohne Check-in-Funktion.
- **Afterparty/Endlocation:** eigener, unabhängiger Marker (eigene Koordinaten, Name, Adresse), **kein** Checkpoint-Bezug.
- **Kartendarstellung:** eigene Icons (🏠 HQ, 🎉 Afterparty), unterscheidbar von Checkpoint-Icons, in einer neuen Kartenlegende ein-/ausblendbar (siehe 15.5).

**Auswirkungen auf bestehende Features:**
- **PDF-Baukasten (4.14):** neuer Block-Typ `event_locations` — zeigt HQ-Adresse und Afterparty-Adresse/Name im Manifest.
- **Dashboard (4.7):** Zeile „Afterparty: [Name], [Adresse]" mit Maps-Deeplink.
- **Beamer, Status „Abgeschlossen":** optionale Einblendung „Weiter geht's bei: [Afterparty-Name]" nach Rennende, vor oder statt einem Podium-Screen (siehe 15.6).
- **Maps-Deeplink „Route zur Afterparty":** automatisch generierbar, sobald beide Orte (HQ oder letzter Checkpoint → Afterparty) gesetzt sind.

### 15.2 Generisches Zonen-System (Kreis + Polygon)

**Kernidee:** Battle Royale und der neue Bezirke-Modus sind zwei Anwendungsfälle desselben Systems — Zonen mit An/Aus-Zustand, nur unterschiedliche Aktivierungs-Logik.

```
zones: id, event_id, name, type ('circle'|'polygon'), 
       geometry (circle: {center:{lat,lng}, radius}; polygon: {points:[{lat,lng},...]}),
       color, group ('battle_royale'|'district'), 
       stage_order (nullable, nur battle_royale — definiert Schrumpf-Reihenfolge),
       active (bool),
       visible_on_hq_map (bool, default true),
       hidden_on_beamer_until_active (bool, default false)

checkpoint_zone_overrides: checkpoint_id, zone_id  -- nur bei manueller Überschreibung vorhanden
```

- **Battle Royale** = mehrere Zonen der Gruppe `battle_royale`, sortiert nach `stage_order`, **nur eine gleichzeitig aktiv** — `advance_zone_stage`-Effekt deaktiviert automatisch die vorherige Stufe beim Aktivieren der nächsten (sequenzielles Schrumpfen = Spezialfall von "eine Gruppe, ein aktives Mitglied").
- **Bezirke** = mehrere Zonen der Gruppe `district`, **beliebig viele gleichzeitig aktiv**, unabhängig per HQ-Button oder Zeitplan schaltbar (bestätigte Entscheidung: keine Rotation, freie Kombination).

**Checkpoint-Zonen-Zuordnung** (bestätigt: automatisch mit manueller Override-Möglichkeit):
```js
function getCheckpointZone(checkpoint, zones) {
  const override = getOverride(checkpoint.id);
  if (override) return zones.find(z => z.id === override.zone_id);
  return zones.find(z => isPointInZone(checkpoint.lat, checkpoint.lng, z)); 
  // Haversine-Distanz-Vergleich für Kreis, Ray-Casting-Algorithmus für Polygon
}
```
- Standard: automatische Geometrie-Prüfung.
- Override: pro Checkpoint in der Checkpoint-Bearbeitung „Zone manuell zuweisen" — für Grenzfälle, in denen ein CP knapp außerhalb der gezeichneten Fläche liegt, aber trotzdem zählen soll.
- **Überlappende Polygone:** Zonen-**Reihenfolge** entscheidet (gleiches Drag-Sortier-Prinzip wie bei Kategorien/Checkpoint-Typen/PDF-Blöcken/Dashboard-Widgets — konsistente UI-Sprache im ganzen Projekt), erste Übereinstimmung in der Liste gewinnt.

### 15.3 Zeichnen/Bearbeiten auf der Karte (mit Leaflet.draw)

**Architektur-Entscheidung (bestätigt):** Leaflet.draw wird als zusätzliche CDN-Dependency eingeführt — bewusste Ausnahme vom bisherigen "dependency-arm"-Prinzip (siehe `PROJEKT-UEBERSICHT.md`, Abschnitt 9 „Technische Leitplanken"). **Muss in der Doku explizit vermerkt werden** (README/`PROJEKT-UEBERSICHT.md` aktualisieren), mit Begründung: Kreis-Resize + Polygon-Editing selbst nachzubauen wäre unverhältnismäßig viel Code für einen etablierten Standard-Anwendungsfall.

```
Toolbar im Zonen-Editor: [○ Kreis] [⬠ Polygon] [✎ Bearbeiten] [🗑 Löschen]
```
- **Kreis:** Klick setzt Mittelpunkt, Ziehen definiert Radius (Standardverhalten Leaflet.draw).
- **Battle-Royale-Folgestufen:** Mittelpunkt wird automatisch von Stufe 1 übernommen (nicht verschiebbar), nur der Radius-Handle ist für weitere Stufen ziehbar — verhindert versehentlich versetzte Zonen-Zentren zwischen Stufen.
- **Polygon:** Klick-für-Klick Eckpunkte setzen, Doppelklick schließt die Form, Bearbeiten-Modus erlaubt nachträgliches Verschieben einzelner Punkte.
- Alle Stufen/Zonen gleichzeitig als Vorschau sichtbar (konzentrische Kreise bzw. mehrere Polygone in unterschiedlichen Farben), damit vor dem Speichern visuell geprüft werden kann, ob der Plan zur Strecke passt.

### 15.4 Rules-Engine-Erweiterung

Erweitert die bestehende Engine aus 4.15 um neue Bausteine:

| Neu | Zweck |
|---|---|
| Bedingung `zone_active` | Prüft, ob die Zone des Checkpoints (aus Kontext) aktuell aktiv ist |
| Effekt `set_zone_active(zone_id, active)` | Schaltet eine einzelne Zone (Bezirke-Modus) |
| Effekt `advance_zone_stage` (bereits vorhanden, jetzt auf Zonen-System umgestellt) | Deaktiviert aktuelle Battle-Royale-Stufe, aktiviert nächste |

**Neuer 8. Spielmodus-Preset „Bezirke":**
```
Trigger: on_checkin   Bedingung: zone_active(checkpoint's zone)   Effekt: award_points
Trigger: manual / on_tick (Zeitplan)   Effekt: set_zone_active
```
Zwei konfigurierbare Sub-Varianten pro Bezirk:
- **„Punkte nur wenn aktiv"** — Checkpoint bleibt immer scannbar, gibt aber nur Punkte, wenn seine Zone gerade aktiv ist.
- **„Nur erreichbar wenn aktiv"** — Checkpoint komplett gesperrt (wie beim Zeitfenster-Modus), solange seine Zone inaktiv ist.

### 15.5 Kartenrendering (HQ-Karte + Beamer, erweitert 4.16)

```js
zones.forEach(zone => {
  const layer = zone.type === 'circle' 
    ? L.circle(zone.geometry.center, { radius: zone.geometry.radius, color: zone.color })
    : L.polygon(zone.geometry.points, { color: zone.color });
  layer.setStyle({ opacity: zone.active ? 1 : 0.3, dashArray: zone.active ? null : '4' });
  layer.addTo(map);
});
```
- **HQ-Karte:** immer alle Zonen sichtbar (Organizer muss planen können), `visible_on_hq_map`-Toggle blendet nur optisch aus/ein, versteckt keine Information.
- **Beamer:** `hidden_on_beamer_until_active` generalisiert von der ursprünglichen Battle-Royale-only-Idee auf beide Modi — bei Battle Royale versteckt es künftige Schrumpfstufen (Überraschungseffekt), bei Bezirken versteckt es Grenzen noch nicht aktivierter Zonen (Fahrer sehen Zone 2 erst, wenn sie live geht). Inaktive, aber sichtbare Zonen: gedämpft/gestrichelt dargestellt statt komplett unsichtbar.
- **Kartenlegende (neu):** kurze ein-/ausklappbare Liste „Symbol → Bedeutung", jetzt nötig durch mehrere Icon-Typen (Checkpoint-Typen, HQ, Afterparty, Zonen-Farben).

### 15.6 Weitere Ergänzungen aus derselben Session

- **Podium-/Siegerehrungs-Screen am Beamer:** nach Status „Abgeschlossen" eigener Vollbild-Screen mit Top 3, bevor automatisch/per Klick zur Afterparty-Einblendung gewechselt wird.
- **Visuelle Routen-Karte als Bild/PDF-Export:** ergänzt den bestehenden GPX-Export (reine Daten) um eine gerenderte Übersichtskarte mit Checkpoints, HQ und Afterparty markiert, zum Ausdrucken/Aushängen.
- **Aushang-Format für Endergebnis:** größeres Druckformat (A3) der finalen Ergebnistabelle für die Afterparty, eigener Export neben dem regulären Manifest.
- **Zonen-Konfiguration als Vorlage speicherbar:** Export/Import als JSON, analog zum Kategorie-Export — einmal gebautes Zonen-Setup für künftige Events derselben Serie wiederverwenden.

### 15.7 Modul-Platzierung

```
src/core/zones.js          -- Geometrie-Helfer (Point-in-Circle/Polygon), Zonen-CRUD, gemeinsames Rendering
src/core/event-locations.js -- HQ/Afterparty-Verwaltung
```
Genutzt von `rules-engine.js` (neue Bedingung/Effekte), `map.js` (HQ-Karte), `beamer-modes.js` (Beamer-Rendering, ersetzt die bisherige Battle-Royale-only-Logik aus 4.16 durch die generische Zonen-Version).

### 15.8 Reihenfolge innerhalb Phase 15

1. `src/core/zones.js`: Datenmodell + Geometrie-Helfer (Point-in-Shape-Tests) + Tests dafür
2. Leaflet.draw einbinden, Zonen-Editor-UI (Zeichnen/Bearbeiten/Löschen)
3. `event_locations`: HQ/Afterparty-Datenmodell + Checkpoint-Checkbox + freistehender Marker
4. Rules-Engine um `zone_active`-Bedingung und `set_zone_active`-Effekt erweitern, bestehenden Battle-Royale-Code auf das neue Zonen-System umstellen (Regressionsgefahr — bestehende Battle-Royale-Tests müssen weiterhin grün bleiben)
5. Neuer Spielmodus-Preset „Bezirke" in `game-modes.js`
6. Kartenrendering HQ + Beamer erweitern (Polygon-Support, Sichtbarkeits-Toggles, Legende)
7. PDF-Block `event_locations`, Dashboard-Zeile, Beamer-Podium/Afterparty-Screen
8. `PROJEKT-UEBERSICHT.md`/README: Leaflet.draw als bewusste Dependency-Ausnahme dokumentieren

### 15.9 Mobile Kartenansicht — ein-/ausblendbar

Betrifft alle Karte+Liste-Kombinationen (Checkpoint-Liste aus 4.10, künftig Sonderorte-Verwaltung aus 15.1), damit die Karte auf kleinen Bildschirmen nicht den gesamten Platz beansprucht.

```
UI-Komponente: CollapsibleMapPanel (wiederverwendbar über alle Karte+Liste-Ansichten)
```

- **Breakpoint-abhängig:** Toggle-Button nur unterhalb einer Mobile-Schwelle (z. B. <768px) sichtbar. Desktop-Verhalten bleibt unverändert (Karte immer parallel zur Liste sichtbar).
- **Default auf Mobile: eingeklappt** — maximiert sofort den Bildschirmplatz für die Liste. Aufklappbar per Button „🗺 Karte anzeigen" / „✕ Karte ausblenden".
- **Zustand pro Gerät persistiert** (localStorage, z. B. `ui_preferences.mapCollapsed`), analog zum Sprache-pro-Gerät-Prinzip (4.2) — keine erneute Wahl bei jedem Öffnen nötig.
- **Ausnahme Zonen-Editor (15.3):** dort ist die Karte die Eingabefläche selbst (Kreis/Polygon zeichnen) — ignoriert die Collapse-Einstellung, Karte immer sichtbar unabhängig vom generellen Toggle-Zustand.
- **Bewusst einfach für den ersten Wurf:** simpler Auf/Zu-Button statt Bottom-Sheet-Drag-Geste (halb/ganz/eingeklappt mit Wisch-Gesten wie bei Google Maps) — Letzteres wäre UI-Politur, käme erst nach MVP (Abschnitt 7) infrage, falls gewünscht.

---

## 14. Phase 16: Feature-Registry, Settings-Hub & Politur-Features

**Architektur-Kerngedanke:** Bestehende, über viele Settings-Ecken verstreute Ein-/Ausschalt-Optionen (Kategorien, Spielmodi, Sound-Hook, Offline-Cache, künftig Social-Share-Karten) an einer zentralen Stelle auffindbar machen — Obsidian-Community-Plugins-Stil. Kein Doppelbau bestehender Konfigurations-UIs, nur ein einheitlicher Einstiegspunkt + Übersicht.

### 16.1 Feature-Registry (zentrale Datenstruktur)

```js
// src/core/feature-registry.js
const FEATURE_REGISTRY = [
  { id: 'social_share_cards', scope: 'device', name: 'Social-Share-Karten',
    description: 'Automatisch generierte Ergebnis-Bilder nach Rennende',
    defaultEnabled: true, configScreen: null },
  { id: 'sound_hook', scope: 'device', name: 'Sound-Effekte',
    defaultEnabled: true, configScreen: 'sound-settings' },
  { id: 'offline_map_cache', scope: 'device', name: 'Offline-Kartenkacheln',
    defaultEnabled: false, configScreen: 'offline-settings' },
  { id: 'battle_royale', scope: 'event', name: 'Battle Royale',
    defaultEnabled: false, configScreen: 'zone-editor' },
  { id: 'districts', scope: 'event', name: 'Bezirke',
    defaultEnabled: false, configScreen: 'zone-editor' },
  { id: 'categories', scope: 'event', name: 'Kategorien',
    defaultEnabled: true, configScreen: 'category-settings' },
  // ... jedes bestehende toggle-fähige Feature aus Abschnitt 4/13 wird hier eingetragen
];
```

- **`scope: 'device'`** — persönliche, geräteweite Präferenz (analog zur Sprachauswahl 4.2): Social-Share-Karten, Sound-Hook, Offline-Cache, künftig auch Bestätigungsdialoge (Personalisierungs-Pool, Abschnitt 7).
- **`scope: 'event'`** — pro Event schaltbar, nutzt weiterhin die bestehenden Datenmodelle (`game_modes`, `category_groups` etc.) — die Registry ist nur die vereinheitlichte Übersicht, **kein** Ersatz für bestehende Speicherung.
- **`configScreen`** — Klick auf ⚙ neben einem Eintrag springt zur bereits vorhandenen Detail-Konfiguration (Zonen-Editor, Sound-Settings), keine neue UI nötig.
- **Verschmelzung mit dem Dev-`FEATURES`-Flag-Objekt (Abschnitt 3):** dieselbe Datenstruktur für beide Zwecke — ein Feature mit `enabled: false` im Entwicklungsstand taucht in der nutzerseitigen Registry schlicht noch nicht auf. Kein Parallelsystem.

### 16.2 Settings-Hub-UI

```
┌─────────────────────────────────────────┐
│ 🔍 [Feature suchen...]                    │
│                                            │
│ GERÄT                                     │
│  🎉 Social-Share-Karten            [●───] │
│  🔊 Sound-Effekte              [●───] [⚙] │
│  🗺 Offline-Kartenkacheln       [○───] [⚙] │
│                                            │
│ EVENT: [aktueller Event-Name]             │
│  🏆 Battle Royale               [○───] [⚙] │
│  🗺 Bezirke                     [○───] [⚙] │
│  🎫 Kategorien                  [●───] [⚙] │
└─────────────────────────────────────────┘
```
Such-/Filterfeld ab ca. 10–15 Einträgen sinnvoll (wird beim aktuellen Funktionsumfang schnell erreicht).

### 16.3 Smart Empty States

Wiederverwendbare Komponente statt Einzellösungen pro Screen:
```js
<EmptyState icon="📍" title="Noch keine Checkpoints"
  description="Lege deinen ersten Checkpoint an oder starte mit einer Vorlage."
  primaryAction={{ label: "Ersten Checkpoint anlegen", onClick: ... }}
  secondaryAction={{ label: "Beispiel-Setup laden", onClick: ... }} />
```

**Anwendungsfälle:**
- Checkpoint-Liste (4.10) ohne Einträge → „Ersten Checkpoint anlegen" / „Beispiel laden"
- Fahrerliste ohne Einträge → „Ersten Fahrer anlegen" / „CSV importieren" (Verweis auf 4.17 Bulk-Import)
- Leaderboard vor Rennstart → „Rennen läuft noch nicht — Ergebnisse erscheinen hier, sobald es losgeht" statt leere Tabelle
- Dashboard-Widget „Letzte Aktivität" vor dem ersten Check-in → freundlicher Platzhaltertext
- Zonen-Editor (15.3) ohne gezeichnete Zone → „Noch keine Zone gezeichnet" mit direkten Zeichnen-Buttons

### 16.4 Social-Share-Karten

- **Trigger:** manueller Button „🎉 Ergebnis-Karte erstellen" im Dashboard bei Status „Abgeschlossen" bzw. am Beamer-Podium-Screen (15.6) — **kein** automatisches Auslösen ohne Nutzeraktion.
- **Rendering:** Canvas API, rein clientseitig, kein Server-Call. Inhalt: Top 3, Event-Name, Datum, optional Vereinslogo (Wiederverwendung des Sponsoren-Blocks aus 4.14).
- **Style:** nutzt die bestehenden 4 Themes (Feldpost/Hell/Dunkel/Dracula) statt eines eigenen fünften Karten-Designs.
- **Export:** Download als PNG + Web Share API auf Mobilgeräten (natives System-Share-Sheet statt nur Download).
- **Deaktivierbar** über die Feature-Registry (`scope: 'device'`) — bei Deaktivierung verschwindet der Button vollständig aus Dashboard und Beamer.

### 16.5 Modul-Platzierung

```
src/core/feature-registry.js   -- zentrale Registry, Lookup-Funktionen (isEnabled(id), toggle(id))
src/core/empty-states.js        -- wiederverwendbare EmptyState-Komponente + Vorlagen-Katalog
src/core/social-share.js        -- Canvas-Rendering, Web-Share-Integration
```

### 16.6 Reihenfolge innerhalb Phase 16

1. `feature-registry.js`: Datenstruktur + Speicherung (device-scope in Settings-Tabelle, event-scope verweist auf bestehende Tabellen) + Lookup-Funktionen
2. Bestehende Features nachträglich in die Registry eintragen (Kategorien, Spielmodi, Sound-Hook, Offline-Cache) — reine Verkabelung, keine Funktionsänderung an den Features selbst
3. Settings-Hub-UI (Liste, Toggle, Suche, Sprung zu `configScreen`)
4. Smart-Empty-States-Komponente + Einbau an den 5 genannten Stellen (16.3)
5. Social-Share-Karten (Canvas-Rendering, Button-Platzierung, Web-Share-API, Registry-Eintrag)
6. Manuelle QA gegen `MANUAL_QA.md`: prüfen, dass Deaktivieren eines Features das zugehörige UI vollständig entfernt (kein totes/greyed-out Element)

---

## 15. Phase 17: PDF-Baukasten 2.0 — Layout, neue Blöcke, Dokument-Vorlagen

Erweitert das bestehende System aus 4.14 von reiner linearer Liste (an/aus + Reihenfolge) zu einem Auto-Flow-Layout mit Spalten-Anordnung — bewusst **kein** vollständiger 2D-Drag&Drop-Grid-Editor, da `jsPDF` koordinatenbasiert zeichnet statt HTML zu layouten; ein echter WYSIWYG-Editor wäre ein eigenes großes Projekt.

### 17.1 Datenmodell-Erweiterung

```
pdf_blocks: id, event_id, document_type, block_type, enabled, sort_order,
            width ('full' | 'half' | 'third'),
            page_break_before (bool),
            content, config{}

pdf_document_templates: document_type ('manifest' | 'spokecard' | 'personal_briefing' | 'aushang_endergebnis'),
                         default_blocks: [{block_type, width, sort_order}]
```

**Migrationshinweis (wichtig):** Bestehende `pdf_blocks`-Einträge aus 4.14 haben noch kein `width`-Feld — Default beim Nachladen: `'full'`, entspricht 1:1 dem bisherigen Verhalten (ein Block pro Zeile). Rückwärtskompatibel, keine Datenverluste.

### 17.2 Auto-Flow-Rendering (statt echtem 2D-Grid-Editor)

```js
function layoutBlocks(blocks) {
  const rows = [];
  let currentRow = [];
  let currentWidth = 0;
  const widthValue = { full: 1, half: 0.5, third: 0.33 };

  for (const block of blocks) {
    const w = widthValue[block.width];
    if (block.page_break_before || currentWidth + w > 1.001) {
      if (currentRow.length) rows.push(currentRow);
      currentRow = [];
      currentWidth = 0;
    }
    currentRow.push(block);
    currentWidth += w;
  }
  if (currentRow.length) rows.push(currentRow);
  return rows; // jede Row wird nebeneinander gerendert, Zeilenhöhe = höchster Block darin
}
```
- Blöcke mit `width: 'half'`/`'third'` reihen sich automatisch nebeneinander ein, bis eine Zeile voll ist (100 %) — kein manuelles Positionieren nötig.
- `page_break_before` erzwingt zusätzlich einen Seitenumbruch vor diesem Block.
- Zeilenhöhe = höchster Block der Zeile (Textmaße vorab per `jsPDF.getTextDimensions()`/`splitTextToSize()` berechnen).

### 17.3 UI (bleibt beim etablierten Listen-Pattern, jetzt mit Breiten-Auswahl)

```
┌─────────────────────────────────────────┐
│ PDF-Layout — Manifest                     │
│                                            │
│ ☑ Titel/Header         [Breite: 100% ▾] ⋮⋮ │
│ ☑ CP-Übersicht         [Breite: 50%  ▾] ⋮⋮ │
│ ☑ Streckenkarte (Bild) [Breite: 50%  ▾] ⋮⋮ │
│    ↳ nebeneinander, da beide 50 % + direkt aufeinanderfolgend
│ ☐ Seitenumbruch davor
│ ☑ Renn-Regeln          [Breite: 100% ▾] ⋮⋮ │
│ [+ Block hinzufügen]          [ Vorschau ] │
└─────────────────────────────────────────┘
```
- Gleiches Drag-Handle-Prinzip wie bei Kategorien/Checkpoint-Typen/Dashboard-Widgets — konsistente Interaktionssprache im gesamten Projekt.
- **„Vorschau"-Button** rendert eine Seiten-Miniaturansicht (echtes PDF im Hintergrund erzeugt, als Bild angezeigt). Bewusst **kein** Live-Update bei jedem Tastendruck, um wiederholte PDF-Generierung während des Tippens zu vermeiden.

### 17.4 Neue Block-Typen

| Typ | Zweck |
|---|---|
| `image` | Bild-Upload (Streckenkarte aus 15.6, Eventfotos, Vereinslogo groß). Config: `{caption, alignment}` |
| `table` | Strukturierte Datentabelle aus vordefinierten Quellen: `checkpoint_distances`, `category_breakdown`, `team_list` — kein Freiform-Tabellenbau, sondern App-Daten gerendert |
| `variable_text` | Erweiterung von `custom_text` um Platzhalter, siehe 17.5 |

**Bild-Handling:** Upload wird clientseitig komprimiert/verkleinert vor dem Speichern (z. B. max. 1600px Breite, JPEG-Qualität ~80 %), um die SQLite-DB-Größe in der lokalen Variante nicht unnötig aufzublähen — konsistent mit der bestehenden Speicherplatz-Sensibilität (Storage-Estimate-Warnung aus 4.13).

### 17.5 Variablen/Platzhalter in Textblöcken

```
{{event.name}}, {{event.date}}, {{event.riderCount}}, 
{{event.hqAddress}}, {{event.afterpartyName}}
```
- Werden beim Export interpoliert, nicht beim Speichern — bleibt weiterhin unübersetzter Nutzertext (wie bisher, siehe 4.14), nur jetzt mit dynamischen Werten befüllt.
- **Praktischer Nutzen:** Eine einmal formulierte Vorlage („Willkommen beim {{event.name}}! Start ist am {{event.date}}...") bleibt über mehrere Events hinweg wiederverwendbar, ohne bei jedem Import manuell nachbearbeitet zu werden — verstärkt den Wert des bestehenden Vorlagen-Exports/-Imports aus 4.14 erheblich.

### 17.6 Dokument-Typ-Vorlagen (bestätigt)

Jeder Dokumenttyp bekommt sinnvolle Default-Blöcke bei Erststellung, nicht nur einen leeren Baukasten:

| Dokumenttyp | Default-Blöcke |
|---|---|
| Manifest | Header (100%), CP-Übersicht (50%) + Streckenkarte (50%), Renn-Regeln (100%), Haftungsausschluss (100%), Sponsoren (100%) |
| Spokecard | Startnummer (100%), Notfallinfos klein (100%), Sponsoren-Logo klein (100%) |
| Personal-Briefing (4.11) | Checkpoint-Personal-Liste (100%), Notizen (100%) |
| Aushang-Endergebnis (15.6) | Titel (100%), Leaderboard-Tabelle groß (100%), Sponsoren (100%) |

- „Auf Standard zurücksetzen"-Button pro Dokumenttyp, falls das Layout durcheinandergerät.
- Vorlagen-Export/-Import (bestehend aus 4.14) wird um Block-Breiten und Dokumenttyp-Zuordnung erweitert — ein exportiertes Vorlagen-Set bringt jetzt das komplette Layout mit, nicht nur welche Blöcke aktiv sind.

### 17.7 Modul-Anpassung

```
src/core/pdf-blocks.js   -- erweitert um layoutBlocks(), Breiten-Logik, Vorlagen-Verwaltung
```
`export-pdf.js` ruft `layoutBlocks()` vor dem eigentlichen Rendering auf, iteriert dann zeilenweise statt wie bisher rein linear block-für-block.

### 17.8 Reihenfolge innerhalb Phase 17

1. Datenmodell-Migration (`width`-Feld mit Default `'full'`, rückwärtskompatibel — bestehende Events dürfen sich optisch nicht verändern)
2. `layoutBlocks()`-Funktion + Tests (verschiedene Breiten-Kombinationen, Seitenumbruch-Fälle, Edge Case „Summe > 100%")
3. UI: Breiten-Dropdown + Seitenumbruch-Checkbox pro Block ergänzen
4. Neue Block-Typen: `image` (inkl. Client-seitiger Komprimierung), `table`, `variable_text`
5. Vorschau-Funktion (PDF-Rendering im Hintergrund, als Bild angezeigt)
6. Dokument-Typ-Vorlagen: Default-Blocksets pro Typ, „Auf Standard zurücksetzen"
7. Vorlagen-Export/-Import um Breiten/Dokumenttyp erweitern
8. Regressionstest: bestehende Manifeste/Spokecards aus Events vor der Migration müssen weiterhin identisch aussehen

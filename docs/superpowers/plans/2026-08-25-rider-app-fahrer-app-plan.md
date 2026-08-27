# Rider App — Teilprojekt 2: Fahrer-App (Implementierungsplan)

Stand: 25.08.2026. Umsetzungsplan zur Spec [`2026-08-25-rider-app-fahrer-app-design.md`](../specs/2026-08-25-rider-app-fahrer-app-design.md). Die Spec beschreibt das *Was* und *Warum*, dieser Plan die Reihenfolge und die Prüfschritte. Bei Widerspruch gilt die Spec.

Branch: `feature/rider-app`. Zusammenführen nach `main` erst, wenn alle elf Abnahmekriterien aus Spec §11 erfüllt sind.

Setzt [Teilprojekt 1](2026-08-25-rider-app-fundament-plan.md) voraus (auf `main`, abgeschlossen 25.08.2026).

## Reihenfolge und ihre Begründung

Sieben Pakete. Drei Regeln bestimmen die Reihenfolge, zwei davon aus Teilprojekt 1 gelernt:

1. **Reine Verschiebung zuerst.** Paket 1 bewegt nur Code zwischen Dateien, ohne Verhalten zu ändern. Solange die Testsuite danach unverändert grün ist, weiß man, dass alles Folgende auf festem Grund steht. Umgekehrt wäre ein Extraktionsfehler mitten in einem Paket voller neuer Funktionen kaum zuzuordnen.
2. **Backend vor Client** (aus Teilprojekt 1). Paket 2 macht `cp_type` per `curl` abrufbar, bevor eine Oberfläche ihn anzeigen soll.
3. **Druckstücke spät.** Sobald die Spokecards das neue Format tragen, sind die alten im Umlauf. Das soll erst passieren, wenn die App, die sie braucht, nachweislich funktioniert.

**Umgang mit dem Kern-Fingerabdruck.** In Teilprojekt 1 galt „einmal setzen, dann eingefroren". Hier greift das nicht, weil gleich drei Pakete den geteilten Kern berechtigt anfassen. Statt Ausnahmen anzukündigen, gilt die Regel pro Paket:

| Paket | fasst den Kern an? | Fingerabdruck |
|---|---|---|
| 1 Extraktionen | ja | danach neu setzen |
| 2 Checkpoint-Typ | ja, eine Zeile | danach neu setzen |
| 3 Build-Ausgabe | ja, nur `i18n.js` | danach neu setzen |
| 4 Fahrer-App | ja, nur `i18n.js` | danach neu setzen |
| 5 Offline | ja, nur `i18n.js` | danach neu setzen |
| 6 Druckstücke | ja | danach neu setzen |
| 7 Abnahme | **nein** | muss unverändert bleiben |

**Korrektur vom 26.08.2026:** Die Zeilen 3 bis 5 standen hier zunächst auf „nein". Das war falsch und fiel beim Bauen von Paket 3 sofort auf: die Strings der Fahrer-App leben unter `riderScan` in `i18n.js`, weil genau das die i18n-Entscheidung war — eine Quelle für alle Strings, statt eines zweiten Übersetzungssystems. Jedes Paket, das neue Fahrer-Strings braucht, fasst damit zwangsläufig den Kern an.

Der Detektor bleibt trotzdem nützlich, nur ist die Prüfung eine andere als gedacht: bei den Paketen 3 bis 5 muss `git diff --stat src/core/` **ausschließlich `i18n.js`** zeigen. Jede andere Kerndatei in dieser Liste ist ein Leck.

Bei den Ja-Zeilen ist die Prüfung eine andere: den Ausschlag gegen `git diff` halten. Passt die Änderung zum beabsichtigten Eingriff, neu setzen; ist sie größer, nachsehen.

---

## Paket 1 — Extraktionen aus dem geteilten Kern

**Ziel:** `CHECKPOINT_TYPES` und die QR-Funktionen liegen in eigenen Dateien, die das Fahrer-Bundle mitnehmen kann. Kein Verhalten ändert sich.

### 1.1 `src/core/checkpoint-types.js` (neu)

Aus [checkpoint.js:25](../../../src/core/checkpoint.js:25) herausziehen: `CHECKPOINT_TYPES`, `BUILTIN_CHECKPOINT_TYPE_KEYS`, `getCheckpointType()` sowie das Laden/Speichern eigener Typen (`checkpointTypes:custom`).

In `CORE_FILES` **vor** `checkpoint.js` einsortieren. Die Reihenfolge ist zwar überwiegend unkritisch (gehoistete Funktionsdeklarationen), aber `CHECKPOINT_TYPES` ist ein `let` auf oberster Ebene, das `withCheckpointDefaults()` beim Aufruf liest — sauberer, die Definition vorher stehen zu haben.

**Falle:** `CHECKPOINT_TYPES` enthält Aufrufe von `t()` in den Label-Feldern. Beim Verschieben darf daraus **keine** frühere Auswertung werden, sonst frieren die Beschriftungen auf die Sprache beim Laden ein — das ist ein bereits einmal aufgetretenes Muster in diesem Projekt. Die bestehende Struktur unverändert übernehmen, nichts „aufräumen".

### 1.2 `src/core/rider-qr.js` (neu)

Aus `rider-sync.js` herausziehen: `parseRiderQrPayload()`, `buildRiderQrPayload()`, `buildCheckpointQrPayload()`, `RIDER_PUBLIC_ID_RE`, `RIDER_TOKEN_RE`.

`generateEventPublicId()` bleibt dagegen in `rider-sync.js` — die Fahrer-App erzeugt keine Event-IDs, sie liest sie. Der Maßstab für die Extraktion ist „braucht das Fahrer-Bundle es?", nicht „steht es thematisch daneben?".

Grund (Spec §4.2): der Rest von `rider-sync.js` hängt an `state`, `debouncedSave()` und `logUndoableAction()`, die es im Fahrer-Bundle nicht gibt.

In `CORE_FILES` vor `rider-sync.js`.

### 1.3 Prüfung

```bash
node build.js && node build.js --core-hash > .local-baseline
```

`test-suite.js` im lokalen Build **unverändert grün** (905/905, plus die zwei bekannten Wackler). Das ist hier der einzige Beweis, den es gibt: der Fingerabdruck ändert sich zwangsläufig, also trägt allein die Testsuite.

Zusätzlich von Hand: Checkpoint-Typ im Editor wechseln, Sprache in den Einstellungen umstellen und prüfen, dass die Typ-Beschriftungen mitwandern (Absicherung gegen 1.1s Falle).

Baseline danach neu setzen (siehe Tabelle oben).

---

## Paket 2 — Checkpoint-Typ veröffentlichen

**Ziel:** `?a=me` liefert den Checkpoint-Typ, damit die Fahrer-App zeigen kann, was dort zu tun ist.

### 2.1 Migration `3`

```sql
ALTER TABLE `{p}_rider_checkpoint` ADD COLUMN `cp_type` VARCHAR(32) NOT NULL DEFAULT '';
```

`ADD COLUMN IF NOT EXISTS` gibt es in MariaDB, in MySQL nicht — deshalb vorher gegen `information_schema.COLUMNS` prüfen und nur bei Bedarf ausführen. Die Idempotenz-Zusage des Migrations-Runners gilt weiter.

### 2.2 Publish und Auslieferung

- `buildRiderSyncPayload()` in `rider-sync.js`: `cpType: cp.type` ergänzen.
- `rider.php`, `?a=sync`: Spalte mitschreiben.
- `rider.php`, `?a=me`: `cpType` in der Checkpoint-Liste zurückgeben.

Der Typ ist kein Geheimnis — er steht auf dem gedruckten Manifest in der Hand des Fahrers.

### 2.3 Prüfung

Gegen lokale MariaDB, Muster wie in Teilprojekt 1:

- Migration auf frischer und auf Version-2-Datenbank, danach erneut (No-op).
- Publish schreibt `cp_type`, `?a=me` gibt ihn zurück.
- Ein Checkpoint ohne gesetzten Typ liefert den leeren String, keinen Fehler.

Der Fingerabdruck ändert sich hier berechtigt (eine Zeile in `buildRiderSyncPayload()`). `git diff --stat` muss genau das zeigen und nichts weiter, dann Baseline neu setzen.

---

## Paket 3 — Dritte Build-Ausgabe

**Ziel:** `dist/alleycat-rider.html` entsteht, lädt, und fordert nach dem Laden keine externe Adresse an. Inhalt ist noch ein Platzhalter.

### 3.1 jsQR einbetten

**Dieser Schritt lädt eine Datei aus dem Netz herunter und braucht deine ausdrückliche Zustimmung** — Quelle, Datei und Größe stehen unten, damit du entscheiden kannst:

```
https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js   →   vendor/jsQR-1.4.0.js   (~45 KB)
```

Genau die Version, die beide Templates heute schon per CDN laden ([local.template.html:13](../../../templates/local.template.html:13)). In den Kopf der Datei kommt ein Kommentar mit Herkunft, Version, Abrufdatum und Lizenz (Apache-2.0). Kein npm, keine Build-Werkzeuge.

Die bestehenden zwei Varianten bleiben beim CDN — hier wird nichts umgestellt.

### 3.2 `templates/rider.template.html` (neu)

Schlank: `<meta viewport>`, `{{RIDER_CSS}}`, `{{JSQR_JS}}`, `{{RIDER_JS}}`, ein `#app`-Container, `initRider();`. Keine CDN-Verweise.

### 3.3 `src/styles/rider.css` (neu)

Eigenes Stylesheet, nicht `base.css` — das ist Organizer-Layout (`.settings-layout` und Verwandte) und im Fahrer-Bundle toter Ballast.

`themes.css` wird dagegen **mitgenommen**: dort liegen die Farbtoken, und die Fahrer-App soll wie dasselbe Produkt aussehen.

Auslegung: eine Spalte, große Tippflächen (mindestens 48 px), hoher Kontrast — die App wird bei Sonne, in Bewegung, mit Handschuhen bedient.

### 3.4 `build.js`

`RIDER_FILES` und `buildRiderVariant()` ergänzen, dazu den i18n-Zuschnitt:

- `translations`-Literal aus `i18n.js` per `new Function('return ' + literal)()` auswerten (Zeile 14–1062, reine Daten).
- Nur `RIDER_I18N_NAMESPACES = ['common', 'checkpoint', 'riderScan']` übernehmen, dasselbe für `en.json`.
- Ergebnis als `const translations = {...}` ins Rider-Bundle schreiben.

Der Guard (`assertCoreIsBackendAgnostic`) prüft weiterhin nur `CORE_FILES` — `src/rider/*` ist ausdrücklich nicht Kern. Seine vierte Regel wird jetzt zum ersten Mal scharf, weil `src/rider/` ab hier existiert: kein Kernmodul darf eine dort definierte Funktion aufrufen.

### 3.5 Prüfung

- `node build.js` erzeugt drei Ausgaben, Guard grün.
- `dist/alleycat-rider.html` im Browser öffnen: Platzhalter erscheint.
- **Netzwerk-Reiter: kein einziger externer Aufruf.** Das ist das Kriterium dieses Pakets.
- Bundle-Größe protokollieren (Richtwert ~120 KB, Grenze 200 KB).
- `test-suite.js` weiter grün, Fingerabdruck unverändert.

---

## Paket 4 — Fahrer-App, Kern

**Ziel:** Ein Fahrer kann sich anmelden, seinen Fortschritt sehen und einchecken — mit Netz.

### 4.1 Module in `src/rider/`

| Datei | Inhalt |
|---|---|
| `state.js` | eigenes `riderState`-Objekt, `localStorage`-Zugriff (Sitzung, Cache) |
| `api.js` | `riderApiUrl` aus dem URL-Fragment ableiten, `?a=me` / `?a=checkin` / `?a=register` |
| `scanner.js` | jsQR-Schleife über `<canvas>`, nachgebaut nach [checkin.js:172](../../../src/core/checkin.js:172) |
| `views.js` | Login, Formular, Warteansicht, Home, Bestätigung |
| `init.js` | Einstieg, Fragment auswerten, Sitzung wiederherstellen |

**Woher kennt die App den Endpunkt?** Aus dem eigenen Speicherort: `rider.php` liegt relativ zur HTML-Datei. Das ist die einzige Stelle, an der die Fahrer-App eine Annahme über Pfade macht — sie gehört als Kommentar dokumentiert, damit ein späteres Verschieben nicht rätselhaft scheitert.

### 4.2 Zustandsmaschine

Wie Spec §7.1: `confirmed` → Home, `free` → Formular, `pending` → Warteansicht (pollt `?a=me` alle 30 s), unbekannt → Fehler mit Code-Eingabe.

### 4.3 Neuer i18n-Namensraum `riderScan`

Deutsch in `i18n.js`, direkt neben `riderApp`. **An beide Namensräume einen Kommentar**, der den Unterschied festhält (Spec §4.3): `riderApp` = Organizer-Seite, `riderScan` = Fahrer-App. Die Namen laden sonst zur Verwechslung ein.

`src/i18n/en.json` **nicht** anfassen — Englisch synchronisiert der Nutzer separat auf Anfrage.

### 4.4 Prüfung

Gegen echtes lokales Backend, im Browser mit Handy-Viewport:

- Spokecard-Nutzlast von Hand ins Fragment schreiben → Home erscheint mit richtiger Startnummer.
- Checkpoint-Nutzlast scannen (oder einspeisen) → Check-in erscheint binnen 5 s im Organizer.
- Wildcard-Token → Formular, absenden, Warteansicht; Organizer bestätigt, App springt selbsttätig auf Home.
- Eigene Spokecard am Checkpoint gescannt → eigene Meldung, kein Serverruf.
- Fremdes Event → eigene Meldung, kein Serverruf.

---

## Paket 5 — Offline

**Ziel:** Ein Check-in ohne Empfang geht nicht verloren.

### 5.1 `src/rider/queue.js`

Ablauf strikt nach Spec §7.3, Schritt 4 ist der tragende: **erst in die Queue schreiben, dann senden.** Nicht umgekehrt. Stürzt die App zwischen Senden und Antwort ab, ist der Scan trotzdem gesichert; `uq_client` macht das doppelte Senden folgenlos.

Retry bei drei Auslösern: `online`, `visibilitychange` (Rückkehr in den Vordergrund), Intervall 20 s.

Behandlung nach Antwort (Spec §7.4), fünf Fälle:

| Antwort | Eintrag |
|---|---|
| `200 ok` | streichen |
| `200 duplicate` / `already` | streichen |
| `403` | streichen, dem Fahrer zeigen |
| `409 race_not_running` | **behalten** |
| Netzwerkfehler / `5xx` | behalten |

### 5.2 Cache und Wake Lock

- Nach jedem erfolgreichen `?a=me` die Antwort nach `alleycat-rider:cache` schreiben.
- Scheitert `?a=me` beim Start, den Cache anzeigen plus Banner „offline — Stand von HH:MM".
- `navigator.wakeLock` anfordern, solange die App im Vordergrund ist; bei `visibilitychange` erneut anfordern (der Browser gibt ihn beim Wegschalten frei). Fehlt die API, still weitermachen.

### 5.3 `test-suite-rider.js` (neu)

Eigene Suite nach dem Muster der bestehenden (Konsolen-Paste, `runRiderTestSuite()`), gegen `dist/alleycat-rider.html`:

- Queue: Eintrag überlebt Reload; alle fünf Antwortfälle aus 5.1.
- Cache: Start mit scheiterndem `?a=me` zeigt letzten Stand plus Banner.
- Zustandsmaschine: alle vier `slotStatus`-Wege.
- Payload-Ablehnung: eigene Spokecard am Checkpoint, fremdes Event, Müll, Leerstring.

`CLAUDE.md` um die zweite Testsuite ergänzen (Abschnitt „Commands").

### 5.4 Prüfung

Browser mit gedrosseltem/abgeschaltetem Netz: drei Scans offline, wieder online, alle drei kommen an, keine Duplikate. Dazu die neue Suite grün.

---

## Paket 6 — Druckstücke

**Ziel:** Die Karten und Aufsteller, ohne die nichts davon benutzbar ist.

Dieses Paket fasst den geteilten Kern an (`export-pdf.js`, `checkin.js`, `rider.js`) — Baseline danach neu setzen, siehe Tabelle oben. Es ist das letzte Paket, das das darf.

### 6.1 Spokecard umstellen

In `drawSpokeCardBack()` ([export-pdf.js:366](../../../src/core/export-pdf.js:366)) und der QR-Erzeugung ([rider.js:458](../../../src/core/rider.js:458)):

- QR-Inhalt: `riderAppBaseUrl()` leer → weiter `String(rider.bib)`; sonst `buildRiderQrPayload(...)`.
- `rider.name` von der Rückseite **entfernen** — in beiden Varianten, ausdrückliche Nutzerentscheidung.
- `rider.riderCode` klein unter den QR setzen, gut lesbar (Monospace).

### 6.2 Marshal-Check-in liest beide Formate

`onQrScanSuccess(data)` ([checkin.js:174](../../../src/core/checkin.js:174)) bekommt `parseRiderQrPayload()` vorgeschaltet, Verhalten nach Spec §5.4.

**Der `rider`-Fall löst lokal auf**, gegen `rider.riderToken` im geladenen Event — kein Serverruf. Der Ziel-Check-in muss auch dann funktionieren, wenn der Orga-Laptop gerade kein Netz hat.

**Kritischster Test des ganzen Teilprojekts:** eine alte Karte mit nackter Startnummer muss weiterhin funktionieren. Dafür ein eigener Testfall, nicht nur ein Handgriff.

### 6.3 Checkpoint-QR-PDF

Neue Funktion in `export-pdf.js`, Knopf im Manifest-Bereich unter „Drucken", nur sichtbar wenn `riderAppBaseUrl()` gesetzt ist.

Eine Seite je Checkpoint mit `qrCheckinEnabled`: QR mindestens 90 mm, Checkpoint-Name groß, Eventname klein, Fußzeile „Nicht abnehmen — dieser Code gehört zum Rennen". Kein QR-Checkpoint vorhanden → Hinweis statt leerem PDF.

### 6.4 Prüfung

- Neue Testfälle: beide QR-Formate im Marshal-Scanner, Seam-abhängiger Spokecard-Inhalt, kein Name im PDF, eine PDF-Seite je QR-Checkpoint.
- Von Hand: Spokecard-PDF erzeugen, mit dem Handy vom Bildschirm scannen, App muss sich anmelden.
- Von Hand: Checkpoint-PDF erzeugen, vom Bildschirm scannen, Check-in muss durchgehen.
- Fingerabdruck nach diesem Paket ein letztes Mal neu setzen.

---

## Paket 7 — Abnahme

**Ziel:** Alle elf Kriterien aus Spec §11 nachweislich erfüllt.

### 7.1 Auf echtem Gerät

Ablauf aus Spec §10.3, inklusive des ehrlichen Gegentests: Neuladen im Flugmodus **muss** die Browser-Fehlerseite zeigen — das ist die bekannte Grenze ohne Service Worker. Danach online neu laden: die gepufferten Check-ins müssen trotzdem gesendet werden. Diese Prüfung belegt, dass die zurückgestellte Entscheidung Bequemlichkeit kostet, aber keine Daten.

### 7.2 Sicherheitsdurchsicht

- Netzwerk-Reiter: nach dem Laden nur Aufrufe an `rider.php`.
- Alle Antworten der Fahrer-App auf Fahrernamen und Notfallkontakte durchsuchen — es darf keiner vorkommen (Teilprojekt 1 prüfte das serverseitig, hier zählt, was tatsächlich über die Leitung geht).
- Kein Admin-API-Key im Bundle: `grep` über `dist/alleycat-rider.html` nach `X-Api-Key`.

### 7.3 Dokumentation

- `CLAUDE.md`: `checkpoint-types.js` und `rider-qr.js` in die Modultabelle, dritte Build-Ausgabe, zweite Testsuite, `vendor/` erklären.
- `docs/implementation-notes.md`: Begründung für das eingebettete jsQR, für „erst puffern, dann senden", und für den zurückgestellten Service Worker samt dem, was stattdessen dagegen hilft.
- `php-backend/INSTALL.md`: Fahrer-App hochladen, Adresse im Setup eintragen, HTTPS-Empfehlung.
- `docs/alleycat-dispatch-roadmap-14-23.md`: Paket 15 auf erledigt.
- In-App-Doku (`documentation.js`): neues Thema „Fahrer-App" — Karten austeilen, Fahrer einweisen, und der ehrliche Satz „App vor dem Start öffnen und offen lassen".

### 7.4 Zusammenführen

`feature/rider-app` nach `main`, wenn beide Testsuiten grün sind und alle elf Kriterien abgehakt.

---

## Was dieser Plan bewusst offen lässt

- **Der reale Testlauf auf `hasencore.de`** — weiterhin offen, braucht deinen Webspace-Zugriff. Erst dort zeigt sich, ob ein echter Hoster die Fahrer-App ausliefert und ob HTTPS steht.
- **Last durch echte Handys.** Die Prüfungen erzeugen Last mit einem Gerät und `curl`. Wie sich vierzig Fahrer gleichzeitig an einem Checkpoint verhalten, weiß danach niemand.
- **iOS-Eigenheiten.** Kamerazugriff verhält sich auf iOS Safari anders als auf Android Chrome (Berechtigungsdialog, `playsinline`, Auto-Start). Der Gerätetest sollte auf beiden laufen; steht nur eines zur Verfügung, gehört das als Lücke dokumentiert statt als „geprüft" verbucht.
- **Der Service Worker** bleibt zurückgestellt (Spec §13), nicht verworfen.

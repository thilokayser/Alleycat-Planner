# Rider App — Teilprojekt 1: Fundament (Implementierungsplan)

Stand: 25.08.2026. Umsetzungsplan zur Spec [`2026-08-25-rider-app-fundament-design.md`](../specs/2026-08-25-rider-app-fundament-design.md). Die Spec beschreibt das *Was* und *Warum*, dieser Plan die Reihenfolge und die Prüfschritte. Bei Widerspruch gilt die Spec.

Branch: `feature/rider-fundament`. Zusammenführen nach `main` erst, wenn alle Abnahmekriterien aus Spec §12 erfüllt sind.

## Reihenfolge und ihre Begründung

Sieben Pakete. Die Reihenfolge folgt drei Regeln:

1. **Grenze vor Code.** Paket 0 erzwingt die Trennung zwischen geteiltem Kern und Servercode maschinell, bevor die erste Zeile Rider-Code entsteht. Ein Guard, der erst nachträglich eingeschaltet wird, findet Verstöße als Altlast statt als Fehler.
2. **Reine Funktionen zuerst.** Paket 1 baut nur Dinge, die ohne Server und ohne Netz testbar sind — Token-Erzeugung, Parser, Merge-Logik. Damit steht die Testabdeckung, bevor irgendetwas Netzwerkabhängiges dazukommt, und Fehler in der Merge-Logik zeigen sich nicht erst beim Debuggen einer HTTP-Antwort.
3. **Backend vor Verkabelung.** Die Pakete 2 und 3 machen `rider.php` per `curl` vollständig benutzbar, bevor die Organizer-App es aufruft. Ein Fehler ist dann eindeutig einer Seite zuzuordnen, statt zwischen zwei gleichzeitig neuen Schichten zu verschwinden.

Die Pakete 0 und 1 verändern den lokalen Build zwangsläufig (Seam-Bereinigung, neue Felder, neues Modul in `CORE_FILES`). Sie sind bewusst die einzigen Pakete, die das dürfen — die Build-Hash-Baseline wird am Ende von Paket 1 einmal gesetzt und ist danach für den Rest des Teilprojekts eingefroren.

---

## Paket 0 — Build-Guard

**Ziel:** Servercode kann nicht mehr unbemerkt in `src/core/*` geraten. Der Build bricht ab, statt still eine aufgeblähte lokale Variante zu erzeugen.

Begründung: die Trennung zwischen Varianten ist bisher eine Konvention, und Konventionen brechen still. Die beiden Varianten teilen rund 97,5 % ihres Codes (11.204 Zeilen `src/core/`, davon 289 Zeilen variantenspezifisch), eine physische Trennung in zwei Repos wäre also unverhältnismäßig teuer. Ein erzwungener Check liefert dieselbe Garantie zum Preis von etwa 20 Zeilen Node.

### 0.1 Zwei bestehende Verstöße beheben

`CLAUDE.md` behauptet, `src/core/*` verzweige nie auf `hasSharedStorage`. Das stimmt nicht — es gibt zwei Stellen:

- [data-safety.js:126](../../../src/core/data-safety.js:126) (`renderDataSafetySection`)
- [dashboard.js:486](../../../src/core/dashboard.js:486) (`renderBackupStatusLine`)

Beide machen dasselbe: sie blenden die Auto-Backup-Oberfläche aus, wenn die App unter dem geteilten Artifact-Speicher läuft. Genau diese Frage beantwortet bereits ein Seam — `exportBackupBlob()` liefert dort `null`. Die beiden Stellen fragen nur daran vorbei.

Behebung: neuer synchroner Seam `supportsLocalBackup()` in beiden `src/storage/*`-Dateien, der `!hasSharedStorage` zurückgibt. Die beiden Aufrufstellen fragen ihn statt der Variablen.

Das muss **vor** dem Guard passieren, sonst startet er mit einer Ausnahmeliste — und eine Ausnahmeliste, die ab Tag eins existiert, wächst.

### 0.2 Guard in `build.js`

Neue Funktion `assertCoreIsBackendAgnostic()`, aufgerufen vor dem ersten `buildVariant()`. Prüft jede Datei aus `CORE_FILES` gegen vier Regeln:

| Regel | Begründung |
|---|---|
| kein `hasSharedStorage` | Kapazitätsfragen gehören an einen Seam |
| kein `sqlDb` | reines Local-Backend-Detail |
| kein `rider.php`, kein `api.php` **als Zeichenkette im Code** | Endpunkt-Wissen gehört in `src/storage/*` |
| kein Bezeichner aus `src/rider/` | Rider-Bundle darf nicht in den Kern lecken |

Verstoß → `process.exit(1)` mit Dateiname, Zeilennummer und der verletzten Regel.

**Die dritte Regel braucht eine Einschränkung:** `i18n.js` enthält legitim `api.php` und `install.php` in den Platzhaltertexten des PHP-Setup-Bildschirms ([i18n.js:1027](../../../src/core/i18n.js:1027)). Der Guard prüft deshalb nur Vorkommen außerhalb von Zeichenketten-Literalen — oder, einfacher und ausreichend: er nimmt `i18n.js` von genau dieser einen Regel aus, mit Kommentar im Code, warum. Übersetzungstexte sind Daten, kein Endpunkt-Wissen.

Die Liste der Rider-Bezeichner wird aus `src/rider/` gelesen, sobald das Verzeichnis existiert; solange es fehlt, ist die vierte Regel wirkungslos statt fehlerhaft.

### 0.3 Prüfung

- `node build.js` läuft durch.
- Testweise `hasSharedStorage` in ein Kernmodul schreiben → Build bricht mit korrekter Datei- und Zeilenangabe ab. Danach zurücknehmen.
- Testsuite grün.
- `CLAUDE.md`: die Behauptung über die Seams stimmt jetzt tatsächlich; `supportsLocalBackup()` in die Seam-Liste aufnehmen.

---

## Paket 1 — Kern-Datenfelder und reine Funktionen

**Ziel:** Alle Datenfelder und alle netzunabhängigen Funktionen existieren und sind getestet. Nach diesem Paket funktioniert nach außen noch nichts Neues — das ist beabsichtigt.

### 1.1 `src/core/utils.js`

- `generateRiderToken()` — 32 Zeichen aus `[a-z0-9]`, Quelle `crypto.getRandomValues`, **nicht** `Math.random`.
- `generateRiderCode()` — 8 Zeichen aus `[A-Z0-9]` ohne `O`, `0`, `I`, `1`. Dieselbe Zufallsquelle.
- `sha256Hex(str)` — `async`, über `crypto.subtle.digest`. Wird erst in Paket 4 aufgerufen, entsteht aber hier, damit die Tests aller Hash-abhängigen Pfade an einer Stelle liegen.

### 1.2 `src/core/rider.js`

- `withRiderDefaults()` ([rider.js:2](../../../src/core/rider.js:2)) um `riderToken`, `riderCode`, `riderStatus`, `pendingData`, `gpsFlags` erweitern.
- `generateRiderSlots()` ([rider.js:24](../../../src/core/rider.js:24)): neu angelegte Slots bekommen Token und Code. **Die Zeile, die bestehende Slots wiederverwendet (`existing.find(r => r.bib === i)`, [rider.js:33](../../../src/core/rider.js:33)), bleibt unverändert** — sie ist der Grund, warum gedruckte Karten ein Regenerieren überleben.
- `ensureRiderTokens(evt)` — füllt fehlende Token in bereits bestehenden Events nach, gibt `true` zurück, wenn etwas ergänzt wurde. Ersetzt einen eigenen Migrationsschritt.

### 1.3 `src/core/checkpoint.js`

- Neue Checkpoint-Felder `qrCheckinEnabled` (Default `false`) und `qrToken` in der Anlage-Funktion ([checkpoint.js:6](../../../src/core/checkpoint.js:6)).
- `ensureCheckpointTokens(evt)`, analog zu `ensureRiderTokens`.

### 1.4 Neues Modul `src/core/rider-sync.js`

In diesem Paket nur die reinen Funktionen, noch kein Polling:

- `parseRiderQrPayload(text)` → `{kind:'rider'|'checkpoint'|'legacyBib'|null, ...}`. Muss die alte nackte Startnummer weiterhin erkennen, sonst bricht der bestehende Marshal-Check-in.
- `slotStatusToDb(status)` / `slotStatusFromDb(status)` — die `''`↔`'free'`-Sonderregel aus Spec §4.1, ausschließlich hier.
- `mergeRiderLogRows(evt, rows)` → `{changed, orphans}`. Idempotent: dieselben Zeilen zweimal angewandt ergeben denselben Zustand und beim zweiten Mal `changed === false`.
- `computeFreeBibs(evt)` — trennt `free`, `pending`, `confirmed`.
- `buildRiderSyncPayload(evt)` — erzeugt den `?a=sync`-Body. `async`, weil sie hasht.

### 1.5 `build.js`

`'rider-sync.js'` in `CORE_FILES` aufnehmen, direkt vor `'ui-headquarter.js'`.

### 1.6 Tests

Neue Checks in `test-suite.js` gemäß Spec §10.1. Der Idempotenz-Test ist der wichtigste: dieselbe Zeilenmenge zweimal durch `mergeRiderLogRows()` schicken und sowohl auf identischen Zustand als auch auf `changed === false` beim zweiten Durchlauf prüfen.

### 1.7 Abschluss

```bash
node build.js && shasum dist/alleycat-dispatch-local.html > .local-baseline
```

Testsuite im lokalen Build grün. **Ab hier ist die Baseline eingefroren** — sie deckt die Änderungen aus Paket 0 und Paket 1 gemeinsam ab.

---

## Paket 2 — Datenbankschema

**Ziel:** `install.php` und `migrate.php` legen die fünf neuen Tabellen an, auf frischer wie auf befüllter Datenbank.

### 2.1 `php-backend/migrations.php`

Migration `2` in `migrationsList()` ([migrations.php:22](../../../php-backend/migrations.php)) ergänzen, mit dem SQL aus Spec §4.2. Charset kommt aus der bestehenden `utf8mb4`-Feature-Detection, nicht hartkodiert. Tabellennamen leiten sich per Suffix vom übergebenen `$table` ab.

### 2.2 Prüfung

Gegen lokale MariaDB, beide Richtungen:

- frische Datenbank → `install.php` legt Schema-Version 2 an
- Datenbank auf Version 1 mit echten Event-Daten → `migrate.php` ergänzt die Tabellen, die Key-Value-Tabelle bleibt unangetastet
- `migrate.php` ein zweites Mal → meldet „bereits aktuell", keine Fehler

Ergebnis in [`php-backend/COMPATIBILITY.md`](../../../php-backend/COMPATIBILITY.md) eintragen.

---

## Paket 3 — `rider.php`

**Ziel:** Alle sieben Aktionen aus Spec §6.1 laufen per `curl`, inklusive Rate-Limit und aller Fehlerfälle.

### 3.1 `php-backend/bootstrap.php`

Drei neue Helfer, damit `rider.php` schlank bleibt:

- `riderResolveSlot(PDO $pdo, $publicId, $token)` — hasht, sucht, gibt Slot oder `null`.
- `riderCheckRateLimit(PDO $pdo, $ip)` — wirft `429`, wenn gesperrt.
- `riderRecordFailure(PDO $pdo, $ip)` / `riderClearFailures(PDO $pdo, $ip)`.

Gezählt werden ausschließlich **fehlgeschlagene** Authentifizierungen. Ein Fahrer mit vielen erfolgreichen Scans darf sich nicht selbst aussperren.

### 3.2 `php-backend/rider.php`

Reihenfolge der Umsetzung, jede Aktion einzeln per `curl` geprüft, bevor die nächste beginnt:

1. Grundgerüst: `apiLoadConfig`, `apiSendCorsHeaders`, `OPTIONS`-Vorabantwort, Aktions-Dispatch, JSON-Header.
2. `?a=sync` (Admin-Key) — Transaktion, Upserts, Löschregeln. Besonders zu beachten: ein `pending`-Slot in der Datenbank darf **nicht** auf `free` zurückgesetzt werden (Spec §6.2).
3. `?a=log` (Admin-Key) — Cursor, Limit, `more`-Kennzeichen.
4. `?a=slotstatus` (Admin-Key).
5. `?a=me` und `?a=freebibs` (Fahrer) — beide ohne einen einzigen Fahrernamen in der Antwort.
6. `?a=checkin` (Fahrer) — die sechs Prüfungen in der Reihenfolge aus Spec §6.3. Beide Duplikatfälle antworten mit `200`, nicht mit `4xx`.
7. `?a=register` (Fahrer) — atomares Belegen über `status='free'` in der `WHERE`-Klausel.

### 3.3 Prüfung

Skript nach dem Muster aus Paket 3 der alten Roadmap, alle Punkte aus Spec §10.2. Die beiden Nebenläufigkeitstests sind die aussagekräftigsten:

- zwei gleichzeitige `?a=register` auf dieselbe Startnummer → genau ein `200`, ein `409 slot_taken`
- Log-Cursor über 600 Zeilen in Seiten → keine Zeile doppelt, keine fehlend

Ergebnisse in `COMPATIBILITY.md`.

---

## Paket 4 — Seams und Publish

**Ziel:** Die Organizer-App veröffentlicht ihre Konfiguration. Noch kein Merge, noch keine neue Oberfläche.

### 4.1 `src/storage/storage-local.js`

Drei Funktionen, die `null` zurückgeben: `publishRiderConfig`, `pollRiderLog`, `confirmRiderSlot`. Gleiche Stelle und gleiches Muster wie `exportBackupBlob()` ([storage-local.js:125](../../../src/storage/storage-local.js:125)).

### 4.2 `src/storage/storage-server.js`

Dieselben drei Funktionen gegen `rider.php`. Alle drei liefern zusätzlich `null`, wenn `hasSharedStorage` gilt **oder** keine Rider-App-URL konfiguriert ist — eine bestehende Installation bleibt damit ohne Zutun unverändert lauffähig.

`renderPhpSetup()` ([storage-server.js:65](../../../src/storage/storage-server.js:65)) bekommt ein drittes, optionales Feld für die Rider-App-URL; `savePhpConfig()` und `submitPhpSetup()` entsprechend erweitern.

### 4.3 Publish auslösen

- Eigener 3-Sekunden-Debounce, ausgelöst aus `saveCurrentEvent()` ([ui-headquarter.js:165](../../../src/core/ui-headquarter.js:165)) nach erfolgreichem `storageSet`.
- Zusätzlich sofortiger Publish bei jedem Statuswechsel in `race-state.js`.
- Ergebnis in `state.riderPublish = {ok, at, error}`, Anzeige neben dem bestehenden Save-Status, mit Retry-Knopf. Fehler blockieren nichts.

**Nicht** an `debouncedSave()` hängen — das wäre ein Netzwerk-Roundtrip pro Tastendruck.

### 4.4 Prüfung

Server-Variante im Browser gegen lokalen PHP-Server: Event anlegen, Slots erzeugen, Checkpoints setzen. In der Datenbank prüfen, dass Slots und Checkpoints ankommen und ein zweiter Publish ohne Änderung keine Duplikate erzeugt.

```bash
node build.js && shasum -c .local-baseline
```

Muss ab hier unverändert durchlaufen.

---

## Paket 5 — Merge-Polling und Organizer-Oberfläche

**Ziel:** Check-ins erscheinen in der App, Anmeldungen lassen sich bestätigen.

### 5.1 `src/core/rider-sync.js` erweitern

`startRiderPolling()` / `stopRiderPolling()`, Intervall 5 s, aktiv bei Status `ready` und `running`. `null` von `pollRiderLog` beendet die Schleife sofort und dauerhaft — so kostet die lokale Variante keinen einzigen Timer.

**Die kritische Stelle:** `render()` darf nur laufen, wenn `mergeRiderLogRows()` tatsächlich etwas geändert hat. Ein bedingungsloses Neurendern alle fünf Sekunden zerstört laufende Texteingaben — dieselbe Fehlerklasse wie der kürzlich behobene Fokusverlust im Suchfeld (Commit `9641fbf`). Dafür ein eigener Test.

Bei `more === true` sofort erneut abfragen, statt das nächste Intervall abzuwarten.

### 5.2 Fahrerliste

Neue Sidebar-Sektion „Ausstehende Anmeldungen" in `ridersNavGroups()` ([rider.js:61](../../../src/core/rider.js:61)). Sichtbar nur, wenn `publishRiderConfig` nicht `null` liefert **und** mindestens ein Slot `pending` ist.

Bestätigen und Ablehnen laufen beide über `logUndoableAction()` ([action-log.js](../../../src/core/action-log.js)), damit ein Fehlklick rückholbar ist.

Bestehende CSS-Klassen (`.settings-layout`, `.settings-sidebar`, `.settings-content`, `.settings-nav-*`) unverändert wiederverwenden, kein neues Layout-CSS. Neue Tests, die diese Klassen abfragen, müssen auf `#view-riders` eingegrenzt werden — die Klassen sind seit den Sidebar-Umbauten von drei Seiten geteilt.

### 5.3 Checkpoint-Editor

Häkchen „QR Check-In" unter der Typ-Auswahl ([checkpoint.js:570](../../../src/core/checkpoint.js:570)), nur wenn der Seam nicht `null` liefert. Hilfetext muss ausdrücklich sagen, dass bewertete Checkpoints ihre Punktzahl weiterhin über das Papiermanifest bekommen.

### 5.4 Verwaiste Check-ins

Hinweisleiste im Leaderboard, wenn `evt.orphanCheckins` nicht leer ist, mit Startnummer und Checkpoint-Kennung pro Eintrag. Diese Zeilen werden nie stillschweigend verworfen (Spec §8.2).

### 5.5 i18n

Neuer Namespace `riderApp` in `src/core/i18n.js`, deutsch. `src/i18n/en.json` **nicht** anfassen — der Nutzer synchronisiert Englisch separat auf ausdrückliche Anfrage.

### 5.6 Prüfung

```bash
node build.js && shasum -c .local-baseline
```

Testsuite grün. In der lokalen Variante darf keine der neuen Oberflächen sichtbar sein — das ist ein eigener, manuell zu prüfender Punkt, kein Testsuite-Check.

---

## Paket 6 — Abnahme

**Ziel:** Alle neun Abnahmekriterien aus Spec §12 nachweislich erfüllt.

### 6.1 Ende-zu-Ende ohne Fahrer-Oberfläche

Ablauf aus Spec §10.3: Event mit 10 Slots und 3 QR-Checkpoints anlegen, Status auf `running`, Token aus der Browser-Konsole auslesen, drei Check-ins per `curl`, prüfen dass sie binnen 5 s im Leaderboard stehen. Danach eine Registrierung auf eine Wildcard, bestätigen, Name in der Fahrerliste prüfen.

### 6.2 Sicherheitsdurchsicht

- `rider.php` mit falschem Token, falschem Checkpoint-Token, fremdem `publicId`, ohne Rennstatus `running`.
- Rate-Limit: 15 Fehlversuche, `429` ab dem elften.
- Alle Fahrer-Antworten auf Namen und Notfallkontakte durchsuchen — es darf keiner vorkommen.

### 6.3 Dokumentation

- `CLAUDE.md`: `rider-sync.js` in die Modultabelle, die vier neuen Seams (`supportsLocalBackup`, `publishRiderConfig`, `pollRiderLog`, `confirmRiderSlot`) in den Abschnitt „Storage-capability seams", der Build-Guard als eigener Punkt unter „Architecture". Kein langer Warum-Text — der gehört nach `docs/implementation-notes.md`.
- `docs/implementation-notes.md`: Begründung für die Log-Tabelle statt Blob-Schreiben, für den idempotenten Merge, und für den Build-Guard statt einer Repo-Trennung (mit den Zeilenzahlen, die die Entscheidung tragen).
- `php-backend/COMPATIBILITY.md`: Ergebnisse aus den Paketen 2 und 3.
- `docs/alleycat-dispatch-roadmap-14-23.md`: Rider-App-Initiative als neuer Abschnitt mit den drei Teilprojekten.

### 6.4 Zusammenführen

`feature/rider-fundament` nach `main`, wenn Hash-Check und Testsuite grün sind und alle neun Kriterien abgehakt.

---

## Was dieser Plan bewusst offen lässt

- **Der reale Testlauf auf `hasencore.de`** bleibt offen, wie schon bei der Backend-Härtung. Alles hier wird gegen lokales PHP und MariaDB geprüft; ob echtes Shared Hosting sich gleich verhält, kann nur der Nutzer feststellen.
- **Die Spokecard bleibt unverändert.** Token werden erzeugt, aber weder gedruckt noch im QR verwendet — das passiert in Teilprojekt 2, damit gedruckte Karten nicht zwischen zwei Releases ungültig werden.
- **Lastverhalten bei vielen Fahrern** wird nicht gemessen. Die Nebenläufigkeitstests prüfen Korrektheit, nicht Durchsatz. Ein Lasttest ist erst sinnvoll, wenn echte Handys statt `curl` die Last erzeugen.

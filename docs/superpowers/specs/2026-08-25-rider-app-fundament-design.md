# Rider App — Teilprojekt 1: Fundament (Design)

Stand: 25.08.2026. Erstes von drei Teilprojekten der Rider-App-Initiative. Liefert das komplette Backend und die Organizer-Verkabelung für Fahrer-Self-Check-in — **ohne** Fahrer-UI. Nach Abschluss ist der gesamte Datenfluss per `curl` und über die Organizer-App testbar; Teilprojekt 2 setzt nur noch die Oberfläche darauf.

Siehe [CLAUDE.md](../../../CLAUDE.md) für Projektkontext, Modul-Layout und die Storage-Capability-Seams.

## 1. Ziel

Die Server-Variante bekommt einen zweiten, öffentlich erreichbaren Schreibpfad neben dem bestehenden Admin-Key-geschützten Key-Value-Store: Fahrer sollen sich mit einem Token von ihrer Spokecard identifizieren und an Checkpoints mit festem QR-Code selbst einchecken können, ohne dass ein Marshal etwas eintippt. Check-ins fließen als append-only Log-Zeilen in eigene relationale Tabellen und werden vom Organizer periodisch in das bestehende Event-Blob zurückgemerged.

Nach Teilprojekt 1 gilt:

- Jeder Startnummern-Slot und jeder Checkpoint besitzt ein Token.
- Der Organizer veröffentlicht eine abgespeckte, fahrer-taugliche Kopie der Event-Konfiguration in eigene Tabellen (Publish).
- `rider.php` nimmt Check-ins und Registrierungen entgegen, gegen Token statt gegen Admin-Key authentifiziert.
- Der Organizer pollt das Log und merged Check-ins idempotent in `evt.riders`.
- Ausstehende Anmeldungen erscheinen in der Fahrerliste zur Bestätigung.

## 2. Nicht-Ziele

- **Keine Fahrer-Oberfläche.** Kein `dist/alleycat-rider.html`, kein Login-Bildschirm, keine Offline-Queue im Client. Das ist Teilprojekt 2.
- **Kein Beamer-Ping und keine öffentliche Vorab-Registrierungsseite.** Das ist Teilprojekt 3. Die dafür nötige Log-Abfrage (`?a=log`) entsteht aber schon hier, weil der Organizer-Merge sie ohnehin braucht.
- **Keine Änderung am Spokecard-QR-Inhalt und kein Checkpoint-QR-PDF.** Beides gehört zu Teilprojekt 2, weil es ohne Fahrer-App keinen Nutzen hat und die gedruckten Karten sonst zwischen zwei Releases ungültig wären. Die *Token-Erzeugung* passiert hier, das *Drucken* dort.
- **Keine neue Funktion für die lokale Variante.** Sie bleibt funktional eingefroren (siehe §11).
- **Keine Ablösung des Event-Blobs.** Die Event-Konfiguration bleibt ein JSON-Blob im Key-Value-Store. Relational werden nur die fahrer-bezogenen Daten.
- **Kein Liga-/Saison-Modell.** Wiederkehrende Fahrerprofile über mehrere Events hinweg sind ein späterer Roadmap-Punkt; das Datenmodell hier verbaut ihn nicht, implementiert ihn aber auch nicht.

## 3. Begriffe

| Begriff | Bedeutung |
|---|---|
| **Slot** | Ein Eintrag in `evt.riders[]`, identifiziert durch `bib` (Startnummer). Existiert ab `generateRiderSlots()`, auch ohne Namen. |
| **Wildcard** | Slot ohne Namen — gedruckte Karte, noch keinem Fahrer zugeordnet. |
| **Publish** | Der Vorgang, bei dem der Organizer die abgespeckte Konfiguration in die Rider-Tabellen schreibt. |
| **Log** | `alleycat_rider_log`, append-only Tabelle aller Fahreraktionen, monoton steigende `id` als Cursor. |
| **Merge** | Der Vorgang, bei dem der Organizer Log-Zeilen in `evt.riders[]` zurückschreibt. |

## 4. Datenmodell

### 4.1 Erweiterungen am Event-Blob

Neu auf Event-Ebene:

```js
evt.publicId       // String, 12 Zeichen [a-z0-9], einmalig erzeugt, danach unveränderlich
evt.riderApp = {
  progress: true,        // Fahrer sieht eigene Fortschrittsliste
  map: false,            // Checkpoint-Karte (Teilprojekt-3-Kandidat, hier nur Feld)
  leaderboard: false,    // Live-Rangliste (dito)
  selfRegister: false    // öffentliche Vorab-Registrierung (dito)
}
evt.riderLastLogId // Number, Cursor des Organizer-Merges, Default 0
evt.orphanCheckins // Array, siehe §8.2, Default []
```

Neu pro Slot in `withRiderDefaults()` ([rider.js:2](../../../src/core/rider.js:2)):

```js
riderToken: ''     // 32 Zeichen [a-z0-9], bei Slot-Anlage erzeugt
riderCode:  ''     // 8 Zeichen [A-Z0-9] ohne O/0/I/1, Klartext-Rückfallweg
riderStatus: ''    // '' | 'pending' | 'confirmed'
pendingData: null  // Rohdaten der Selbstanmeldung, bis der Orga bestätigt
gpsFlags: {}       // cpId → Distanz in Metern, nur bei auffälligem Abstand gesetzt
```

**Statusabbildung zwischen Blob und Datenbank.** Das Blob nutzt `''` für „noch niemandem zugeordnet", die Datenbankspalte `'free'` — die Spalte ist `NOT NULL` und braucht einen benennbaren Default. Die Abbildung ist genau diese eine Sonderregel, sonst sind die Werte identisch:

| `rider.riderStatus` (Blob) | `_rider_slot.status` (DB) | Bedeutung |
|---|---|---|
| `''` | `free` | Wildcard, gedruckte Karte ohne Fahrer |
| `pending` | `pending` | Formular abgeschickt, Orga prüft |
| `confirmed` | `confirmed` | Fahrer startberechtigt |

Beide Richtungen laufen ausschließlich durch zwei Hilfsfunktionen in `rider-sync.js` (`slotStatusToDb()` / `slotStatusFromDb()`), damit die Sonderregel nicht an mehreren Stellen einzeln nachgebaut wird.

Neu pro Checkpoint:

```js
qrCheckinEnabled: false  // Häkchen „QR Check-In"
qrToken: ''              // 32 Zeichen [a-z0-9], bei Checkpoint-Anlage erzeugt
```

**Migration bestehender Events:** kein eigener Migrationscode. `withRiderDefaults()` füllt Slot-Felder beim Laden auf; `publishRiderConfig()` erzeugt fehlende `publicId`/`qrToken` beim ersten Aufruf und löst dann ein `saveCurrentEvent()` aus. Gleiches Muster wie bei `onboardingCompleted` im Onboarding-Design.

**Invariante:** `riderToken` und `qrToken` werden **nie** neu erzeugt, wenn bereits gesetzt. `generateRiderSlots()` behält heute schon bestehende Slots (`existing.find(r => r.bib === i)`, [rider.js:33](../../../src/core/rider.js:33)) — diese Zeile ist der Grund, warum gedruckte Karten ein Regenerieren überleben, und darf nicht angetastet werden.

### 4.2 Neue Tabellen

Fünf Tabellen, angelegt als Migration `2` in `migrationsList()` ([migrations.php:22](../../../php-backend/migrations.php)). Die Namen leiten sich vom bestehenden `ALLEYCAT_TABLE` aus `config.php` ab, per Suffix: `ALLEYCAT_TABLE . '_rider_event'` und so weiter. Im folgenden SQL steht `{p}` für den Wert von `ALLEYCAT_TABLE`. `migrationsList()` bekommt den Wert bereits als `$table` übergeben, es ist also kein neuer Konfigurationseintrag nötig.

```sql
CREATE TABLE IF NOT EXISTS `{p}_rider_event` (
  `public_id`  VARCHAR(16) NOT NULL PRIMARY KEY,
  `storage_key` VARCHAR(191) NOT NULL,
  `name`       VARCHAR(191) NOT NULL DEFAULT '',
  `status`     VARCHAR(16) NOT NULL DEFAULT 'planning',
  `settings`   TEXT NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `{p}_rider_slot` (
  `public_id`  VARCHAR(16) NOT NULL,
  `bib`        INT UNSIGNED NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `code_hash`  CHAR(64) NOT NULL,
  `status`     VARCHAR(16) NOT NULL DEFAULT 'free',
  PRIMARY KEY (`public_id`, `bib`),
  UNIQUE KEY `uq_token` (`token_hash`),
  UNIQUE KEY `uq_code`  (`public_id`, `code_hash`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `{p}_rider_checkpoint` (
  `public_id`      VARCHAR(16) NOT NULL,
  `cp_id`          VARCHAR(64) NOT NULL,
  `label`          VARCHAR(191) NOT NULL DEFAULT '',
  `qr_token_hash`  CHAR(64) NOT NULL,
  `qr_enabled`     TINYINT(1) NOT NULL DEFAULT 0,
  `sort_index`     INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`public_id`, `cp_id`),
  KEY `idx_qr` (`qr_token_hash`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `{p}_rider_log` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `public_id`   VARCHAR(16) NOT NULL,
  `type`        VARCHAR(16) NOT NULL,
  `bib`         INT UNSIGNED NOT NULL,
  `cp_id`       VARCHAR(64) NULL,
  `client_uuid` CHAR(36) NOT NULL,
  `payload`     TEXT NULL,
  `gps_lat`     DOUBLE NULL,
  `gps_lon`     DOUBLE NULL,
  `gps_distance_m` INT NULL,
  `created_at`  DATETIME NOT NULL,
  UNIQUE KEY `uq_client` (`client_uuid`),
  UNIQUE KEY `uq_scan` (`public_id`, `bib`, `cp_id`),
  KEY `idx_feed` (`public_id`, `id`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `{p}_rider_ratelimit` (
  `ip_hash`      CHAR(64) NOT NULL PRIMARY KEY,
  `window_start` DATETIME NOT NULL,
  `fail_count`   INT UNSIGNED NOT NULL DEFAULT 0,
  `block_until`  DATETIME NULL
) ENGINE=InnoDB;
```

Details zur Verwendung der fünften Tabelle in §9.

Charset kommt wie in Migration `1` aus der `utf8mb4`-Feature-Detection, nicht hartkodiert.

**Warum `uq_scan` mit nullbarer Spalte funktioniert:** MySQL behandelt `NULL` in einem UNIQUE-Index als jeweils verschieden. Registrierungszeilen tragen `cp_id = NULL` und kollidieren deshalb nie miteinander, während Check-in-Zeilen (mit gesetztem `cp_id`) pro Fahrer und Checkpoint genau einmal existieren können. Das ersetzt eine Doppelscan-Prüfung im Anwendungscode durch eine Datenbank-Garantie.

**Warum SHA-256 statt `password_hash`:** Tokens werden per Lookup gefunden, nicht per Vergleich gegen einen bekannten Datensatz — ein Salt pro Zeile machte den Index unbrauchbar. `password_hash` ist hier also technisch nicht einsetzbar. Der Grund für seinen Einsatz beim API-Key (langsames Hashing gegen Brute-Force auf ein möglicherweise schwaches Geheimnis) entfällt bei 32 Zeichen aus einem kryptografischen Zufallsgenerator. Der schwächere `riderCode` wird nicht durch Hashing, sondern durch Rate-Limiting geschützt (§9).

### 4.3 QR-Nutzlast

Zwei Formate, beide als URL, damit ein Scan mit der System-Kamera direkt in der App landet:

```
Spokecard:   <riderAppUrl>#r.<publicId>.<riderToken>
Checkpoint:  <riderAppUrl>#c.<publicId>.<cpId>.<qrToken>
```

`riderAppUrl` ist ein neues Feld in der PHP-Verbindungskonfiguration (`alleycat:php-config` im `localStorage`), abgefragt im Setup-Bildschirm neben Endpunkt und API-Key. Grund für ein eigenes Feld statt Ableitung aus `apiUrl`: die Rider-App muss nicht zwingend im selben Verzeichnis wie `api.php` liegen.

In Teilprojekt 1 werden diese Nutzlasten nur **erzeugt und geparst**, noch nicht gedruckt.

## 5. Neue Seams

Zwei neue Storage-Capability-Seams, gleiches Muster wie `exportBackupBlob()` ([storage-local.js:125](../../../src/storage/storage-local.js:125), [storage-server.js:106](../../../src/storage/storage-server.js:106)):

| Seam | lokal | server |
|---|---|---|
| `publishRiderConfig(evt)` | `return null` | `POST rider.php?a=sync` |
| `pollRiderLog(publicId, sinceId)` | `return null` | `GET rider.php?a=log&since=<n>` |
| `confirmRiderSlot(publicId, bib, status)` | `return null` | `POST rider.php?a=slotstatus` |

Wie bei `exportBackupBlob()` liefern beide auch in der Server-Variante `null`, wenn `hasSharedStorage` gilt (Artifact-Speicher) — dort gibt es kein PHP-Backend. `null` ist das einzige Signal, das `src/core/*` auswertet; kein Modul dort fragt jemals `hasSharedStorage` oder `typeof sqlDb` ab.

## 6. `php-backend/rider.php`

Neue Datei neben `api.php`, nutzt dieselben Helfer aus `bootstrap.php` (`apiLoadConfig`, `apiSendCorsHeaders`, `apiConnectDb`, `apiSendJsonError`, [bootstrap.php:22](../../../php-backend/bootstrap.php)). `apiVerifyKey()` wird **nur** auf den Admin-Aktionen aufgerufen.

### 6.1 Aktionen

| Aktion | Methode | Auth | Zweck |
|---|---|---|---|
| `?a=sync` | POST | Admin-Key | Publish der abgespeckten Konfiguration |
| `?a=log&since=<n>` | GET | Admin-Key | Log-Zeilen nach Cursor, aufsteigend, max. 500 |
| `?a=slotstatus` | POST | Admin-Key | Slot bestätigen oder zurücksetzen |
| `?a=me` | GET | `riderToken` oder `riderCode` | Event-Basisdaten, Checkpoint-Liste, eigener Fortschritt |
| `?a=freebibs` | GET | `publicId` allein | Liste freier Startnummern, **keine Namen** |
| `?a=checkin` | POST | `riderToken` + `qrToken` | Check-in eintragen |
| `?a=register` | POST | `riderToken` | Wildcard-Slot mit Formulardaten belegen |

`?a=me` und `?a=freebibs` haben in Teilprojekt 1 noch keinen Aufrufer — sie werden für Teilprojekt 2 gebraucht. Sie entstehen trotzdem hier, weil sie dieselbe Token-Auflösung und dieselben Rate-Limit-Pfade nutzen wie `?a=checkin`: getrennt gebaut würde diese Logik zweimal entstehen, und der Ende-zu-Ende-Test aus §10.3 braucht `?a=me` ohnehin, um einen Check-in ohne Fahrer-Oberfläche verifizieren zu können.

### 6.2 `?a=sync`

Body: JSON mit `publicId`, `storageKey`, `name`, `status`, `settings` (das `evt.riderApp`-Objekt), `slots[]` (`bib`, `tokenHash`, `codeHash`, `status`), `checkpoints[]` (`cpId`, `label`, `qrTokenHash`, `qrEnabled`, `sortIndex`).

Der Organizer hasht die Token **clientseitig** vor dem Senden — Klartext-Token verlassen die Organizer-App nie, auch nicht über die eigene, authentifizierte Verbindung. `crypto.subtle.digest('SHA-256', ...)` ist in allen Zielbrowsern verfügbar und wird ohnehin nur bei Publish aufgerufen, nicht in einer Schleife pro Frame.

Ablauf, in einer Transaktion:

1. `BEGIN`
2. Upsert `_rider_event`
3. Upsert aller `slots[]`; Slots, deren `bib` nicht mehr in der Liste steht, werden gelöscht — **außer** sie haben Log-Zeilen. Solche Slots bleiben stehen und erscheinen als verwaist (§8.2).
4. Upsert aller `checkpoints[]`; nicht mehr gelistete werden gelöscht, ihre Log-Zeilen bleiben.
5. `COMMIT`

Antwort: `{ok:true, slots:<n>, checkpoints:<n>}`.

**Publish überschreibt `status` nicht mit `free`, wenn in der Datenbank bereits `pending` steht.** Andernfalls würde ein Publish, das kurz nach einer Selbstanmeldung läuft, diese Anmeldung stillschweigend verwerfen. Der Organizer erfährt von `pending` erst über den nächsten `?a=log`-Poll; bis dahin ist die Datenbank die Wahrheit für diese Spalte.

### 6.3 `?a=checkin`

Body: `publicId`, `riderToken`, `cpId`, `qrToken`, `clientUuid`, optional `lat`/`lon`, `scannedAt` (ISO-Zeitstempel vom Gerät).

Prüfungen in dieser Reihenfolge:

1. `riderToken` gehasht → Slot suchen. Kein Treffer → `403 invalid_rider`.
2. Slot-Status muss `confirmed` sein → sonst `403 slot_not_confirmed`.
3. `qrToken` gehasht → Checkpoint suchen, muss zu derselben `public_id` gehören → sonst `403 invalid_checkpoint`.
4. `qr_enabled` muss gesetzt sein → sonst `403 qr_checkin_disabled`.
5. Event-`status` muss `running` sein → sonst `409 race_not_running`, Antwort enthält den aktuellen Status.
6. INSERT in `_rider_log`.

Bei Verletzung von `uq_client`: `200 {ok:true, duplicate:true}` — das ist ein Retry der Offline-Queue, kein Fehler.
Bei Verletzung von `uq_scan`: `200 {ok:true, already:"<created_at>"}` — der Checkpoint wurde schon gescannt.

Beide Fälle liefern bewusst `200`, damit die Client-Queue den Eintrag als erledigt streichen kann. Ein `4xx` würde zu endlosen Retrys führen.

`gps_distance_m` wird berechnet, wenn `lat`/`lon` mitkommen **und** der Checkpoint Koordinaten hat. Der Wert wird gespeichert und **nie zur Ablehnung verwendet** — er ist ausschließlich Auswertungsmaterial für den Organizer.

`created_at` kommt aus `scannedAt`, wenn plausibel (nicht in der Zukunft, nicht älter als 24 h), sonst aus der Serverzeit. Grund: ein Check-in aus der Offline-Queue kann Stunden nach dem eigentlichen Scan hochgeladen werden; für die Wertung zählt der Scan-Zeitpunkt.

### 6.4 `?a=register`

Body: `publicId`, `riderToken`, `name`, optional `contact`, `emergencyContact`, `categories`, `clientUuid`.

1. Slot über Token suchen; Status muss `free` sein → sonst `409 slot_taken`.
2. `UPDATE _rider_slot SET status='pending' WHERE public_id=? AND bib=? AND status='free'` — die `status='free'`-Bedingung in der `WHERE`-Klausel macht das Belegen atomar. Betroffene Zeilen `0` → `409 slot_taken`.
3. INSERT in `_rider_log` mit `type='register'`, `cp_id=NULL`, Formulardaten in `payload`.

### 6.5 `?a=log`

`GET ?a=log&public_id=<id>&since=<n>&limit=<n>`, Admin-Key. Liefert `{rows:[...], lastId:<n>, more:<bool>}`, aufsteigend nach `id`, Standard-Limit 200, Maximum 500. `more` signalisiert dem Organizer, sofort erneut zu pollen statt auf das nächste Intervall zu warten.

## 7. Organizer-Integration

### 7.1 Publish auslösen

`publishRiderConfig()` wird **nicht** bei jedem `debouncedSave()` gerufen — das wäre ein Netzwerk-Roundtrip pro Tastendruck. Stattdessen: eigener Debounce von 3 Sekunden, ausgelöst aus `saveCurrentEvent()` ([ui-headquarter.js:165](../../../src/core/ui-headquarter.js:165)) nach erfolgreichem `storageSet`, und zusätzlich einmalig sofort bei jedem Statuswechsel über `race-state.js`.

Ergebnis wird in `state.riderPublish = {ok, at, error}` gehalten und im bestehenden Save-Status-Bereich als eigene Anzeige geführt. Fehler blockieren nichts.

### 7.2 Merge

Neues Modul `src/core/rider-sync.js`, eingehängt in `CORE_FILES` vor `ui-headquarter.js`.

`startRiderPolling()` läuft, solange `state.currentEvent.status` `ready` oder `running` ist, Intervall 5 s. Pro Durchlauf `pollRiderLog(publicId, evt.riderLastLogId)`; `null` (lokale Variante) beendet die Schleife sofort und dauerhaft.

Merge pro Zeile:

| `type` | Wirkung |
|---|---|
| `checkin` | wenn `cpId` nicht in `rider.completed`: anhängen; `rider.checkpointTimes[cpId] = created_at`. Wenn `gps_distance_m` über Schwelle: `rider.gpsFlags[cpId] = distance`. |
| `register` | `rider.riderStatus = 'pending'`, `rider.pendingData = payload` |

Danach `evt.riderLastLogId = lastId`, dann `debouncedSave()` und `render()`, aber **nur wenn sich tatsächlich etwas geändert hat** — sonst rendert die App alle 5 Sekunden grundlos neu und zerstört laufende Texteingaben (dieselbe Klasse von Bug wie der kürzlich behobene Fokusverlust im Suchfeld, Commit `9641fbf`).

**Idempotenz ist die zentrale Eigenschaft dieses Merges.** Jede Zeile ist mehrfach anwendbar, ohne das Ergebnis zu verändern. Daraus folgt: zwei parallel laufende Organizer-Geräte lesen dieselbe Log-Quelle und konvergieren auf denselben Stand, statt sich gegenseitig zu überschreiben. Das dokumentierte „letzter Schreiber gewinnt"-Problem des Event-Blobs (CLAUDE.md, *Known issues*) bleibt formal bestehen, trifft die Check-in-Daten aber nicht mehr.

### 7.3 Fahrerliste

Neue Sidebar-Sektion **„Ausstehende Anmeldungen"** in `ridersNavGroups()` ([rider.js:61](../../../src/core/rider.js:61)). Sichtbar nur, wenn `publishRiderConfig` nicht `null` liefert und mindestens ein Slot `riderStatus === 'pending'` hat.

Pro Eintrag: Startnummer, Formulardaten, zwei Aktionen.

- **Bestätigen** → `rider.name` etc. aus `pendingData` übernehmen, `riderStatus = 'confirmed'`, `pendingData = null`, `confirmRiderSlot(publicId, bib, 'confirmed')`, Publish.
- **Ablehnen** → Slot-Felder leeren, `riderStatus = ''`, `confirmRiderSlot(publicId, bib, 'free')`, Publish.

Beide Aktionen laufen über `logUndoableAction()` ([action-log.js](../../../src/core/action-log.js)), damit ein Fehlklick rückholbar ist.

### 7.4 Checkpoint-Editor

Häkchen **„QR Check-In"** (`t('checkpoint.qrCheckin')`) in der Checkpoint-Bearbeitung, direkt unter der Typ-Auswahl ([checkpoint.js:570](../../../src/core/checkpoint.js:570)). Nur gerendert, wenn `publishRiderConfig` nicht `null` liefert.

Default `false` für alle Typen. Bewertete Typen (`isScored`) können es ebenfalls bekommen — der Fahrer checkt dann seine Anwesenheit selbst ein, die Punktzahl trägt weiterhin der Marshal auf dem Papiermanifest ein. Diese Trennung ist Absicht und muss im Hilfetext des Häkchens stehen.

**Das Papiermanifest ändert sich nicht.** Punch-Boxen bleiben für alle Checkpoints erhalten, auch für solche mit aktivem QR-Check-In, als Rückfallweg bei leerem Handy-Akku.

### 7.5 Setup-Bildschirm

`renderPhpSetup()` ([storage-server.js:65](../../../src/storage/storage-server.js:65)) bekommt ein drittes Feld: **Rider-App-URL**, optional. Leer = Rider-Funktionen bleiben aus, `publishRiderConfig()` liefert dann `null`. Damit ist eine bestehende Server-Installation ohne Zutun unverändert lauffähig.

## 8. Fehlerfälle

### 8.1 Netzwerk

Publish fehlgeschlagen → Anzeige plus Retry-Knopf, kein Blockieren. Poll fehlgeschlagen → still weiterlaufen; ab drei Fehlern in Folge ein Warnbanner, das bei Erfolg verschwindet.

### 8.2 Verwaiste Log-Zeilen

Zeigt eine Log-Zeile auf eine `bib` oder `cp_id`, die im aktuellen Event nicht mehr existiert (Checkpoint nach dem Kartendruck gelöscht, Startnummernzahl verkleinert), landet sie in `evt.orphanCheckins[]` und erscheint als Hinweisleiste im Leaderboard.

Diese Zeilen werden **nie stillschweigend verworfen**. Ein Fahrer, der nachweislich an einem Punkt war, darf nicht durch einen Konfigurationsfehler des Organizers aus der Wertung fallen — das ist die eine Stelle, an der ein sichtbarer Hinweis wichtiger ist als eine aufgeräumte Oberfläche.

### 8.3 Datenbank

Migration `2` ist idempotent (`CREATE TABLE IF NOT EXISTS`), gleiches Muster wie Migration `1`. Publish läuft in einer Transaktion; Abbruch bedeutet Rollback auf den vorherigen, gültigen Stand.

Token-Kollision auf `uq_token` ist bei 32 Zeichen praktisch ausgeschlossen, wird aber abgefangen: Publish meldet den betroffenen `bib` zurück, der Organizer erzeugt für diesen Slot ein neues Token und veröffentlicht erneut.

## 9. Sicherheit

**Der Admin-API-Key verlässt die Organizer-App nicht.** Fahrer-Aktionen authentifizieren ausschließlich über die Token in der Anfrage. `rider.php` liefert unter keiner Fahrer-Aktion Namen, Notfallkontakte, Rätsellösungen oder Personalplanung aus — `?a=freebibs` gibt nur Nummern und deren Belegtzustand zurück.

**Rate-Limiting ist Pflicht, nicht optional.** `rider.php` ist ohne Admin-Key erreichbar. Der 8-Zeichen-`riderCode` ist das schwächste Geheimnis im System (36⁸ ≈ 2,8 · 10¹²) und muss durch Bremsen geschützt werden, nicht durch Länge allein:

- Zähltabelle `{p}_rider_ratelimit` (`ip_hash`, `window_start`, `fail_count`), Fenster von einer Minute.
- Ab 10 Fehlversuchen pro IP und Minute: `429`, Fenster verdoppelt sich bei weiteren Fehlversuchen.
- Erfolgreiche Anfragen setzen den Zähler zurück.
- Gezählt werden nur *fehlgeschlagene* Authentifizierungen, damit ein Fahrer mit vielen legitimen Scans nicht ausgesperrt wird.

**GPS-Daten sind Standortdaten von Personen.** Sie werden nur gespeichert, wenn der Fahrer die Berechtigung erteilt, dienen ausschließlich der Plausibilitätsprüfung, und werden beim Löschen des Events mitgelöscht (`?a=sync` mit leerer Slot-Liste bzw. eine Löschaktion beim Entfernen des Events). Kein Standortverlauf, nur der Punkt zum Scan-Zeitpunkt.

**CORS** übernimmt die bestehende `apiSendCorsHeaders()`-Logik unverändert.

## 10. Testplan

### 10.1 `test-suite.js`, lokaler Build, ohne Server

Reine Funktionen, kein Netz:

- `generateRiderToken()` / `generateRiderCode()`: Länge, Zeichenvorrat, keine Verwechslungszeichen (`O`, `0`, `I`, `1`), Kollisionsfreiheit über 10 000 Aufrufe.
- `parseRiderQrPayload()`: beide Formate, fremdes Event, Müll-Eingabe, alte nackte Startnummer.
- `mergeRiderLogRows()`: Idempotenz (dieselben Zeilen zweimal anwenden ergibt denselben Zustand), unbekannte `cpId` landet in `orphanCheckins`, `changed`-Rückgabewert ist `false` bei einem Durchlauf ohne Wirkung.
- `computeFreeBibs()`: freie, `pending` und `confirmed` Slots korrekt getrennt.
- `withRiderDefaults()`: bestehende Token werden nicht überschrieben.

### 10.2 PHP gegen lokale MariaDB

Skript nach dem Muster aus Paket 3, Ergebnis in [`php-backend/COMPATIBILITY.md`](../../../php-backend/COMPATIBILITY.md):

- Migration `2` gegen frische und gegen bereits befüllte Datenbank.
- Zwei gleichzeitige `?a=register` auf dieselbe `bib` → genau einer bekommt `200`, der andere `409 slot_taken`.
- Doppelscan → zweite Antwort `{ok:true, already:...}`, Log hat eine Zeile.
- Queue-Retry mit identischem `clientUuid` → `{ok:true, duplicate:true}`, Log hat eine Zeile.
- Log-Cursor: 600 Zeilen einfügen, in Seiten abrufen, keine Zeile doppelt oder fehlend.
- Rate-Limit: 15 Fehlversuche → `429` ab dem elften.
- `?a=sync` mit `pending`-Slot in der Datenbank überschreibt diesen nicht auf `free`.

### 10.3 Ende-zu-Ende ohne Fahrer-UI

Per `curl` gegen lokalen PHP-Server, Organizer-App im Browser daneben:

1. Event anlegen, 10 Slots, 3 Checkpoints mit QR-Check-In, Status auf `running`.
2. Token aus dem Event-Blob in der Browser-Konsole auslesen.
3. Drei `?a=checkin` per `curl` absetzen.
4. Prüfen, dass die Check-ins binnen 5 s im Leaderboard der Organizer-App stehen.
5. `?a=register` auf eine Wildcard, prüfen dass „Ausstehende Anmeldungen" erscheint, bestätigen, prüfen dass der Name in der Fahrerliste steht.

### 10.4 Gate pro Paket

```bash
node build.js && shasum -c .local-baseline
```

Teilprojekt 1 fasst am geteilten Kern genau zwei Dinge an: `withRiderDefaults()` (neue Felder) und `CORE_FILES` (neues Modul `rider-sync.js`). Beides verändert den lokalen Build zwangsläufig. Der Ablauf ist deshalb:

1. Diese beiden Änderungen als **erstes** Paket bauen, danach Baseline neu setzen:
   ```bash
   node build.js && shasum dist/alleycat-dispatch-local.html > .local-baseline
   ```
2. Für **alle weiteren Pakete** des Teilprojekts muss `shasum -c .local-baseline` unverändert durchlaufen. Ein Ausschlag bedeutet, dass Servercode in den geteilten Kern geleckt ist.

Dazu `test-suite.js` grün im lokalen Build, nach jedem Paket.

## 11. Verhältnis zur lokalen Variante

Ab diesem Teilprojekt wird die lokale Variante **funktional nicht mehr erweitert** (Entscheidung vom 25.08.2026). Sie bleibt gepflegt und lauffähig; alle Rider-Funktionen sind über die Seams aus §5 vollständig ausgeblendet, sodass dort weder tote Schalter noch ungenutzter Code sichtbar werden.

„Nicht mehr erweitert" heißt ausdrücklich **nicht** „darf kaputtgehen": `test-suite.js` im lokalen Build bleibt das verbindliche Regressionsgate für jede Änderung an `src/core/*`.

## 12. Abnahmekriterien

1. `node build.js` erzeugt beide bestehenden Varianten unverändert lauffähig, `test-suite.js` grün.
2. `install.php` auf frischer Datenbank legt alle vier neuen Tabellen an; `migrate.php` auf einer Datenbank mit Schema-Version 1 ergänzt sie ohne Datenverlust.
3. Ein Event in der Server-Variante mit gesetzter Rider-App-URL veröffentlicht Slots und Checkpoints; ein zweiter Publish ohne Änderung erzeugt keine Duplikate.
4. Ein per `curl` abgesetzter Check-in erscheint binnen 5 s in Leaderboard und Fahrerliste des Organizers.
5. Ein zweiter identischer Check-in erzeugt keine zweite Log-Zeile und keine Fehlermeldung beim Fahrer.
6. Eine Selbstanmeldung erscheint als „ausstehend", lässt sich bestätigen und ablehnen, beides rückholbar.
7. `rider.php` gibt unter keiner Fahrer-Aktion einen Fahrernamen aus.
8. Rate-Limit greift nachweislich.
9. In der lokalen Variante ist keine Rider-Funktion sichtbar.

## 13. Danach

Teilprojekt 2 (Rider App): eigenes Bundle `dist/alleycat-rider.html`, Login, Fortschrittsansicht, Checkpoint-Scan, Offline-Queue, Wildcard-Registrierung; dazu Spokecard-QR-Umstellung, Checkpoint-QR-PDF und die Extraktion von `CHECKPOINT_TYPES` in ein eigenes, von beiden Bundles geteiltes Modul.

Teilprojekt 3: Beamer-Ping auf der Kartenansicht, öffentliche Online-Vorab-Registrierung.

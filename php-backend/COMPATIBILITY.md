# Kompatibilitäts-Datenbasis

Lebendiges Dokument (14.4 im Planungsdokument): wächst mit jeder Installation, bei der jemand tatsächlich `install.php` gegen einen echten Hoster laufen lässt — ob erfolgreich oder mit Problemen. Ziel ist eine wachsende, ehrliche Übersicht, welche Hosting-Umgebungen bekanntermaßen funktionieren, statt im Voraus alle denkbaren Hoster durchzutesten (unmöglich).

**Mindestanforderungen** (siehe auch [INSTALL.md](INSTALL.md)): PHP ≥ 7.4, MySQL ≥ 5.7 oder MariaDB ≥ 10.2, Extension `pdo_mysql`, Schreibrechte im Zielverzeichnis. Der Pre-Flight-Check in `install.php` prüft das automatisch bei jeder Installation.

---

## Einträge

### Lokale Entwicklungsumgebung (macOS, Homebrew) — 17.08.2026

**Kontext:** Erster Durchlauf nach Einführung des Pre-Flight-Checks, der Schema-Migrationen, der API-Key-Hashing-Umstellung und der Nebenläufigkeits-/Lasttests (Phase 14, Paket 3). Kein echter Shared-Host — dient hier primär dazu, den Pre-Flight-Check selbst, die Migrations-Logik und das Backend-Verhalten unter echter (wenn auch lokaler) MySQL-kompatibler Last zu verifizieren, bevor ein echter Hoster getestet wird.

| Punkt | Wert |
|---|---|
| Betriebssystem | macOS (Apple Silicon), Homebrew-Pakete |
| PHP-Version | 8.5.9 (CLI/Built-in-Server) |
| MySQL/MariaDB | MariaDB 12.3.2 |
| Pre-Flight-Check | Alle 8 Punkte grün (PHP-Version, `pdo_mysql`, `json`, Schreibrechte, `max_execution_time` 30s, `memory_limit` 128M, `utf8mb4` verfügbar, MySQL-Version erkannt) |
| Installation | `install.php` lief durch, Tabellen (`alleycat_kv`, `alleycat_db_meta`) korrekt angelegt, Selbstlöschung erfolgreich, `config.php` enthält nur den API-Key-Hash (kein Klartext) |
| Migrations-Test | Frische DB: Migration 1 angewendet, Re-Lauf idempotent (keine Doppel-Ausführung). Simulierte Legacy-DB (bereits befüllte `kv`-Tabelle ohne `db_meta`, wie ein Stand vor dieser Phase): `schema_version` korrekt auf 1 nachgezogen, bestehende Zeile nachweislich unangetastet (kein Datenverlust) |
| Race-Condition-Test | 20 gleichzeitige `POST`s auf denselben Key (curl_multi, `PHP_CLI_SERVER_WORKERS=8`): alle 20 mit HTTP 200, Endzustand danach unbeschädigt/korrekt dekodierbar (kein korrupter Mischzustand) — bestätigt DB-seitige Atomarität von `INSERT … ON DUPLICATE KEY UPDATE`. Siehe Abschnitt "Bekannte Grenze" unten für die Anwendungsschicht-Konsequenz |
| Mini-Lasttest | 100 gleichzeitige `POST`s auf 100 unabhängige Keys (je ~2 KB Payload, simuliert 100 Fahrer × 10 Checkpoints an Datenumfang): alle 100 in 4,8s erfolgreich, 100/100 beim Rücklesen korrekt, keine Cross-Contamination zwischen Keys |
| Besonderheiten | Der PHP-eingebaute Entwicklungsserver (`php -S`) ist standardmäßig **einsträngig** und verarbeitet Anfragen nacheinander — für den Nebenläufigkeits-/Lasttest musste `PHP_CLI_SERVER_WORKERS=8` gesetzt werden, sonst serialisiert der Server selbst alle "gleichzeitigen" Anfragen und der Test misst nur den Entwicklungsserver, nicht die App. Ein echtes Shared-Hosting-Setup (Apache/nginx + PHP-FPM) ist von Haus aus mehrsträngig, insofern eher der Realität näher als der Default-Devserver |
| Fazit | Pre-Flight-Check, Migrations-Runner und Backend-Endpunkte verhalten sich wie geplant. Kein Ersatz für einen echten Shared-Hosting-Test (siehe unten) |

### Lokale Entwicklungsumgebung (macOS, Homebrew) — Migration 2, 25.08.2026

**Kontext:** Schema-Prüfung für das Rider-App-Fundament (Teilprojekt 1, Paket 2). Migration `2` legt fünf neue Tabellen neben der kv-Tabelle an: `_rider_event`, `_rider_slot`, `_rider_checkpoint`, `_rider_log`, `_rider_ratelimit`. Geprüft wurde ausschließlich das Schema — `rider.php` existiert zu diesem Zeitpunkt noch nicht.

| Punkt | Wert |
|---|---|
| Betriebssystem | macOS (Apple Silicon), Homebrew-Pakete |
| PHP-Version | 8.5.9 (CLI) |
| MySQL/MariaDB | MariaDB 12.3.2 |
| Frische Datenbank | Migrationen 1 und 2 angewendet, `schema_version` = 2, alle fünf Tabellen vorhanden |
| Erneuter Lauf | Wendet nichts an, Version bleibt 2 — idempotent wie Migration 1 |
| Bestandsdatenbank auf Version 1 | Nur Migration 2 wird nachgeholt. Bestehender Event-Blob byte-identisch, beide kv-Zeilen erhalten, Umlaute und 4-Byte-Zeichen (Emoji) unversehrt — kein Datenverlust |
| `utf8`-Rückfall | Migration 2 läuft auch mit `$charset = 'utf8'` durch, Tabellen erhalten `utf8mb3_uca1400_ai_ci`. Erwartete Einschränkung dieses Pfads: 4-Byte-Zeichen (Emoji) lassen sich dann nicht speichern, MariaDB weist sie mit Fehler 1366 ab statt sie stillschweigend zu verstümmeln |
| `uq_scan` | Zweiter Check-in desselben Fahrers am selben Checkpoint wird mit SQLSTATE 23000 abgewiesen — Doppelscan-Schutz liegt in der Datenbank, nicht im Anwendungscode |
| `uq_scan` mit `cp_id NULL` | Mehrere Registrierungszeilen desselben Fahrers kollidieren nicht. Bestätigt die tragende Annahme, dass MySQL NULL-Werte in einem UNIQUE-Index als jeweils verschieden behandelt |
| `uq_client` | Wiederholter INSERT mit gleicher `client_uuid` wird abgewiesen — macht den Retry der Offline-Queue idempotent |
| `uq_bib` / `uq_token` | Startnummer pro Event nur einmal belegbar, `token_hash` global eindeutig |
| Ergebnis | 25 Prüfungen bestanden, 0 fehlgeschlagen (utf8-Rückfall separat: 24/24) |
| Fazit | Schema und Index-Zusagen verhalten sich wie geplant, auf beiden Charset-Pfaden. Kein Ersatz für einen echten Shared-Hosting-Test |

### Lokale Entwicklungsumgebung (macOS, Homebrew) — `rider.php`, 25.08.2026

**Kontext:** Funktions- und Sicherheitsprüfung des neuen Rider-Endpunkts (Teilprojekt 1, Paket 3), 60 Prüfungen per `curl` gegen `php -S` mit `PHP_CLI_SERVER_WORKERS=8`. `rider.php` ist der erste Endpunkt des Projekts, der **ohne Admin-Key erreichbar** ist — Fahrer-Handys rufen ihn direkt auf.

| Bereich | Ergebnis |
|---|---|
| Auth-Trennung | `?a=sync`, `?a=log`, `?a=slotstatus` weisen fehlenden und falschen Admin-Key mit 401 ab |
| Publish | Zweiter identischer Publish erzeugt keine Duplikate; Umlaute im Eventnamen überstehen den Weg |
| Fahrer-Sicht (`?a=me`) | Liefert eigene Startnummer, Checkpoints und eigenen Fortschritt. Antwort enthält nachweislich keinen fremden `token_hash` und keine fremde Startnummernbelegung. Koordinaten bleiben zurückgehalten, solange die Kartenansicht nicht freigeschaltet ist. Klartextcode wird auch kleingeschrieben akzeptiert |
| Check-in | Gültiger Scan 200. Retry mit gleicher `clientUuid` → `duplicate:true`. Zweiter Scan mit anderer `clientUuid` → `already` mit Zeitstempel. Nach drei Versuchen existiert genau **eine** Log-Zeile |
| Check-in-Abwehr | Falsches Checkpoint-Token, deaktiviertes QR-Check-In und nicht bestätigter Slot je 403 mit eigenem Fehlercode; Check-in vor Rennstart 409 |
| Scan-Zeitpunkt | Eine Stunde alter `scannedAt` wird übernommen (Offline-Queue). Unplausible Zukunftszeit fällt auf die Serverzeit zurück |
| GPS | Check-in aus 475 km Entfernung wird **angenommen** und die Distanz gespeichert — markiert, nie blockiert |
| Registrierung | Wildcard belegen → `pending`. Zweiter Versuch 409. Ein anschließender Publish setzt `pending` **nicht** auf `free` zurück |
| Nebenläufigkeit | 8 gleichzeitige Registrierungen auf dieselbe Startnummer: genau eine mit 200, sieben mit 409, genau eine Log-Zeile. Bestätigt, dass `status='free'` in der WHERE-Klausel das Belegen atomar macht |
| Log-Cursor | 600 Zeilen über drei Seiten gelesen: vollständig, keine doppelt, aufsteigend. `limit` wird auf 500 gedeckelt |
| `?a=freebibs` | Ohne freigeschaltete Selbstregistrierung 403; freigeschaltet nur Nummern, keine Namen |
| Rate-Limit | Fehlversuche 1–10 → 403, ab dem 11. → 429. Erfolgreiche Authentifizierung setzt den Zähler zurück. **30 gültige Check-ins in Folge sperren nicht** — es zählen ausschließlich Fehlversuche |
| Ergebnis | 60 Prüfungen bestanden, 0 fehlgeschlagen |
| Fazit | Endpunkt verhält sich wie geplant, inklusive der drei Zusagen, die in der Datenbank statt im Anwendungscode liegen. Kein Ersatz für einen echten Shared-Hosting-Test — insbesondere das Rate-Limit sollte dort erneut geprüft werden, weil PHP-FPM mehrere Arbeitsprozesse parallel bedient |

### Lokale Entwicklungsumgebung (macOS, Homebrew) — Abnahme Teilprojekt 1, 25.08.2026

**Kontext:** Abschließender Durchlauf über alle neun Abnahmekriterien des Rider-App-Fundaments, diesmal bewusst über den **echten Installationsweg**: frische Datenbank, `install.php` per HTTP-POST aufgerufen, danach mit dem dort erzeugten API-Key gearbeitet. Die vorigen Einträge hatten die Migrationen direkt aufgerufen und diesen Pfad damit nie geprüft.

| Punkt | Ergebnis |
|---|---|
| `install.php` auf frischer Datenbank | Legt alle sieben Tabellen an (`kv`, `db_meta`, fünf Rider-Tabellen), `schema_version` = 2, löscht sich anschließend selbst |
| `config.php` nach der Installation | Enthält nur `ALLEYCAT_API_KEY_HASH` (bcrypt), keinen Klartext-Key. `password_verify()` gegen den einmalig angezeigten Key bestätigt |
| Publish | 10 Slots, 3 Checkpoints; zweiter Publish erzeugt keine Duplikate |
| Check-in per `curl` | Angenommen; erscheint binnen eines Poll-Durchlaufs (5 s) im Leaderboard der Organizer-App mit Haken und Fortschritt 2/3 |
| Doppelscan / Queue-Retry | `duplicate:true` bzw. `already` mit Zeitstempel, beide HTTP 200; nach drei Versuchen genau eine Log-Zeile |
| Selbstanmeldung | Wildcard-Slot auf `pending`, erscheint in der Fahrerliste; Bestätigen und Ablehnen schreiben den Status zurück auf den Server, beides rückholbar |
| Datenschutz `?a=me` | Kein eigener und kein fremder Fahrername, kein Notfallkontakt, keine Rätsellösung, kein fremdes Klartext-Token; eigener Fortschritt vorhanden |
| Datenschutz veröffentlichte Tabellen | Fahrername, Notfallkontakt, Rätsellösung und Klartext-Token in `_rider_slot`/`_rider_event`/`_rider_checkpoint` **nicht auffindbar** (geprüft per `mysqldump` + `grep`) |
| `?a=freebibs` | Ohne freigeschaltete Selbstregistrierung 403 |
| Rate-Limit | Fehlversuche 1–10 → 403, ab dem 11. → 429; 20 gültige Zugriffe in Folge sperren nicht |
| Admin-Auth | `?a=log` ohne Key 401, mit Key 200 |
| Lokale Variante | Kein QR-Häkchen, kein Anmeldungs-Nav-Punkt, keine `publicId`, **kein laufender Poll-Timer** |
| Ergebnis | 24 Abnahmeprüfungen bestanden, 0 fehlgeschlagen; `test-suite.js` 905/905 |

**Beobachtung am Rande:** `?reset-php-config` bleibt beim `location.reload()` nach dem Setup in der URL stehen und löscht die gerade gespeicherte Konfiguration sofort wieder. Kein neuer Fehler und kein Problem im normalen Ablauf (der Parameter wird bewusst manuell angehängt), aber verwirrend, wenn man ihn zum Neu-Einrichten benutzt — dann muss man ihn vor dem Absenden aus der URL entfernen.

### Lokale Entwicklungsumgebung (macOS, Homebrew) — `?a=claim`, 27.08.2026

**Kontext:** Funktionsprüfung des neuen `claim`-Endpunkts (Rider-App Teilprojekt 3, zweite Hälfte — öffentliche Online-Vorab-Registrierung, siehe [Design-Doku](../docs/superpowers/specs/2026-08-28-public-pre-registration-design.md)). Echter Durchlauf über `install.php` per HTTP-POST auf frischer Datenbank, danach `curl` gegen alle relevanten Aktionen sowie ein realer Browser-Durchlauf des neuen `#g.<publicId>`-Einstiegs im Fahrer-Bundle gegen denselben Server.

| Punkt | Ergebnis |
|---|---|
| `install.php` auf frischer Datenbank | Wie in den vorigen Einträgen — alle Tabellen angelegt, Selbstlöschung, API-Key nur gehasht in `config.php` |
| `?a=claim`, freier Slot | 200, neuer `riderToken` in der Antwort; `?a=freebibs` listet die Nummer danach nicht mehr |
| `?a=claim`, bereits vergebene Nummer (Zweitversuch) | 409 `slot_taken` |
| `?a=claim`, nicht existierende Nummer | 404 `bib_not_found` |
| `?a=claim` ohne freigeschaltete Selbstregistrierung | 403 `self_register_disabled`, wie bei `?a=freebibs` |
| Neuer Token sofort gültig | `?a=me` mit dem aus `claim` zurückgegebenen Token liefert `slotStatus:"pending"` ohne Umweg |
| Log-Zeile trägt den neuen Token | `?a=log` (Admin-Key) zeigt `riderToken` im `register`-Payload — das ist der Weg, auf dem der Organizer-Client den Token nachträglich lernt, siehe unten |
| **Kritischer Fund vor dem Bau, hier bestätigt** | `?a=sync` überschreibt `token_hash` bedingungslos aus dem Client-Payload (anders als `status`, das bei `pending` geschützt ist) — ein Organizer-Client, der den von `claim` neu erzeugten Token nicht kennt, würde ihn beim nächsten Publish sonst wieder ungültig machen. `mergeRiderLogRows()` (Organizer-Seite) direkt mit einer realen Log-Zeile aus diesem Testlauf aufgerufen: übernimmt `riderToken` korrekt in `rider.riderToken`, entfernt ihn aus `pendingData`, meldet `changed:true` |
| Rate-Limit | Nach 10 `unknown_event`-Fehlversuchen auf `claim` greift dieselbe Sperre wie bei jeder anderen Aktion (429 ab dem 11.) — keine gesonderte Logik nötig, `claim` läuft durch dieselbe `riderCheckRateLimit()` |
| Bestehende Slots bei leerem Sync geschützt | Zwei per `claim` belegte Slots (`pending`, mit Log-Zeile) überstehen einen `?a=sync` mit leerer `slots`-Liste unverändert — bestätigt, dass die bestehende Verwaisungslogik auch für neu geclaimte Slots greift |
| Echter Browser-Durchlauf | `dist/alleycat-rider.html` mit `#g.<publicId>` geöffnet: Startnummernliste → Formular → Absenden → landet automatisch auf „Anmeldung läuft" mit korrekter Startnummer, keine Konsolenfehler |
| Ergebnis | 11 Prüfungen bestanden, 0 fehlgeschlagen |
| Fazit | Neuer Endpunkt verhält sich wie geplant, inklusive des vor dem Bau identifizierten Token-Synchronisations-Risikos, das mit einer gezielten Änderung in `mergeRiderLogRows()` behoben wurde. Kein Ersatz für einen echten Shared-Hosting-Test |

### `hasencore.de` — noch offen

Der im Planungsdokument (14.7) vorgesehene erste praktische Durchlauf auf einem echten Hoster steht noch aus — dafür wird Zugriff auf den dortigen Webspace benötigt (nur der Nutzer hat diesen Zugriff). Sobald durchgeführt: PHP-/MySQL-Version per `phpinfo()` bzw. `SELECT VERSION();` ermitteln (danach `phpinfo.php` sofort wieder löschen — zeigt sicherheitsrelevante Details), Pre-Flight-Check-Ausgabe hier dokumentieren, danach diesen Eintrag ergänzen.

---

## Bekannte Grenze: Nebenläufigkeit auf Anwendungsebene

Der Race-Condition-Test oben zeigt: **Die Datenbank selbst korrumpiert nie etwas** — jeder einzelne Schreibzugriff auf einen Key ist atomar (MySQL-Zeilensperre über den Primärschlüssel `key`). Was das Backend *nicht* verhindert: Zwei Browser-Tabs/Geräte, die **denselben Event-Datensatz** (ein kompletter JSON-Blob unter einem Key wie `event:<id>`) laden, unabhängig voneinander ändern und zurückschreiben — der zweite Schreibzugriff überschreibt den ersten vollständig ("last write wins"), ohne Konflikt-Erkennung. Konkret: Marshal A bestätigt Fahrer #5 am Checkpoint, Marshal B bestätigt zeitgleich Fahrer #7 an einem anderen Checkpoint desselben Events — je nachdem, wessen Speichervorgang zuletzt committet, kann die andere Änderung stillschweigend verloren gehen.

Das ist kein neuer, durch diese Phase eingeführter Fehler, sondern eine inhärente Eigenschaft des bestehenden "ein Key = ein kompletter Event-Blob"-Speichermodells (`storageGet/Set/Delete`, siehe [`CLAUDE.md`](../CLAUDE.md)) — durch reine Backend-Härtung nicht lösbar, ohne das Speicherprotokoll selbst zu ändern (z. B. optimistisches Locking mit Versions-/ETag-Feld, serverseitiges Anwenden von Teil-Diffs statt ganzer Blobs). Das wäre ein größerer, eigenständiger Umbau, der auch den JS-Client (`storage-server.js`, `ui-headquarter.js`s Speicher-Funktionen) betrifft — passend zum bereits in der Roadmap vorgemerkten Punkt "Live-Multi-Checkpoint-Check-in" (siehe `alleycat-dispatch-feature-uebergabe_1.md`, Abschnitt 11), nicht Teil von Phase 14. Für den heutigen Einsatzzweck (ein Organizer-Team, gelegentliche gleichzeitige Bearbeitung, kein High-Traffic-Wettkampfbetrieb mit vielen simultanen Marshals) ist das Risiko gering, aber real — bewusst hier dokumentiert statt stillschweigend als "gelöst" markiert.

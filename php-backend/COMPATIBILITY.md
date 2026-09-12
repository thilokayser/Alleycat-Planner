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

### Lokale Entwicklungsumgebung (macOS, Homebrew) — Admin-Rollensystem + Checkpoint-App, 29.08.2026

**Kontext:** Erster Durchlauf gegen eine echte Datenbank für das am selben Tag zuvor gebaute Admin-Rollensystem/Checkpoint-App (Rider-App Teilprojekt 4) — bis dahin nur mit dem Client gegen eine Platzhalter-API-URL geprüft (siehe `CLAUDE.md`, bekannte Baustelle). Auslöser war ein vom Nutzer gemeldeter Fehler auf seinem echten Server ("Etwas ist schiefgelaufen", landet immer im Dashboard, scheinbar bei jedem Schreibzugriff) — dieselbe frische lokale Installation (`install.php` per HTTP-POST, `php -S` + MariaDB) diente sowohl der Fehlersuche als auch der ohnehin fälligen Erstverifikation.

| Bereich | Ergebnis |
|---|---|
| Migration 4 | `admin_user`/`admin_session`/`checkpoint_staff`/`checkpoint_session` korrekt angelegt, `schema_version` = 4, Re-Lauf idempotent |
| `?a=bootstrap` | Falscher API-Key 401, zu kurzes Passwort 400, korrekter Aufruf 200 (erster Admin angelegt), danach jeder weitere Versuch 409 `already_bootstrapped` |
| Rollen-Durchsetzung `api.php` | Betrachter: GET 200, POST 403 `insufficient_role` — genau die zuvor unverifizierte Zusicherung. Editor: POST 200, aber `auth.php`-Benutzerverwaltung (`?a=users`, `?a=users/create`) 403. Kein/ungültiges Token: 401 |
| Checkpoint-App, Code-Modus | Falscher Code 403 `invalid_code`, korrekter Code 200 mit Token; `?a=checkpoint-me` liefert nur den einen zugewiesenen Checkpoint |
| Checkpoint-App, Konten-Modus | Login ohne zugewiesene Checkpoints 403 `no_checkpoints_assigned`; nach Zuweisung 200 mit Token, `?a=checkpoint-me` korrekt skopiert |
| Live-Umzuweisung ohne Re-Login | Zuweisung per `?a=checkpointstaff/set` entzogen, **derselbe** bereits ausgegebene Token liefert danach sofort 403 — bestätigt die dokumentierte Zusage, dass der Geltungsbereich pro Anfrage aufgelöst wird, nie im Token eingefroren ist |
| Selbstregistrierung Ende-zu-Ende | `?a=freebibs` → `?a=claim` → Organizer bestätigt (`?a=slotstatus`) → `?a=me` zeigt `confirmed` → `?a=checkin` 200 → Retry mit gleicher `clientUuid` `duplicate:true` |
| Rate-Limit | 10 Fehlversuche auf `?a=login` → 403, ab dem 11. → 429 mit korrektem `Retry-After`; abgelaufene Sperre lässt sofort wieder zu; erfolgreicher Login löscht die Zeile; Sperrdauer verdoppelt sich korrekt (60s → 120s) bei erneutem Fehlversuch nach Ablauf |
| **Kritischer Fund 1 (behoben)** | `?a=sync`/`?a=log`/`?a=slotstatus` prüften nur `apiVerifyKey()` (den einen Master-Key), nie `X-Admin-Token` — jede personalisierte Anmeldung (statt des Master-Keys) bekam auf jeden Rider-Sync-Publish und jeden 5s-Log-Poll ein 401. `handleAuthResponseStatus()` wertet 401 bei geladener Session als tot, löscht sie und lädt neu — genau das vom Nutzer gemeldete Verhalten. Live reproduziert und mit dem Fix (`apiVerifyAccess()` statt `apiVerifyKey()`) bestätigt behoben |
| **Kritischer Fund 2 (behoben)** | `?a=sync`s Slot-Upsert schützte `status='pending'` vor einem veralteten Publish, `'confirmed'` aber nicht. `confirmPendingRider()` setzt `confirmed` per direktem `?a=slotstatus`-UPDATE ohne Log-Zeile — ein zweites, noch nicht nachgezogenes Organizer-Gerät konnte das beim nächsten eigenen (unabhängigen) Publish stillschweigend auf `pending` zurücksetzen. Ein bereits bestätigter Fahrer wäre dann mitten im Rennen von `?a=checkin` abgewiesen worden, ohne dass ein Organizer davon erfahren hätte. Live reproduziert (zwei Sessions, eine bestätigt, die andere veröffentlicht danach) und behoben, indem `confirmed` denselben Schutz wie `pending` bekommt |
| **Kritischer Fund 3 (behoben)** | Checkpoint-App-Client (`src/checkpoint/*.js`) erkennt eine tote Session am HTTP-Status 401 — den `?a=checkpoint-me`/`?a=checkpoint-checkin` aber nie senden (`checkpointResolveScope()` lehnt über `riderRejectAuth()` immer mit 403 ab). Bei `checkpoint-me` blieb die App dadurch auf einem veralteten Cache oder einer generischen Fehlerseite hängen statt zum Login zurückzukehren; bei der Offline-Warteschlange (`queue.js`) schlimmer: ein gesicherter, aber noch nicht gesendeter Check-in-Scan wurde bei totem Zugang als endgültig erledigt markiert und **endgültig verworfen** — Verstoß gegen die eigene Zusage des Moduls, dass kein Scan verloren geht. Beide Stellen erkennen `403`+`error:'unauthorized'` jetzt zusätzlich als toten Zugang |
| Kleinerer Fund (behoben) | Sechs Stellen schrieben `last_seen_at` per SQL `NOW()` (Server-Systemzeitzone) statt wie der Rest der App per PHP-UTC — rein kosmetisch (nie mit einem PHP-Wert verglichen), aber "Zuletzt aktiv" in der Benutzerverwaltung zeigte eine um den Server-Offset verschobene Zeit. Auf `UTC_TIMESTAMP()` umgestellt |
| Nicht behoben (Begründung siehe Commit) | Dieselbe Fahrer-Umzuweisungs-Lücke gilt spiegelbildlich für `rejectPendingRider()` (setzt `free` ebenfalls ohne Log-Zeile) — geringere Schwere, weil ein zurückgesetzter Status durch `checkin` (verlangt `confirmed`) ohnehin keinen Zugriff gewährt; bewusst nicht mit demselben Aufwand gehärtet |
| SQL-Injection / XSS / CSRF-Oberfläche | `install.php`s Tabellen-Präfix bereits per `preg_replace('/[^a-zA-Z0-9_]/','',...)` gefiltert, alle sonstigen Bezeichner konstantenbasiert; sämtliche Preflight-/Installer-Ausgaben per `htmlspecialchars()`; CSV-Export (`csvEscape()`) neutralisiert Formel-Injection (`=`,`+`,`-`,`@`) nachweislich End-zu-Ende; GPX/GeoJSON/KML-Import rein clientseitig (kein XXE-Risiko serverseitig, PHP parst nirgends XML) |
| Regressionslauf | `test-suite.js` 932/935 nach allen Fixes — dieselben 3 vorbestehenden, nachweislich unabhängigen Fehlschläge wie vor dieser Sitzung (Settings-Nav-Gruppenanzahl, ein Undo-Test), keine neuen |
| Ergebnis | 5 Commits (4 Funktionsfixes + 1 Kommentarkorrektur), alle live gegen diese Installation reproduziert und nach dem Fix erneut verifiziert |
| Fazit | Admin-Rollensystem und Checkpoint-App verhalten sich nach den Fixes wie geplant, inklusive der in `CLAUDE.md` explizit als offen markierten Punkte (Migration 4, Bootstrap, Rollen-403, beide Checkpoint-App-Modi). Kein Ersatz für einen echten Shared-Hosting-Test — insbesondere ob `X-Admin-Token` dort unverändert bei PHP ankommt (mancher Hoster/Proxy filtert eigene Header), ließ sich mit dem eingebauten Dev-Server nicht prüfen |

### Lokale Entwicklungsumgebung (macOS, Homebrew) — Multi-Tenancy/Org-RBAC End-zu-Ende, 07.09.2026

**Kontext:** Abschließende Verifikation des Multi-Tenancy-/Org-Governance-Plans (Pakete 1-9: Schema, org-fähiges RBAC in `apiVerifyAccess()`, SysAdmin-Bootstrap, Org-CRUD/Mitgliederverwaltung/Event-Delegation in `auth.php`, org-skopierte KV/Event-Tabelle in `api.php`, Build-Lint-Guard, Frontend-Workspace-Dropdown/Org-Settings/Instance-Panel, `.htaccess`-Generierung). Rein verifizierend, keine Quelländerung. Frische Scratch-DB (`alleycat_org_verify`, eigener DB-Nutzer, danach wieder gelöscht), `install.php` per echtem HTTP-POST (legt ersten Sysadmin `sysadmin` mit an), `php -S localhost:8091 -t php-backend` mit `PHP_CLI_SERVER_WORKERS=8`. Alle Schritte unten live per `curl` gegen diese Installation gefahren, nicht nur am Code nachvollzogen.

| Schritt | Ergebnis |
|---|---|
| Zwei Orgs, zwei Editoren | `?a=org/create` legt `crew-a` (id 1) und `crew-b` (id 2) an; `?a=users/create` legt `editor-a` (id 2) und `editor-b` (id 3) an; `?a=org/members/set-role` macht beide zu `editor` in ihrer jeweils eigenen Org — alle 200 |
| Cross-Org-Isolation (Schritt 2) | `editor-a` legt `event:evt-a1` unter `crew-a` an (200). `editor-b` liest denselben Key unter eigenem `X-Org-Slug: crew-b` — **404 `not_found`**, wie erwartet: `api.php` filtert `WHERE org_id = ? AND id = ?` mit dem aus `crew-b` aufgelösten `org_id`, es existiert dort keine Zeile |
| SysAdmin sieht beide Orgs (Schritt 3) | `?a=events` mit dem Master-API-Key liefert unter `X-Org-Slug: crew-a` genau `evt-a1`, unter `crew-b` eine leere Liste — bestätigt Org-Trennung auch für die Listen-Aktion |
| Event-Delegation, genau ein Event | `?a=org/event-admins/grant` delegiert `evt-a1` an `editor-b` (userId 3) innerhalb `crew-a`. Danach: `editor-b` liest `evt-a1` unter `X-Org-Slug: crew-a` → **200**, Inhalt korrekt; schreibt denselben Key → **200**, Rücklesen bestätigt den neuen Wert (`"Test A edited by b"`) |
| Delegation bleibt eng | Zweites Event `evt-a2` von `editor-a` unter `crew-a` angelegt. `editor-b` (nur für `evt-a1` delegiert) versucht `evt-a2` zu lesen → **403 `insufficient_role`** (nicht 404 — `apiVerifyAccess()` weist schon vor der Query ab, weil weder Org-Mitgliedschaft noch eine zu `evt-a2` passende Delegation vorliegt). `editor-b` versucht `?a=events` unter `crew-a` → **403**. `editor-b` versucht `?a=org/members` unter `crew-a` → **403** — beide bestätigen, dass die Delegation ausschließlich das eine Event freischaltet, nicht Org-Mitgliedschaft simuliert |
| Bereinigung | Scratch-Datenbank und -Datenbanknutzer nach dem Lauf gelöscht; `install.php` löscht sich beim erfolgreichen Setup selbst (erwartetes Verhalten) und wurde per `git checkout` wiederhergestellt, ebenso die vom Installer neu geschriebene `php-backend/.htaccess`; Arbeitsverzeichnis nach dem Lauf wieder sauber (`git status` clean, keine Quelländerung) |
| Ergebnis | Alle drei Szenarien aus dem Verifikationsplan bestanden, live reproduziert, keine Abweichung vom erwarteten Verhalten gefunden |
| Fazit | Multi-Tenancy/Org-RBAC verhält sich wie geplant: Org-Scoping in `api.php` ist wasserdicht gegen Cross-Org-Lesezugriffe über denselben Key, SysAdmin-Top-Down-Zugriff funktioniert, Event-Delegation gewährt exakt den beabsichtigten engen Zugriff ohne Nebenwirkungen auf Org-Mitgliederlisten oder andere Events. Kein Ersatz für einen echten Shared-Hosting-Test (siehe unten und `CLAUDE.md`) |

**Am Rande festgehalten, aus der Plan-Review, kein Blocker:** `apiHasEventDelegation()` (`bootstrap.php`) prüft nicht selbst, ob das delegierte Event tatsächlich zur im Request aufgelösten Org gehört — nachvollzogen als aktuell nicht ausnutzbar, weil `api.php`s Queries `org_id` und `id` immer gemeinsam filtern (siehe Zeilen 69-70 in `api.php`), aber eine künftige Härtung wert. Außerdem ruft das Frontend an manchen Stellen noch `events:index` statt durchgängig die neue `?a=events`-Aktion für die Dashboard-Liste — funktional unbedenklich (weiterhin org-isoliert), möglicher Aufräum-Follow-up.

## Spokecard-Claiming-Flow (Fahrer-Konten)

Migration 11 (`rider_user`/`rider_session`/`rider_claim`/`rider_password_reset`)
und `rider-register`/`rider-login`/`rider-forgot`/`rider-reset` in `rider.php`
sind **live gegen eine echte Scratch-MariaDB-Instanz verifiziert**: frische
Scratch-DB, `install.php` per HTTP-POST (inkl. Migration 11), danach per
`curl` durchgespielt — Registrierung, Login, Passwort-Reset-Anfrage und
Reset mit Token als Happy-Path, plus Duplicate-Email (`email_taken`, 403),
zu kurzes Passwort, falsches Passwort beim Login, ungültiges/abgelaufenes
Reset-Token und Session-Invalidierung nach einem erfolgreichen Reset (alte
Session wird ungültig). Scratch-DB und -User wurden danach wieder gelöscht.

`rider-claim`/`rider-history` in `rider.php` wurden **separat live gegen
eine frische Scratch-MariaDB-Instanz verifiziert**: Claim eines Slots per
Token-Nachweis, Claim per Code-Nachweis, Overwrite-on-Reclaim (ein zweiter
Rider-Account beansprucht denselben Slot — die DB-Zeile zeigt danach den
zweiten Account als Inhaber, per Design ist der Token-/Code-Nachweis die
Autorität, nicht "wer zuerst kam"), Cross-Account-Isolation der Historie
(der erste Account sieht die überschriebene Claim nicht mehr in seiner
`rider-history`) und die Method-Guards (`rider-claim` per GET → 405,
`rider-history` per POST → 405).

Der SMTP-Client selbst (`smtp.php`, das Protokoll-Handling in `smtpSendMail()`)
wurde **live gegen einen echten disponiblen lokalen SMTP-Testserver verifiziert**
(`aiosmtpd` mit STARTTLS + `AUTH LOGIN`, selbstsigniertes Zertifikat):
erfolgreicher Versand inkl. Dot-Stuffing/CRLF-Normalisierung, UTF-8-Betreff
und korrekte Fehlermeldung bei falschen Zugangsdaten (SMTP 535). Die
Implicit-TLS-Variante (Port 465) wurde nur über die zugrunde liegende
`ssl://`-Verbindung isoliert geprüft, nicht end-to-end durch `smtpSendMail()`
(privilegierter Port ließ sich im Testsetup nicht binden) — kleine,
risikoarme Lücke, da dieselbe umgebende Logik über STARTTLS auf 587 bereits
vollständig verifiziert ist.

Die `smtp-test`-Action in `auth.php` (SysAdmin-Testmail-Button) selbst
**wurde in diesem Durchgang nicht live getestet** — nur `php -l` als
Syntaxcheck plus manueller Code-Trace, der bestätigt, dass alle
Abhängigkeiten (Sysadmin-Check, `smtpLoadSettings()`, `smtpSendMail()`,
Fehlerpfade) korrekt verdrahtet sind. Ein `curl`-Durchlauf gegen eine echte
DB mit `admin_user.is_sysadmin=1` und einer echten SMTP-Konfiguration steht
noch aus.

Was für dieses Paket wie für alle anderen Einträge in dieser Datei
weiterhin ungetestet bleibt: Verhalten auf echtem Shared Hosting
(PHP-FPM/Apache statt PHP-Dev-Server) und Versand über ein echtes
(Nicht-Scratch-)SMTP-Relay bzw. ein echtes Postfach.

### Docker: Apache + mod_php (PHP 8.3 und 7.4) + MariaDB 11 — 12.09.2026

**Kontext:** Erster Durchlauf auf einem **echten Webserver** statt `php -S`, und erster Durchlauf auf der dokumentierten **Mindestversion PHP 7.4**. Setup liegt als wiederverwendbare Umgebung im Repo unter [`docker/`](../docker/): `docker compose up -d --build` startet MariaDB 11 plus zwei Apache-Container (PHP 8.3 auf Port 8083, PHP 7.4 auf 8074, je eigene Datenbank). `php-backend/` wird read-only gemountet und beim Start in eine Arbeitskopie kopiert — nötig, weil `install.php` sich selbst löscht und sonst die getrackte Repo-Datei träfe.

| Punkt | PHP 8.3.33 | PHP 7.4.33 |
|---|---|---|
| Webserver | Apache 2.4.68 (Debian), mod_php | Apache 2.4.54 (Debian), mod_php |
| Pre-Flight-Check | 7/7 grün (inkl. neuem `mbstring`-Check) | 7/7 grün |
| `install.php` | läuft durch, Tabellen angelegt, Selbstlöschung erfolgreich, `config.php` enthält nur den Key-Hash | identisch (per `curl`-POST) |
| `.htaccess`-Schutz für `config.php` | 403 (`AH01630: client denied by server configuration`) — greift auf echtem Apache | 403 |
| `auth.php?a=discover` | liefert `apiUrl` + `riderAppUrl`, unauthentifiziert | identisch |
| **`X-Admin-Token` durch mod_php** | **kommt an** — `?a=whoami` mit Token 200, ohne 401, mit Müll-Token 401 | **kommt an** |
| Rollen auf `api.php` | Viewer GET 200 / POST 403 / DELETE 403, Editor POST 200, fremder Org-Slug 403, Master-Key 200 | Schreib-/Lesepfad stichprobenartig geprüft, identisch |
| Migrationen | `migrate.php` (POST) zweimal: `applied:[]`, `currentVersion:11` — idempotent | identisch |
| utf8mb4 | Eventname mit Umlauten **und** Emoji unverändert zurückgelesen | identisch |
| PHP-Log (`error_reporting=E_ALL`) | **keine** Warnung, Notice oder Deprecation über den gesamten Durchlauf | **keine** |

**Vollständiger Browser-Durchlauf (PHP 8.3):** Login mit dem beim Install angelegten Admin-Konto → Org-Auswahl → Event mit zwei Checkpoints → drei Startnummern generiert → Fahrer-App-Adresse gesetzt (landet über `setRiderAppBaseUrl()` auch im KV-Store, `?a=discover` liefert sie danach aus) → Publish → Selbstanmeldung in der Fahrer-App → Bestätigung im Organizer über das Log-Polling (5s-Takt, im Access-Log als exakt eine Anfrage pro 5 Sekunden nachgewiesen) → Checkpoint-App per Zugangscode freigeschaltet → **`checkpoint-checkin` gegen einen bestätigten Slot: 200** → zweiter Versuch derselben Startnummer: „Bereits eingecheckt" → Check-in erscheint im Leaderboard des Organizers. Damit ist der bis dahin offene Punkt „`checkpoint-checkin` gegen eine befüllte `rider_slot`-Zeile" abgedeckt.

**Dabei gefunden:**

1. **Fahrer- und Checkpoint-App funktionieren nur im selben Verzeichnis wie `rider.php`.** `riderEndpoint()` (`src/rider/api.js`, identisch in `src/checkpoint/api.js`) leitet den Endpunkt aus der *eigenen* Adresse ab. [`INSTALL.md`](INSTALL.md) sagte das Gegenteil („irgendwohin unter deine Domain hochladen … die App kennt `rider.php` aus der Konfiguration") und nannte als Beispiel genau die Web-Root-Ablage. Wer der Anleitung folgte und das Backend wie beschrieben unter `/php-backend/` betrieb, bekam auf jede Fahrer-Anfrage 404 und in der App nur „Etwas ist schiefgelaufen." — **Anleitung am selben Tag korrigiert** (beide Apps gehören neben `rider.php`); die Einschränkung selbst steht im Code noch. Sie im Code aufzuheben (Endpunkt aus dem QR-Payload oder per Discovery) ist als eigener Auftrag vorgemerkt.
2. **Die von `install.php` erzeugte Pretty-URL-`.htaccess` verschluckte 404er in Unterverzeichnissen.** `RewriteCond %{REQUEST_FILENAME} !-f` + `RewriteRule ^([a-z0-9-]+)/(.*)$` traf auch `/php-backend/<irgendwas>`: Eine fehlende Datei dort lieferte **HTTP 200 und die komplette Organizer-HTML (≈ 928 KB)** statt eines 404. Sichtbar u. a. beim erneuten Aufruf von `install.php` nach dessen Selbstlöschung. — **Behoben und gegengeprüft** (12.09.2026): der Block enthält jetzt zusätzlich `RewriteCond %{REQUEST_URI} !/<backend-dir>/` und `RewriteCond %{REQUEST_URI} !\.php$`, Verzeichnisname aus `basename(__DIR__)`. Die schreibende Funktion ist dafür aus `install.php` in die neue Datei `htaccess.php` gewandert (`writePrettyUrlHtaccess()`) und wird zusätzlich von `migrate.php` aufgerufen — sonst erreichte eine korrigierte Regel **bestehende** Installationen nie, weil `install.php` sich nach der Erstinstallation selbst löscht.

   Gegenprobe, beide Wege: **Neuinstallation** (PHP-7.4-Container) — fehlende Backend-Datei und gelöschte `install.php` je 404, Org-Pretty-URL (`/testcrew/board`) weiterhin 200 mit der App, `auth.php?a=discover` unverändert erreichbar. **Bestandsinstallation** (PHP-8.3-Container, noch mit der alten Regel, vorher 200 + 928 KB) — ein `POST migrate.php` liefert `{"ok":true,"applied":[],"currentVersion":11,"htaccess":true}`, danach 404 an derselben Adresse; zweiter Lauf idempotent, die `.htaccess` enthält weiterhin genau einen Markerblock.

**Weiterhin ungetestet:** echtes Shared Hosting (PHP-FPM statt mod_php), Last-/Nebenläufigkeitstests auf dieser Umgebung, SMTP-Versand, sowie der Claim-Fluss („Startnummer zu meinem Konto hinzufügen") der Fahrer-App.

### `hasencore.de` — noch offen

Der im Planungsdokument (14.7) vorgesehene erste praktische Durchlauf auf einem echten Hoster steht noch aus — dafür wird Zugriff auf den dortigen Webspace benötigt (nur der Nutzer hat diesen Zugriff). Sobald durchgeführt: PHP-/MySQL-Version per `phpinfo()` bzw. `SELECT VERSION();` ermitteln (danach `phpinfo.php` sofort wieder löschen — zeigt sicherheitsrelevante Details), Pre-Flight-Check-Ausgabe hier dokumentieren, danach diesen Eintrag ergänzen.

---

## Bekannte Grenze: Nebenläufigkeit auf Anwendungsebene

Der Race-Condition-Test oben zeigt: **Die Datenbank selbst korrumpiert nie etwas** — jeder einzelne Schreibzugriff auf einen Key ist atomar (MySQL-Zeilensperre über den Primärschlüssel `key`). Was das Backend *nicht* verhindert: Zwei Browser-Tabs/Geräte, die **denselben Event-Datensatz** (ein kompletter JSON-Blob unter einem Key wie `event:<id>`) laden, unabhängig voneinander ändern und zurückschreiben — der zweite Schreibzugriff überschreibt den ersten vollständig ("last write wins"), ohne Konflikt-Erkennung. Konkret: Marshal A bestätigt Fahrer #5 am Checkpoint, Marshal B bestätigt zeitgleich Fahrer #7 an einem anderen Checkpoint desselben Events — je nachdem, wessen Speichervorgang zuletzt committet, kann die andere Änderung stillschweigend verloren gehen.

Das ist kein neuer, durch diese Phase eingeführter Fehler, sondern eine inhärente Eigenschaft des bestehenden "ein Key = ein kompletter Event-Blob"-Speichermodells (`storageGet/Set/Delete`, siehe [`CLAUDE.md`](../CLAUDE.md)) — durch reine Backend-Härtung nicht lösbar, ohne das Speicherprotokoll selbst zu ändern (z. B. optimistisches Locking mit Versions-/ETag-Feld, serverseitiges Anwenden von Teil-Diffs statt ganzer Blobs). Das wäre ein größerer, eigenständiger Umbau, der auch den JS-Client (`storage-server.js`, `ui-headquarter.js`s Speicher-Funktionen) betrifft — passend zum bereits in der Roadmap vorgemerkten Punkt "Live-Multi-Checkpoint-Check-in" (siehe `alleycat-dispatch-feature-uebergabe_1.md`, Abschnitt 11), nicht Teil von Phase 14. Für den heutigen Einsatzzweck (ein Organizer-Team, gelegentliche gleichzeitige Bearbeitung, kein High-Traffic-Wettkampfbetrieb mit vielen simultanen Marshals) ist das Risiko gering, aber real — bewusst hier dokumentiert statt stillschweigend als "gelöst" markiert.

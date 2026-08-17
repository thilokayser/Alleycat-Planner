# Alleycat Dispatch — PHP-Backend

Ein schlanker Key-Value-Speicher über MySQL, als Alternative zu localStorage/SQLite —
läuft auf jedem Webspace mit PHP + MySQL (kein WordPress nötig).

## Mindestanforderungen

- PHP ≥ 7.4
- MySQL ≥ 5.7 oder MariaDB ≥ 10.2
- PHP-Extension `pdo_mysql`
- Schreibrechte im Zielverzeichnis (für `config.php`)

`install.php` prüft das beim Aufruf automatisch selbst (Pre-Flight-Check, siehe unten) — bei rotem Ergebnis lieber die **lokale Variante** (`dist/alleycat-dispatch-local.html`, läuft komplett im Browser, keine Server-Voraussetzungen) nutzen, statt den Check zu übergehen.

## Setup

Bebilderte Schritt-für-Schritt-Anleitung: [INSTALL.md](INSTALL.md). Kurzfassung:

1. In deinem Hosting-Control-Panel eine **MySQL-Datenbank + Benutzer** anlegen (falls nicht schon vorhanden).
2. Diesen ganzen `php-backend`-Ordner per FTP/Dateimanager auf den Server hochladen.
3. `install.php` im Browser aufrufen (z. B. `https://deinedomain.tld/php-backend/install.php`) — zeigt zuerst den Umgebungscheck, dann das Formular.
4. Formular ausfüllen (Host meist `localhost`, dazu DB-Name/Benutzer/Passwort) und absenden.
5. **API-Endpunkt und API-Key von der Erfolgsseite kopieren** — der Key wird danach nicht mehr angezeigt (nur ein Hash bleibt gespeichert).
6. `install.php` löscht sich nach erfolgreicher Installation selbst. Klappt das aus Rechte-Gründen nicht, zeigt die Erfolgsseite einen Hinweis, es manuell zu tun.

Danach liegen `config.php` (Zugangsdaten + API-Key-Hash, per `.htaccess` vor Web-Zugriff geschützt) und die Endpunkte (`api.php`, `backup.php`, `migrate.php`) auf dem Server.

## Dateien

- `install.php` — einmaliger Web-Installer: Pre-Flight-Check, Formular, Schema-Migration, `config.php`-Erzeugung, Selbstlöschung nach Erfolg.
- `preflight.php` — Umgebungscheck (PHP-Version, Extensions, Schreibrechte, `max_execution_time`/`memory_limit`, `utf8mb4`-Verfügbarkeit, MySQL-Version) — von `install.php` genutzt.
- `migrations.php` — kleiner Schema-Migrations-Runner (`db_meta`-Tabelle mit `schema_version`), idempotent formuliert. Genutzt von `install.php` und `migrate.php`.
- `bootstrap.php` — gemeinsame Grundlage für alle laufenden Endpunkte: lädt `config.php`, prüft den API-Key (unterstützt sowohl den neuen Hash als auch ältere Klartext-Konfigurationen), öffnet die DB-Verbindung, fängt Fehler serverseitig ab (nie Rohdetails im Response-Body, siehe [COMPATIBILITY.md](COMPATIBILITY.md)).
- `api.php` — REST-Endpunkt (`GET`/`POST`/`DELETE` über `?key=...`, Auth per `X-Api-Key`-Header) — der von der App tatsächlich genutzte Storage-Endpunkt.
- `backup.php` — API-Key-geschützter `GET`-Endpunkt, lädt den gesamten Tabelleninhalt als JSON-Datei herunter (Server-seitiges Backup ohne CLI-/phpMyAdmin-Zugriff).
- `migrate.php` — API-Key-geschützter `POST`-Endpunkt, holt neue Schema-Migrationen nach (für bereits installierte Backends nach einem App-Update, ohne `install.php` erneut auszuführen).
- `.htaccess` — sperrt Direktzugriff auf `config.php`.
- `config.php` — wird von `install.php` erzeugt, enthält DB-Zugangsdaten + API-Key-**Hash**. Nicht committen/teilen.
- `COMPATIBILITY.md` — wachsende Liste tatsächlicher Installationen (Hoster, PHP-/MySQL-Version, Besonderheiten).

## Verwendung

Die Server-Variante der App (`node build.js` im Repo-Root ausführen, dann `dist/alleycat-dispatch-server.html` öffnen) spricht `api.php` bereits an (Setup-Screen fragt beim ersten Start nach API-Endpunkt und -Key).

## Bekannte Grenzen

Nebenläufigkeit auf Anwendungsebene (zwei Geräte bearbeiten dasselbe Event gleichzeitig) ist noch "last write wins" — siehe [COMPATIBILITY.md](COMPATIBILITY.md), Abschnitt "Bekannte Grenze" für Details und Einordnung.

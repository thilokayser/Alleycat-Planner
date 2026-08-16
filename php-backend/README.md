# Alleycat Dispatch — PHP-Backend

Ein schlanker Key-Value-Speicher über MySQL, als Alternative zu localStorage/SQLite —
läuft auf jedem Webspace mit PHP + MySQL (kein WordPress nötig).

## Setup

Bebilderte Schritt-für-Schritt-Anleitung: [INSTALL.md](INSTALL.md). Kurzfassung:

1. In deinem Hosting-Control-Panel eine **MySQL-Datenbank + Benutzer** anlegen (falls nicht schon vorhanden).
2. Diesen ganzen `php-backend`-Ordner per FTP/Dateimanager auf den Server hochladen.
3. `install.php` im Browser aufrufen (z. B. `https://deinedomain.tld/php-backend/install.php`).
4. Formular ausfüllen (Host meist `localhost`, dazu DB-Name/Benutzer/Passwort) und absenden.
5. **API-Endpunkt und API-Key von der Erfolgsseite kopieren** — der Key wird danach nicht mehr angezeigt.
6. **`install.php` sofort vom Server löschen.**

Danach liegen `config.php` (Zugangsdaten + API-Key, per `.htaccess` vor Web-Zugriff geschützt) und `api.php` (der eigentliche Endpunkt) auf dem Server.

## Dateien

- `install.php` — einmaliger Web-Installer, erzeugt `config.php` + Tabelle. Nach Gebrauch löschen.
- `api.php` — REST-Endpunkt (`GET`/`POST`/`DELETE` über `?key=...`, Auth per `X-Api-Key`-Header).
- `.htaccess` — sperrt Direktzugriff auf `config.php`.
- `config.php` — wird von `install.php` erzeugt, enthält DB-Zugangsdaten + API-Key. Nicht committen/teilen.

## Verwendung

Die Server-Variante der App, `alleycat-dispatch-server.html` im Repo-Root, spricht diesen Endpunkt bereits an (Setup-Screen fragt beim ersten Start nach API-Endpunkt und -Key).

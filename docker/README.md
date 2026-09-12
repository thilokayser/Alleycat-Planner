# Docker-Testumgebung

Lokale Umgebung für das PHP-Backend auf **echtem Apache + mod_php**, in zwei PHP-Versionen gleichzeitig. Ersetzt das Homebrew-MariaDB-Setup aus `CLAUDE.md` für alle Tests, bei denen der Webserver selbst eine Rolle spielt (`.htaccess`, Header-Durchreichung, Rewrite-Regeln).

```bash
node build.js                 # dist/ neu bauen
cd docker && docker compose up -d --build
```

| Adresse | Inhalt |
|---|---|
| http://localhost:8083 | PHP 8.3, Datenbank `alleycat83` |
| http://localhost:8074 | PHP 7.4 (dokumentiertes Minimum), Datenbank `alleycat74` |
| `…/php-backend/install.php` | Installer — **Datenbank-Host ist `db`**, Benutzer `alleycat`, Passwort `alleycatpass` |
| localhost:3307 | MariaDB 11 von außen |

## Was das Setup bewusst anders macht

- **`php-backend/` wird kopiert, nicht gemountet.** `install.php` löscht sich nach der Installation selbst und legt `config.php` daneben — ein Bind-Mount würde die getrackte Repo-Datei treffen. Die Arbeitskopie liegt in einem Named Volume (`web83backend`/`web74backend`) und überlebt Neustarts; `ALLEYCAT_KEEP_CONFIG=1` behält dabei die bestehende Installation.
- **`dist/*.html` werden beim Start kopiert.** Nach `node build.js` also `docker compose restart web83 web74`. (Symlinks scheitern an Apache 2.4.68: `AH00037`.)
- **`error_reporting = E_ALL`, Logs auf stderr** (`php.ini`) — Warnungen und Deprecations landen in `docker compose logs`.

Frisch anfangen (Datenbanken und Installationen weg): `docker compose down -v`.

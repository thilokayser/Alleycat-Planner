# Installguide: PHP-Backend einrichten

Schritt-für-Schritt-Anleitung, um die Server-Variante der App mit einem eigenen PHP/MySQL-Backend zu verbinden — für den Einsatz mit mehreren Organizern/Geräten auf demselben Event. Dauert je nach Hosting-Anbieter ca. 5–10 Minuten.

**Mindestanforderungen:** PHP ≥ 7.4, MySQL ≥ 5.7 oder MariaDB ≥ 10.2, PHP-Extension `pdo_mysql`, Schreibrechte im Zielverzeichnis — jedes normale Shared-Hosting-Paket reicht, kein WordPress nötig. `install.php` prüft das beim Aufruf automatisch (siehe Schritt 3) und warnt, falls etwas fehlt.

**Fällt der Umgebungscheck in Schritt 3 rot aus und lässt sich der Hoster nicht wechseln:** die **lokale Variante** nutzen (`dist/alleycat-dispatch-local.html`, läuft komplett im Browser als SQLite-Datenbank, keine Server-Voraussetzungen) — dafür braucht es nichts von diesem Guide hier.

---

### <img src="install-guide/step-1-datenbank.svg" width="56" align="top"> Schritt 1 — Datenbank + Benutzer anlegen

Im Control-Panel deines Hosting-Anbieters (Plesk, cPanel, IONOS, …) eine **MySQL-Datenbank** und einen **Datenbank-Benutzer** mit Zugriff darauf anlegen — falls nicht ohnehin schon vorhanden. Host, Datenbankname, Benutzername und Passwort notieren, die brauchst du gleich in Schritt 4.

---

### <img src="install-guide/step-2-upload.svg" width="56" align="top"> Schritt 2 — Ordner hochladen

Den kompletten [`php-backend`](.)-Ordner (alle `.php`-Dateien, `.htaccess`, diese Anleitung) per FTP oder dem Dateimanager deines Hosting-Panels auf den Server hochladen — z. B. nach `/php-backend/` innerhalb deines Webspace. Die Reihenfolge der Dateien spielt keine Rolle, nur `install.php` muss zuerst aufgerufen werden (Schritt 3).

---

### <img src="install-guide/step-3-installer.svg" width="56" align="top"> Schritt 3 — Installer aufrufen

`install.php` im Browser öffnen, z. B.:

```
https://deinedomain.tld/php-backend/install.php
```

Zeigt zuerst einen automatischen **Umgebungscheck** (PHP-Version, benötigte Erweiterung, Schreibrechte, `utf8mb4`-Verfügbarkeit u. a.) — bei ✅/⚠️ direkt weiter zu Schritt 4, bei ❌ entweder das gemeldete Problem beheben oder bewusst per Checkbox "Trotzdem installieren" übergehen.

---

### <img src="install-guide/step-4-formular.svg" width="56" align="top"> Schritt 4 — Formular ausfüllen

Die Zugangsdaten aus Schritt 1 eintragen:

| Feld | Typischer Wert |
|---|---|
| Datenbank-Host | meist `localhost` |
| Datenbank-Name | aus Schritt 1 |
| Datenbank-Benutzer | aus Schritt 1 |
| Datenbank-Passwort | aus Schritt 1 |
| Tabellen-Prefix | optional, Standard `alleycat_` |

Absenden — der Installer legt die Tabelle an und generiert einen zufälligen API-Key.

---

### <img src="install-guide/step-5-key.svg" width="56" align="top"> Schritt 5 — API-Endpunkt + Key kopieren

Auf der Erfolgsseite stehen **API-Endpunkt** und **API-Key** — beide jetzt kopieren, der Key wird danach nicht erneut angezeigt (in `config.php` landet nur ein Hash davon, nicht der Key selbst). Beispiel-Endpunkt:

```
https://deinedomain.tld/php-backend/api.php
```

---

### <img src="install-guide/step-6-loeschen.svg" width="56" align="top"> Schritt 6 — install.php löschen

`install.php` versucht sich nach erfolgreicher Installation **selbst zu löschen** — meist ist hier also nichts mehr zu tun. Zeigt die Erfolgsseite stattdessen einen Warnhinweis ("konnte sich nicht selbst löschen"), fehlten die nötigen Schreibrechte — dann `install.php` jetzt manuell per FTP/Dateimanager entfernen, er sollte nicht öffentlich erreichbar bleiben. `config.php` und die übrigen Dateien (`api.php`, `backup.php`, `migrate.php` etc.) bleiben auf dem Server — `config.php` ist bereits über `.htaccess` vor direktem Web-Zugriff geschützt.

---

### <img src="install-guide/step-7-verbinden.svg" width="56" align="top"> Schritt 7 — Mit der App verbinden

Im Repo `node build.js` ausführen und `dist/alleycat-dispatch-server.html` öffnen — beim ersten Start erscheint ein Setup-Screen. Dort API-Endpunkt und API-Key aus Schritt 5 eintragen und auf **Verbinden** klicken. Die Zugangsdaten werden danach lokal im Browser gemerkt (nur der Zugang, nicht die Event-Daten selbst).

Zum späteren Zurücksetzen (z. B. anderes Backend eintragen): die Seite mit `?reset-php-config` an der URL aufrufen.

---

## Fertig

Ab jetzt teilen sich alle Geräte, die die Server-Variante mit denselben Zugangsdaten öffnen, dieselben Events — Organizer und Marshals sehen denselben Stand.

Bei Problemen: siehe [README.md](README.md) für die Datei-Übersicht und was `api.php`/`config.php` genau tun, sowie [COMPATIBILITY.md](COMPATIBILITY.md) für bereits erprobte Hosting-Umgebungen und bekannte Grenzen.

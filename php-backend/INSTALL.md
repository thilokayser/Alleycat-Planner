# Installguide: PHP-Backend einrichten

Schritt-für-Schritt-Anleitung, um die Server-Variante der App mit einem eigenen PHP/MySQL-Backend zu verbinden — für den Einsatz mit mehreren Organizern/Geräten auf demselben Event. Dauert je nach Hosting-Anbieter ca. 5–10 Minuten.

**Voraussetzung:** ein Webspace mit PHP und MySQL (jedes normale Shared-Hosting-Paket reicht, kein WordPress nötig).

---

### <img src="install-guide/step-1-datenbank.svg" width="56" align="top"> Schritt 1 — Datenbank + Benutzer anlegen

Im Control-Panel deines Hosting-Anbieters (Plesk, cPanel, IONOS, …) eine **MySQL-Datenbank** und einen **Datenbank-Benutzer** mit Zugriff darauf anlegen — falls nicht ohnehin schon vorhanden. Host, Datenbankname, Benutzername und Passwort notieren, die brauchst du gleich in Schritt 4.

---

### <img src="install-guide/step-2-upload.svg" width="56" align="top"> Schritt 2 — Ordner hochladen

Den kompletten [`php-backend`](.)-Ordner (diese Datei, `install.php`, `api.php`, `.htaccess`) per FTP oder dem Dateimanager deines Hosting-Panels auf den Server hochladen — z. B. nach `/php-backend/` innerhalb deines Webspace.

---

### <img src="install-guide/step-3-installer.svg" width="56" align="top"> Schritt 3 — Installer aufrufen

`install.php` im Browser öffnen, z. B.:

```
https://deinedomain.tld/php-backend/install.php
```

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

Auf der Erfolgsseite stehen **API-Endpunkt** und **API-Key** — beide jetzt kopieren, der Key wird danach nicht erneut angezeigt. Beispiel-Endpunkt:

```
https://deinedomain.tld/php-backend/api.php
```

---

### <img src="install-guide/step-6-loeschen.svg" width="56" align="top"> Schritt 6 — install.php löschen

**Wichtig:** `install.php` jetzt sofort vom Server löschen (per FTP/Dateimanager). Er hat seine Aufgabe erfüllt und sollte nicht öffentlich erreichbar bleiben. `config.php` und `api.php` bleiben auf dem Server — `config.php` ist bereits über `.htaccess` vor direktem Web-Zugriff geschützt.

---

### <img src="install-guide/step-7-verbinden.svg" width="56" align="top"> Schritt 7 — Mit der App verbinden

Im Repo `node build.js` ausführen und `dist/alleycat-dispatch-server.html` öffnen — beim ersten Start erscheint ein Setup-Screen. Dort API-Endpunkt und API-Key aus Schritt 5 eintragen und auf **Verbinden** klicken. Die Zugangsdaten werden danach lokal im Browser gemerkt (nur der Zugang, nicht die Event-Daten selbst).

Zum späteren Zurücksetzen (z. B. anderes Backend eintragen): die Seite mit `?reset-php-config` an der URL aufrufen.

---

## Fertig

Ab jetzt teilen sich alle Geräte, die die Server-Variante mit denselben Zugangsdaten öffnen, dieselben Events — Organizer und Marshals sehen denselben Stand.

Bei Problemen: siehe [README.md](README.md) für die Datei-Übersicht und was `api.php`/`config.php` genau tun.

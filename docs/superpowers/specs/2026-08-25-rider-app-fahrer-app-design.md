# Rider App — Teilprojekt 2: Fahrer-App (Design)

Stand: 25.08.2026. Zweites von drei Teilprojekten der Rider-App-Initiative. Baut die Oberfläche, die auf dem Fahrer-Handy läuft, und die Druckstücke, die sie überhaupt erst benutzbar machen.

Setzt [Teilprojekt 1](2026-08-25-rider-app-fundament-design.md) voraus (abgeschlossen 25.08.2026): Token-Datenmodell, `rider.php` mit sieben Aktionen, Publish, Merge-Polling, Anmeldungen bestätigen. Alle dort gebauten Server-Aktionen werden hier zum ersten Mal von echten Fahrern benutzt statt von `curl`.

Siehe [CLAUDE.md](../../../CLAUDE.md) für Projektkontext, Modul-Layout und die Storage-Capability-Seams.

## 1. Ziel

Ein Fahrer scannt am HQ seine Spokecard, sieht danach seinen eigenen Fortschritt, und checkt an Checkpoints mit festem QR-Code selbst ein — auch ohne Empfang. Wer eine Wildcard-Karte bekommt, trägt seine Daten selbst ein und wartet auf die Bestätigung des Organizers.

Nach Teilprojekt 2 gilt:

- `dist/alleycat-rider.html` existiert als eigenes, schlankes Bundle und läuft auf einem Handy.
- Spokecards tragen die Token-URL statt der nackten Startnummer, plus einen abtippbaren Rückfallcode. Kein Name.
- Checkpoint-QR-Codes lassen sich als PDF zum Laminieren drucken.
- Check-ins ohne Empfang werden lokal gepuffert und automatisch nachgesendet.
- Die App startet auch ohne Verbindung (Service Worker).

## 2. Nicht-Ziele

- **Kein Zieleinlauf über die App.** Die Zielzeit ist das wertungsrelevanteste Datum des Rennens und bleibt beim Orga-Team am Ziel-Check-in. Ein Handy-Zeitstempel, womöglich Stunden später aus einer Offline-Queue nachgereicht, ist dafür die falsche Quelle.
- **Keine Checkpoint-Karte und kein Live-Leaderboard für Fahrer.** Die Schalter `evt.riderApp.map` und `.leaderboard` existieren seit Teilprojekt 1, bleiben aber wirkungslos. Eigener späterer Roadmap-Punkt.
- **Keine öffentliche Online-Vorab-Registrierung.** Das ist Teilprojekt 3. Hier wird nur die Wildcard-Variante gebaut: Karte in der Hand, Formular in der App.
- **Kein Beamer-Ping.** Teilprojekt 3.
- **Keine Push-Benachrichtigungen.** Der Service Worker dient ausschließlich dem Offline-Start, nicht dem Zustellen von Nachrichten.
- **Keine neue Funktion für die lokale Variante.** Sie bleibt eingefroren; der Spokecard-QR-Inhalt ändert sich dort ausdrücklich **nicht**.

## 3. Die eine bewusste Prinzipienverletzung

Das Projekt liefert bisher **selbstständige Einzeldateien**: `dist/alleycat-dispatch-local.html` und `-server.html` enthalten alles außer den CDN-Bibliotheken. Die Fahrer-App bricht damit, weil ein Service Worker per Spezifikation eine eigene, gleich- oder höherrangig platzierte Datei sein muss — er lässt sich nicht ins HTML einbetten.

Die Fahrer-App besteht deshalb aus **drei** Dateien:

| Datei | Zweck |
|---|---|
| `alleycat-rider.html` | die App selbst, weiterhin in sich geschlossen |
| `alleycat-rider-sw.js` | Service Worker, cacht die HTML-Datei für den Offline-Start |
| `alleycat-rider.webmanifest` | „Zum Startbildschirm hinzufügen", Vollbild ohne Browserleiste |

Ohne die beiden Zusatzdateien funktioniert die App weiterhin — nur eben nicht offline startfähig. Das ist der Rückfallweg, wenn ein Hoster Probleme macht.

**Ausrollen.** `build.js` schreibt alle drei nach `dist/`, wie die anderen Ausgaben auch. Der Nutzer lädt sie in **dasselbe Verzeichnis wie `rider.php`** hoch — nicht, weil die App den Endpunkt relativ auflöst (sie kennt ihn aus der Konfiguration), sondern weil ein Service Worker nur Anfragen unterhalb seines eigenen Pfads abfangen darf. Läge er woanders, cachte er die App nicht. `INSTALL.md` bekommt diesen Schritt plus den HTTPS-Hinweis. Generierte Dateien werden **nicht** nach `php-backend/` geschrieben — das Verzeichnis liegt in Git, `dist/` bewusst nicht.

**Voraussetzung: HTTPS.** Service Worker laufen nur unter TLS (Ausnahme `localhost`). Ein Hoster ohne HTTPS bekommt die App ohne Offline-Start; `INSTALL.md` muss das benennen. Da die Fahrer-App ohnehin Token in der URL trägt, ist HTTPS auch unabhängig davon die richtige Anforderung.

## 4. Bundle-Zuschnitt

### 4.1 Neue Build-Ausgabe

`build.js` bekommt eine dritte Ausgabe. Statt `CORE_FILES` speist sie eine eigene, kurze Liste:

```
RIDER_FILES = [
  'src/core/i18n.js',            // beim Bauen auf die gebrauchten Namensräume gekürzt, siehe 4.3
  'src/core/utils.js',
  'src/core/checkpoint-types.js', // neu, aus checkpoint.js extrahiert
  'src/core/rider-qr.js',         // neu, aus rider-sync.js extrahiert
  'src/rider/state.js',
  'src/rider/api.js',
  'src/rider/queue.js',
  'src/rider/scanner.js',
  'src/rider/views.js',
  'src/rider/init.js'
]
```

Extern nur **jsQR**. Kein Leaflet, kein jsPDF, kein sql.js, kein QRCode.js — der Fahrer erzeugt keine QR-Codes, er liest sie.

### 4.2 Zwei Extraktionen aus dem geteilten Kern

Beide sind reine Verschiebungen ohne Verhaltensänderung, und beide müssen `CORE_FILES` in unveränderter Reihenfolge weiter bedienen.

- **`src/core/checkpoint-types.js`** — `CHECKPOINT_TYPES`, `BUILTIN_CHECKPOINT_TYPE_KEYS`, `getCheckpointType()`, plus das Laden/Speichern eigener Typen. Zieht aus `checkpoint.js` (derzeit ~26 Zeilen ab [checkpoint.js:25](../../../src/core/checkpoint.js:25)) aus. Grund: die Fahrer-App zeigt pro Checkpoint, *was dort zu tun ist* — dafür braucht sie die Typtabelle, nicht die 700 Zeilen Editor-Oberfläche drumherum.
- **`src/core/rider-qr.js`** — `parseRiderQrPayload()`, `buildRiderQrPayload()`, `buildCheckpointQrPayload()`, `RIDER_PUBLIC_ID_RE`, `RIDER_TOKEN_RE`. Zieht aus `rider-sync.js` aus. Grund: der Rest von `rider-sync.js` hängt an `state`, `debouncedSave()` und `logUndoableAction()`, die es im Fahrer-Bundle nicht gibt — ein Mitnehmen der ganzen Datei bräche es.

Nach der Extraktion muss `node build.js --core-hash` sich zwangsläufig ändern (Dateiliste), aber beide `dist/`-Ausgaben müssen **funktional identisch** bleiben: `test-suite.js` ist hier das Gate, nicht der Hash.

### 4.3 Übersetzungen beim Bauen zuschneiden

`i18n.js` ist 1146 Zeilen, `en.json` 55 KB — zusammen rund 110 KB für die etwa 40 Strings, die die Fahrer-App braucht. Das lädt ein Handy genau dort mit, wo die Verbindung am schlechtesten ist.

Lösung: `build.js` wertet das Objektliteral `translations` aus (Zeile 14–1062, reine Daten, keine Funktionsaufrufe) und übernimmt nur eine deklarierte Namensraum-Liste ins Rider-Bundle:

```
RIDER_I18N_NAMESPACES = ['common', 'checkpoint', 'riderScan']
```

**Zwei Namensräume, die man nicht verwechseln darf.** `riderApp` existiert seit Teilprojekt 1 ([i18n.js:1024](../../../src/core/i18n.js:1024)) und enthält ausschließlich **Organizer**-Strings: ausstehende Anmeldungen, das QR-Häkchen, verwaiste Check-ins. Nichts davon gehört ins Fahrer-Bundle. Die Strings der Fahrer-App entstehen neu unter `riderScan` und gehen ausschließlich dorthin. Beide Namen bleiben, weil ein Umbenennen von `riderApp` nur Bewegung im Kern erzeugte, ohne etwas zu klären — der Unterschied gehört stattdessen als Kommentar an beide Stellen in `i18n.js`.

Dasselbe für `en.json` (reines JSON, trivial). Deutsch bleibt die Autorensprache, der englische Abgleich läuft weiter über `src/i18n/en.json` — **eine** Pflegestelle für alle Strings, kein zweites Übersetzungssystem.

Fehlt ein Namensraum in der Liste, obwohl die App ihn nutzt, liefert `t()` den Schlüssel im Klartext zurück. Das ist sichtbar genug, um beim ersten Ausprobieren aufzufallen, aber kein Absturz.

## 5. Datenmodell

### 5.1 Neu auf dem Server: Checkpoint-Typ

Migration `3` ergänzt eine Spalte:

```sql
ALTER TABLE `{p}_rider_checkpoint` ADD COLUMN `cp_type` VARCHAR(32) NOT NULL DEFAULT '';
```

`buildRiderSyncPayload()` überträgt `cp.type` mit, `?a=me` gibt ihn zurück. Der Typ ist kein Geheimnis — er steht ohnehin auf dem gedruckten Manifest in der Hand des Fahrers.

Additiv und mit Default, also unkritisch für bestehende Installationen. Die Migration muss idempotent bleiben; `ADD COLUMN IF NOT EXISTS` ist in MariaDB verfügbar, in MySQL nicht — deshalb vorher gegen `information_schema.COLUMNS` prüfen, wie es der bestehende Migrations-Runner ohnehin erlaubt.

### 5.2 Neu auf dem Gerät: `localStorage` der Fahrer-App

Drei Schlüssel, alle unter dem Präfix `alleycat-rider:`:

```js
'alleycat-rider:session'  // {publicId, riderToken, bib}
'alleycat-rider:cache'    // letzte erfolgreiche ?a=me-Antwort (Event, Checkpoints, Fortschritt)
'alleycat-rider:queue'    // [{clientUuid, publicId, riderToken, cpId, qrToken, lat, lon, scannedAt}]
```

Der Cache ist der Grund, warum die App ohne Netz nicht nur *startet*, sondern auch etwas *zeigt*. Ohne ihn wäre der Offline-Start eine leere Seite mit Fehlermeldung.

### 5.3 Spokecard: Was sich ändert

| | vorher | nachher |
|---|---|---|
| QR-Inhalt | `String(rider.bib)` | `<riderAppUrl>#r.<publicId>.<riderToken>` |
| Name auf der Rückseite | `rider.name` | **entfällt** |
| Rückfallcode | — | `rider.riderCode`, 8 Zeichen, unter dem QR |
| Startnummer | vorhanden | unverändert vorhanden |

**Der QR-Inhalt hängt am Seam.** `riderAppBaseUrl()` leer → weiter `String(rider.bib)`. Die lokale Variante druckt also unverändert weiter, und eine Server-Installation ohne konfigurierte Fahrer-App ebenfalls.

**Der Name entfällt in beiden Varianten.** Das ist eine ausdrückliche Nutzerentscheidung und keine Folge der Fahrer-App: Karten werden vorgedruckt, bevor feststeht, wer sie bekommt.

### 5.4 Der bestehende Marshal-Check-in muss beide Formate lesen

`onQrScanSuccess(data)` in [checkin.js:174](../../../src/core/checkin.js:174) bekommt `parseRiderQrPayload()` vorgeschaltet:

| erkannt | Wirkung |
|---|---|
| `legacyBib` | wie bisher: Startnummer direkt |
| `rider` | lokaler Lookup gegen `rider.riderToken` im Event-Blob — **kein Serverruf** |
| `checkpoint` | Hinweis „das ist ein Checkpoint-Code, keine Spokecard" |
| `null` | bestehende Fehlermeldung |

Der lokale Lookup ist wichtig: der Ziel-Check-in muss auch dann funktionieren, wenn der Orga-Laptop gerade kein Netz hat. Alle Token liegen ohnehin im geladenen Event.

**Alte gedruckte Karten bleiben damit gültig.** Das ist die Zusage, die den Formatwechsel überhaupt vertretbar macht.

## 6. Neuer PDF-Export: Checkpoint-QR-Blätter

Neue Funktion in [export-pdf.js](../../../src/core/export-pdf.js), erreichbar aus dem Manifest-Bereich (Sektion „Drucken"). Nur sichtbar, wenn `riderAppBaseUrl()` nicht leer ist.

Eine Seite pro Checkpoint mit aktivem QR-Check-In:

- großer QR-Code (mindestens 90 mm Kantenlänge — er wird aus Fahrradsattelhöhe bei schlechtem Licht gescannt)
- Checkpoint-Name in großer Schrift
- Eventname klein
- Fußzeile: „Nicht abnehmen — dieser Code gehört zum Rennen"

Checkpoints **ohne** QR-Check-In erscheinen nicht. Gibt es keinen einzigen, weist der Knopf darauf hin, statt ein leeres PDF zu erzeugen.

## 7. Die Fahrer-App

### 7.1 Zustandsmaschine

```
kein Token gespeichert ──scan/code──> ?a=me
                                        │
        ┌───────────────────────────────┼───────────────────────────┐
        │ slotStatus 'confirmed'        │ slotStatus 'free'         │ slotStatus 'pending'
        ▼                               ▼                           ▼
      Home                          Formular ──?a=register──>    Warteansicht
                                                                (pollt alle 30 s)
```

Token unbekannt → Fehleransicht mit Code-Eingabe als zweitem Weg. Fremdes Event → eigene Meldung, kein Serverruf.

### 7.2 Ansichten

**Login.** Großer Scan-Knopf, darunter „Code eintippen" als gleichwertiger Weg — nicht versteckt, denn die Kamera ist der Teil, der am ehesten versagt (Berechtigung verweigert, kaputte Linse, Dunkelheit).

**Formular (Wildcard).** Name (Pflicht), Kontakt, Notfallkontakt, Kategorien falls im Event aktiv. Nach dem Absenden Warteansicht.

**Warteansicht.** „Deine Anmeldung liegt beim Orga-Team." Pollt `?a=me` alle 30 Sekunden; wechselt der Status auf `confirmed`, springt die App selbsttätig auf Home.

**Home.** Kopf mit der eigenen Startnummer, groß — sie wird am Checkpoint vorgezeigt. Darunter die Checkpoint-Liste mit drei Zeilenzuständen:

| Zustand | Darstellung |
|---|---|
| gescannt | Haken, Uhrzeit |
| offen, `qrEnabled` | Typ-Symbol und -Bezeichnung, antippbar zum Scannen |
| offen, ohne `qrEnabled` | Typ-Symbol, Hinweis „beim Personal melden" |

Ganz unten ein großer Scan-Knopf. Warten Uploads, steht dort ein Zähler.

**Scanner.** Vollbild-Kameraansicht mit Rahmen, wie im bestehenden Marshal-Scanner ([checkin.js:526](../../../src/core/checkin.js:526)) — dieselbe jsQR-Schleife (`requestAnimationFrame` über ein `<canvas>`, [checkin.js:172](../../../src/core/checkin.js:172)), deshalb bewusst gleiche Bedienlogik. Die Schleife wird nachgebaut, nicht geteilt: sie hängt in `checkin.js` an `state.qrScannerActive` und dem Organizer-`render()`, und ein Herausziehen brächte den Kern in Bewegung, ohne dass eine zweite Stelle davon profitiert.

**Bestätigung.** Nach erfolgreichem Scan: Checkpoint-Name, Uhrzeit, Haken. Bei gepuffertem Scan zusätzlich „wird gesendet, sobald du Empfang hast" — als Beruhigung, nicht als Warnung.

### 7.3 Der Scan-Ablauf

Die Reihenfolge ist tragend, jeder Schritt setzt den vorigen voraus:

1. jsQR liest den Code, `parseRiderQrPayload()` zerlegt ihn.
2. Ist `kind !== 'checkpoint'` oder passt `publicId` nicht zur Sitzung → Abbruch mit eigener Meldung, **kein Serverruf**.
3. GPS anfordern mit 3 Sekunden Timeout — **nicht blockierend**. Kein Fix, kein Problem.
4. Eintrag mit frisch erzeugter `clientUuid` und `scannedAt` (Gerätezeit) **zuerst in die Queue schreiben**, dann senden.
5. Antwort da → Eintrag aus der Queue streichen, Bestätigung zeigen.
6. Kein Netz oder Fehler → Eintrag bleibt in der Queue, Bestätigung trotzdem zeigen.

**Schritt 4 ist der Punkt, an dem die Zusage steht.** Erst puffern, dann senden — nicht umgekehrt. Stürzt die App zwischen Senden und Antwort ab, ist der Scan trotzdem gesichert. Der `uq_client`-Index auf dem Server macht das doppelte Senden folgenlos.

### 7.4 Offline-Queue

Retry bei drei Auslösern: `online`-Ereignis, Rückkehr in den Vordergrund (`visibilitychange`), Intervall 20 Sekunden. Jeder Versuch trägt dieselbe `clientUuid`, ist also idempotent.

Antworten und ihre Behandlung:

| Antwort | Queue-Eintrag |
|---|---|
| `200 ok` | streichen |
| `200 duplicate` / `already` | streichen — der Server hat ihn bereits |
| `403` (Token ungültig, Checkpoint aus) | streichen, dem Fahrer zeigen |
| `409 race_not_running` | **behalten**, später erneut versuchen |
| Netzwerkfehler, `5xx` | behalten |

`403` wird gestrichen, nicht behalten: ein dauerhaft ungültiger Scan wird durch Wiederholen nicht gültig, und eine Queue, die sich nie leert, ist für den Fahrer beunruhigender als eine ehrliche Fehlermeldung.

`409` dagegen ist ein *zeitlicher* Zustand — das Rennen startet gleich.

### 7.5 Service Worker

Cache-Strategie bewusst schlicht:

- Bei `install`: `alleycat-rider.html` und `alleycat-rider.webmanifest` in einen versionierten Cache legen.
- Bei `fetch` auf das Dokument: **network-first mit Cache-Rückfall.** So bekommt ein Fahrer mit Netz immer die aktuelle Fassung, ein Fahrer ohne Netz die letzte bekannte.
- `rider.php`-Aufrufe **nie** cachen — sie sind der Live-Zustand.
- Cache-Name trägt einen beim Bauen eingesetzten Hash; `activate` löscht alle anderen. Damit gibt es keinen Weg, auf dem ein Fahrer wochenlang eine alte Fassung behält.

## 8. Fehlerfälle

| Fall | Verhalten |
|---|---|
| Kamera verweigert | Code-Eingabe anbieten, Kameraknopf ausgrauen |
| jsQR nicht geladen | Code-Eingabe als einziger Weg, Hinweis |
| Token unbekannt | „Karte nicht erkannt", Code-Eingabe |
| Fremdes Event gescannt | eigene Meldung, kein Serverruf |
| Checkpoint-Code als Login gescannt | „Das ist ein Checkpoint-Code" |
| Spokecard am Checkpoint gescannt | „Das ist deine eigene Karte" |
| `429` Rate-Limit | „Zu viele Versuche, warte kurz" mit Countdown aus `Retry-After` |
| Rennen noch nicht gestartet | Startzeit anzeigen, Scan trotzdem puffern |
| Kein Netz beim App-Start | Cache anzeigen, Banner „offline — Stand von HH:MM" |
| Kein Cache und kein Netz | ehrliche Fehlerseite mit Wiederholen-Knopf |

**Sitzung verloren** (Fahrer löscht Browserdaten): Spokecard erneut scannen. Deshalb behält der Fahrer die Karte während des Rennens — das gehört in die Startbesprechung und in die Doku-Seite.

## 9. Sicherheit und Datenschutz

- Der `riderToken` steht in der URL der Spokecard und im `localStorage`. Er ist ein Vorzeige-Geheimnis: wer die Karte hat, ist der Fahrer. Das entspricht dem physischen Modell und ist Absicht.
- **Kein Fahrername auf der Karte**, weder gedruckt noch im QR — die Karte allein verrät nicht, wem sie gehört.
- Die App zeigt **ausschließlich eigene** Daten. `?a=me` liefert serverseitig nichts anderes (in Teilprojekt 1 geprüft).
- GPS nur mit erteilter Berechtigung, nur zum Scan-Zeitpunkt, kein Verlauf.
- Der Admin-API-Key kommt in der Fahrer-App nicht vor — sie kennt `rider.php` und keine andere Adresse.
- HTTPS ist Voraussetzung, nicht Empfehlung: Token wandern in URL und Anfragen.

## 10. Testplan

### 10.1 `test-suite.js`, lokaler Build

Die Fahrer-App selbst ist dort nicht ladbar. Geprüft wird, was im geteilten Kern liegt:

- Extraktionen brechen nichts: alle bestehenden Checkpoint-Typ-Tests laufen unverändert weiter.
- `parseRiderQrPayload()` nach dem Umzug unverändert (Tests aus Teilprojekt 1 bleiben gültig).
- Marshal-Check-in erkennt beide Spokecard-Formate; die alte nackte Startnummer weiterhin.
- Spokecard-QR-Inhalt hängt am Seam: lokal `String(bib)`, mit Fahrer-App-URL die Token-URL.
- Kein Fahrername im erzeugten Spokecard-PDF.
- Checkpoint-QR-PDF: eine Seite je QR-Checkpoint, keine für die anderen.

### 10.2 Neue Rider-Testsuite

`test-suite-rider.js`, gleiches Muster (Konsolen-Paste, `runRiderTestSuite()`), gegen `dist/alleycat-rider.html`:

- Queue: Eintrag überlebt Reload; Streichen bei `200`, `duplicate`, `403`; Behalten bei `409` und Netzwerkfehler.
- Cache: Start ohne Netz zeigt den letzten Stand plus Offline-Banner.
- Zustandsmaschine: alle vier `slotStatus`-Wege.
- Payload-Ablehnung: eigene Spokecard am Checkpoint, fremdes Event, Müll.

### 10.3 Echtes Gerät

Der Teil, den keine Testsuite ersetzt:

1. App auf einem Handy öffnen, Spokecard vom Papier scannen.
2. Flugmodus an, drei Checkpoint-Codes vom Papier scannen — alle drei müssen bestätigt werden.
3. App schließen, erneut öffnen (immer noch Flugmodus): Fortschritt und Queue müssen da sein.
4. Flugmodus aus, warten: alle drei erscheinen im Organizer.
5. Zum Startbildschirm hinzufügen, im Flugmodus von dort starten.

### 10.4 Gate pro Paket

`node build.js` grün (Guard inbegriffen), `test-suite.js` grün im lokalen Build. Der Kern-Fingerabdruck ändert sich in diesem Teilprojekt durch die Extraktionen zwangsläufig — er wird nach dem Extraktionspaket einmal neu gesetzt, danach eingefroren.

## 11. Abnahmekriterien

1. `node build.js` erzeugt drei Ausgaben; beide bestehenden Varianten laufen unverändert, `test-suite.js` grün.
2. Das Rider-Bundle ist kleiner als 150 KB (ohne jsQR).
3. Eine gedruckte Spokecard trägt QR, Startnummer und 8-Zeichen-Code — **keinen Namen**.
4. Eine vor diesem Release gedruckte Karte (nackte Startnummer) funktioniert im Ziel-Check-in weiterhin.
5. Fahrer scannt Spokecard, sieht Startnummer und Checkpoint-Liste.
6. Fahrer scannt einen Checkpoint-Code, Check-in erscheint binnen 5 s im Organizer.
7. Im Flugmodus gescannte Check-ins erscheinen nach Wiederverbindung vollständig, ohne Duplikate.
8. App startet im Flugmodus und zeigt den letzten Stand.
9. Wildcard-Fahrer trägt sich ein, erscheint beim Organizer als ausstehend, wird nach Bestätigung ohne erneutes Scannen freigeschaltet.
10. Checkpoint-QR-PDF druckt eine Seite je QR-Checkpoint.
11. In der lokalen Variante ist keine Rider-Funktion sichtbar, und der Spokecard-QR enthält weiterhin die nackte Startnummer.

## 12. Reihenfolge-Vorschlag für den Plan

Grobschnitt, Feinschliff im Implementierungsplan:

1. **Extraktionen** (`checkpoint-types.js`, `rider-qr.js`) — reine Verschiebung, `test-suite.js` als Beweis. Danach Kern-Fingerabdruck neu setzen.
2. **Build-Ausgabe drei** plus i18n-Zuschnitt, mit einer Platzhalter-App als „Hello World".
3. **Fahrer-App ohne Netz-Feinheiten**: Login, Home, Scan, Bestätigung gegen echtes Backend.
4. **Offline**: Queue, Cache, Service Worker, Manifest.
5. **Druckstücke**: Spokecard-Umstellung, Marshal-Parser, Checkpoint-QR-PDF.
6. **Abnahme** auf echtem Gerät.

Paket 5 bewusst spät: solange die App nicht funktioniert, ändern die neuen Karten nichts zum Guten — und sobald sie geändert sind, sind die alten im Umlauf.

## 13. Danach

Teilprojekt 3: Beamer-Ping auf der Kartenansicht, öffentliche Online-Vorab-Registrierung mit selbst gewählter Startnummer.

Später vorgemerkt, nicht terminiert: Checkpoint-Karte und Live-Leaderboard in der Fahrer-App (Schalter existieren), Liga-/Saison-Profile über mehrere Events hinweg.

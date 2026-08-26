# `vendor/` — eingebettete Fremdbibliotheken

Hier liegen Bibliotheken, die `build.js` **in** ein Bundle einbettet, statt sie zur Laufzeit von einem CDN zu laden. Die beiden Organizer-Varianten (`dist/alleycat-dispatch-local.html`, `-server.html`) nutzen weiter CDN-Verweise — dieser Ordner ist die Ausnahme für die Fahrer-App.

Die Dateien sind **byte-identisch zum Original**, ohne eingefügten Kommentarkopf. Nur so lässt sich die Prüfsumme unten jederzeit gegen die Quelle nachrechnen; ein noch so gut gemeinter Herkunftsvermerk in der Datei selbst macht genau das unmöglich.

## `jsQR-1.4.0.js`

| | |
|---|---|
| Quelle | `https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js` |
| Version | 1.4.0 (dieselbe, die die Organizer-Templates per CDN laden) |
| Abgerufen | 2026-08-26 |
| Größe | 256.885 Bytes; gzip-komprimiert 56.843 Bytes |
| SHA-256 | `bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859` |
| Lizenz | Apache-2.0 |

**Warum eingebettet und nicht vom CDN:** Die Fahrer-App wird an Checkpoints benutzt, teils mit schlechtem oder keinem Empfang. Bedient der Browser das HTML aus seinem eigenen Cache, während die CDN-Anfrage scheitert, hätte die App genau dann keinen Scanner, wenn sie gebraucht wird. Ein QR-Leser, der von einer Netzanfrage abhängt, ist für diesen Einsatzzweck die falsche Bauweise.

**Warum die Dateigröße irritiert:** Das npm-Paket enthält ausschließlich die unkomprimierte Fassung, eine minifizierte gibt es dort nicht. Über die Leitung gehen aber knapp 57 KB, weil jeder Webserver JavaScript gzip-komprimiert ausliefert — jsDelivr tut es ebenfalls. Für die Bundle-Grenze zählt deshalb die komprimierte Größe. **Voraussetzung:** Der Hoster muss Kompression eingeschaltet haben (Apache `mod_deflate`, nginx `gzip on`) — bei Standard-Shared-Hosting üblich, aber nicht garantiert. Ohne Kompression lädt ein Fahrer-Handy das Bundle in voller Rohgröße.

**Prüfen, ob die Datei unverändert ist:**

```bash
shasum -a 256 vendor/jsQR-1.4.0.js
```

**Aktualisieren:** neue Version herunterladen, Prüfsumme und Größen hier nachtragen, `RIDER_FILES` in `build.js` auf den neuen Dateinamen zeigen lassen, Scanner auf einem echten Gerät testen. Die Version nicht stillschweigend wechseln — der Scanner ist die Kernfunktion der Fahrer-App.

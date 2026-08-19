# Abgleich: Feature-Übergabe vs. tatsächlicher Code-Stand

Stand: 17.08.2026 — Abgleich von `handover/alleycat-dispatch-feature-uebergabe_1.md` gegen den aktuellen Code in `src/` und `php-backend/` (nicht gegen die Doku-Aussagen selbst, sondern direkt gegen den Quellcode geprüft).

*Archiviert (19.08.2026): Snapshot vom 17.08. — für den aktuellen Stand siehe [`../alleycat-dispatch-roadmap-14-23.md`](../alleycat-dispatch-roadmap-14-23.md).*

## Kurzfassung

Abschnitte 0–9 und der Status in Abschnitt 10 sind **zutreffend** — Phasen 0–13 sind vollständig umgesetzt, keine Abweichungen gefunden. Von den vier neuen Phasen (14–17) ist **keine einzige umgesetzt** — das Dokument beschreibt sie korrekt als offen. Die Priorisierung in Abschnitt 11 (Phase 14 zuerst) passt weiterhin zum tatsächlichen Stand: Phase 14 ist die einzige der vier neuen Phasen, die bereits ein paar Teilbausteine im Code hat, auf denen aufgebaut werden kann.

---

## Phasen 0–13: bestätigt umgesetzt

Stichproben direkt im Code (nicht nur in `PROJEKT-UEBERSICHT.md` nachgelesen):

- Alle 26 in Abschnitt 10 implizit vorausgesetzten Module existieren in `src/core/` (`category.js`, `race-state.js`, `dashboard.js`, `rules-engine.js`, `game-modes.js`, `live-sync.js`, `beamer.js`, `beamer-modes.js`, `sound-hook.js`, `data-safety.js`, `offline-tiles.js`, `pdf-blocks.js`, `action-log.js`, `bulk-import.js`, u. a.).
- `test-suite.js`: 103 `check(...)`-Aufrufstellen im Quelltext, die zur Laufzeit (u. a. durch Schleifen über mehrere Fahrer/Checkpoints) auf die in Abschnitt 10 genannte Gesamtzahl von 320+ ausgeführten Einzel-Checks kommen — Zahl ist plausibel, kein Widerspruch.
- `php-backend/`: `install.php`/`api.php` vorhanden, nutzen bereits PDO mit vorbereiteten Statements, `utf8mb4`-Charset und einen 32-Byte-zufälligen API-Key (`bin2hex(random_bytes(32))`) sowie ein `.htaccess` gegen direkten `config.php`-Zugriff — das sind zufällig schon einige der in Phase 14 geforderten Grundlagen, aber eben nicht das eigentliche Härtungspaket (siehe unten).
- Keine offenen Widersprüche zur Abweichungsliste in Abschnitt 10 (Bulk-Import legt tatsächlich automatisch Teams an, Undo-Log ist tatsächlich auf 5 Einträge/laufende Sitzung begrenzt, `src/core/` ist tatsächlich variantenübergreifend identisch).

**Fazit:** Abschnitt 10 des Dokuments ist eine korrekte Bestandsaufnahme, keine Korrektur nötig.

---

## Phase 14 — Backend-Härtung: **nicht umgesetzt**, aber Teilbausteine vorhanden

| Anforderung (14.x) | Code-Realität |
|---|---|
| Pre-Flight-Check vor `install.php` (14.2) | ❌ nicht vorhanden — `install.php` prüft nichts vor dem Schreiben in die DB |
| PHP-Versions-Gate (min. 7.4) | ❌ kein `PHP_VERSION`-Check im Code |
| `utf8mb4` mit Fallback auf `utf8` (14.1) | ⚠️ teilweise — `utf8mb4` wird hart in beiden Dateien verdrahtet (Zeile `install.php:28`, `api.php:51`), aber **kein** Fallback und keine Sichtbarmachung, falls der Host es nicht unterstützt |
| Feature-Detection statt Versionsvergleich (14.3) | ❌ nicht vorhanden (aber auch keine Versions-Vergleiche im Code — neutral) |
| `COMPATIBILITY.md` (14.4) | ❌ Datei existiert nicht im Repo |
| `INSTALL.md`-Mindestanforderungen (14.5) | Nicht geprüft im Detail, aber kein Verweis auf Pre-Flight-Ergebnisse möglich, da Feature fehlt |
| SQL-Injection-Schutz / Prepared Statements (14.6) | ✅ vorhanden — `api.php` nutzt durchgängig `->prepare(...)` |
| `display_errors` in Produktion aus | ❌ kein `ini_set('display_errors', ...)` oder vergleichbares Error-Handling im Code gefunden |
| API-Key ≥32 Byte, zufällig (14.6) | ✅ erfüllt (`bin2hex(random_bytes(32))` = 64 Hex-Zeichen = 32 Byte Entropie) |
| API-Key gehasht in DB | ❌ Key wird als Klartext in `config.php` geschrieben (kein Hashing erwähnt/vorhanden — für dieses Single-Tenant-Modell ggf. auch nicht zwingend nötig, aber vom Dokument gefordert) |
| `.htaccess`-Schutz für Config/`install.php` | ⚠️ teilweise — `.htaccess` schützt `config.php`, aber es gibt **keinen** Hinweis/Mechanismus, `install.php` nach Erstnutzung zu sperren/löschen (nur der Doku-Hinweis „danach löschen") |
| Server-seitiger Backup-Export-Endpoint (14.6) | ❌ kein Export-Endpoint in `api.php` gefunden |
| Migrations-Verifikation (14.6) | ❌ kein Schema-Versions-Mechanismus im Backend erkennbar |
| Race-Condition-Tests / Mini-Lasttest (14.6) | ❌ nicht vorhanden (erwartungsgemäß, da manueller Testschritt, kein Code-Artefakt) |
| Realer Testlauf auf `hasencore.de` (14.7) | ❌ laut Repo-Stand noch nicht durchgeführt (kein `COMPATIBILITY.md`-Eintrag) |

**Fazit:** Phase 14 ist der richtige nächste Schritt — nicht weil nichts existiert, sondern weil das Backend zwar ein paar gute Instinkte hat (Prepared Statements, ordentlicher API-Key, `.htaccess`), aber genau die Dinge fehlen, die die Doku als **Kernstück** bezeichnet: der Pre-Flight-Check und die Fallback-/Transparenz-Mechanik. Die Priorisierung in Abschnitt 11 passt.

---

## Phase 15 — Karten-Erweiterungen: **nicht umgesetzt**

| Anforderung (15.x) | Code-Realität |
|---|---|
| `src/core/zones.js` (generisches Kreis+Polygon-System) | ❌ Datei existiert nicht |
| `src/core/event-locations.js` (HQ/Afterparty) | ❌ Datei existiert nicht, keine `afterparty`/`headquarters`-Location-Logik im gesamten `src/core/` |
| Leaflet.draw als Dependency | ❌ kein `leaflet-draw`/`leaflet.draw` in `templates/` oder `src/` |
| Bezirke-Modus (8. Spielmodus-Preset) | ❌ kein `district`/`bezirk`-Bezug im Code |
| Battle Royale bereits auf neues Zonen-System umgestellt? | ⚠️ **Nein — Battle Royale existiert, aber in der alten, einfacheren Form aus Phase 11**: `zone_active` in `game-modes.js`/`rules-engine.js` arbeitet mit einem einzelnen, aus dem Checkpoint-Centroid berechneten Kreis (`evt.ruleRuntimeState.zoneStage`), nicht mit dem in 15.2 beschriebenen generischen `zones`-Datenmodell (Kreis **und** Polygon, mehrere gleichzeitig aktive Gruppen, manuelle Zonen-Zeichnung). Das ist exakt der Stand, den Abschnitt 15.4 als Ausgangspunkt für die Migration beschreibt („bestehenden Battle-Royale-Code auf das neue Zonen-System umstellen") — die Migration selbst hat noch nicht stattgefunden. |
| Mobile CollapsibleMapPanel (15.9) | ❌ kein `mapCollapsed`/vergleichbarer Toggle-Zustand im Code — die Karte wird auf allen Bildschirmgrößen gleich gerendert |
| Podium-/Afterparty-Beamer-Screen, Aushang-Format A3 | ❌ nicht vorhanden |

**Fazit:** Phase 15 ist komplett offen. Wichtig für die Umsetzungsreihenfolge: da Battle Royale schon existiert (nur eben in der alten Form), ist der Migrationsschritt aus 15.4 real und nicht trivial — bestehende Battle-Royale-Tests in `test-suite.js` müssen beim Umbau auf `zones.js` grün bleiben, das Dokument benennt dieses Regressionsrisiko selbst korrekt.

---

## Phase 16 — Feature-Registry & Settings-Hub: **nicht umgesetzt**

| Anforderung (16.x) | Code-Realität |
|---|---|
| `src/core/feature-registry.js` | ❌ nicht vorhanden |
| Settings-Hub-UI (zentrale Liste aller Features) | ❌ nicht vorhanden — Einstellungen bleiben wie gehabt über mehrere Settings-Bereiche verstreut (Kategorien in `category.js`, Spielmodi im Overview-Tab, Sound-Hook im Overview-Tab, Offline-Cache in Settings) |
| `src/core/empty-states.js` | ❌ nicht vorhanden — leere Zustände (keine Checkpoints, keine Fahrer, Leaderboard vor Rennstart) werden aktuell jeweils individuell in den einzelnen Render-Funktionen behandelt, nicht über eine wiederverwendbare Komponente |
| `src/core/social-share.js` | ❌ nicht vorhanden, kein Canvas-Rendering/Web-Share-API-Code im Repo |

**Fazit:** Vollständig offen, wie im Dokument beschrieben. Kein Vorarbeit-Code vorhanden, auf dem aufgebaut werden könnte — echter Neubau.

---

## Phase 17 — PDF-Baukasten 2.0: **nicht umgesetzt**

| Anforderung (17.x) | Code-Realität |
|---|---|
| `width`/`page_break_before`-Feld an `pdf_blocks` | ❌ nicht vorhanden — `evt.pdfBlocks`-Einträge haben laut `pdf-blocks.js` nur `{id, type, targetDocuments[], enabled, sortOrder, content, config{}}`, kein Breiten-Feld |
| `layoutBlocks()` / Auto-Flow-Rendering | ❌ nicht vorhanden |
| Neue Blocktypen `image`/`table`/`variable_text` | ❌ die 7 bestehenden Typen (`waiver`/`rules`/`sponsors`/`checkpoint_list`/`notes`/`custom_text`/`emergency_info`) sind unverändert, keine der drei neuen Typen im Code |
| Variablen-Interpolation (`{{event.name}}` etc.) | ❌ nicht vorhanden |
| Dokument-Typ-Vorlagen (Default-Blocksets) | ❌ nicht vorhanden |
| Aktuelle Architektur laut `CLAUDE.md` | Bestätigt weiterhin **bewusst linear**: „Deliberately not a full block-driven document renderer... enabled blocks are appended as extra pages" — das ist exakt der Stand, den 17.1–17.2 ablösen sollen. |

**Fazit:** Vollständig offen. Die Migrationshinweise in 17.1 (Default `width: 'full'` für Bestandsdaten, keine optische Veränderung bei bestehenden Events) sind wichtig, weil `evt.pdfBlocks` aus Phase 10 bereits produktiv genutzt wird (kein leeres Feature) — das muss beim Umbau berücksichtigt werden, ist im Dokument aber bereits korrekt adressiert.

---

## Gesamteinschätzung

Das Dokument ist **aktuell und korrekt** — es überzeichnet den Fortschritt nirgends und die Priorisierungslogik in Abschnitt 11 hält einer Code-Prüfung stand. Nichts an den Phasen 14–17 ist bereits (auch nur teilweise) im großen Stil vorgebaut, mit einer Ausnahme, die für die Planung relevant ist:

- **Phase 15 ist kein Neubau, sondern eine Migration.** Battle Royale existiert bereits (Phase 11), nur in einer einfacheren, kreisbasierten Form. Der Umbau auf das generische `zones.js`-System trägt ein reales Regressionsrisiko für bestehende, bereits getestete Funktionalität — das ist beim Anlegen der Phase-15-Checkliste stärker zu gewichten als ein "auf der grünen Wiese"-Feature wie Phase 16.

**Empfehlung für die Reihenfolge, unverändert zu Abschnitt 11:** Phase 14 zuerst (Fundament für beide Server-Roadmap-Punkte), Phase 15 kann parallel/davor laufen (unabhängig vom Server), Phase 16 und 17 sind reine Zusatz-Features ohne Abhängigkeiten — sinnvoll erst nach 14/15, aber technisch jederzeit startbar.

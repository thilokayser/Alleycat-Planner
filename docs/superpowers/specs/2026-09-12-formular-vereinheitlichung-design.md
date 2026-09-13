# Formularelemente vereinheitlichen (Grundschicht + Entrümpelung) — Design

Stand: 12.09.2026. Ausgelöst durch den Screen *Einstellungen → Konto → Benutzer*, der sichtbar aus dem Rahmen fällt: Labels stehen neben statt über den Feldern, Feldbreiten springen, das Rollen-`<select>` ist weiß statt dunkel. Die Ursachensuche zeigte ein Muster, das über diesen einen Screen hinausgeht.

Betrifft **beide Organizer-Varianten** (`base.css` ist geteilt) und **keine** der beiden App-Bundles — Fahrer- und Checkpoint-App haben mit `src/styles/rider.css` ihr eigenes, davon unabhängiges Stylesheet.

## 1. Ausgangslage

Drei Befunde aus der Bestandsaufnahme (Stand 12.09.2026):

**a) Es gibt keine Grundregel für Formularelemente.** `base.css` enthält 34 Input-, 11 Select-, 4 Textarea- und 17 Label-Selektoren. Jeder ist an eine Komponente gebunden (`.cp-edit input[type=text]`, `.settings-body select`, `.riders-count-field input`, …) und wiederholt inhaltlich dieselben Deklarationen. Ein Feld in einem Bereich, für den noch niemand eine Regel geschrieben hat, fällt auf die Browser-Voreinstellung zurück. Genau das ist in der Benutzerverwaltung passiert.

**b) 21 Klassen im Organizer-Markup sind in keinem Organizer-Stylesheet definiert** — 79 Fundstellen. Die drei häufigsten stammen aus der Fahrer-App und sind ausschließlich in `src/styles/rider.css` definiert, die nicht ins Organizer-Bundle gebaut wird: `rider-field` (18×), `rider-note` (4×), `rider-note-error` (4×). Dazu `admin-user-row` (6×), das in **keiner** Datei definiert ist und dessen Layout an Inline-`style`-Attributen hängt.

**c) Fünf Eingabetypen sind nirgends abgedeckt:** `email`, `password`, `url`, `search`, `radio`. Der Outdoor-Modus (`base.css:1818`) zählt die Typen ebenfalls einzeln auf und lässt dieselben aus — ein E-Mail-Feld bleibt dort klein, obwohl der Modus ausdrücklich größere Bedienelemente verspricht.

Insgesamt 196 Formularfeld-Stellen in 20 Dateien, 15 davon mit Inline-`style`.

## 2. Ziel

Ein Formularelement sieht überall in der App gleich aus, **ohne** dass pro Bildschirm eine eigene CSS-Regel geschrieben werden muss. Neue Screens erben das Aussehen; das Fehlerbild der Benutzerverwaltung kann strukturell nicht wieder entstehen.

## 3. Nicht-Ziele

- **Keine neue Komponentenschicht.** Kein `.field`/`.field-row`/`.field-actions`-System, keine Migration aller 196 Stellen. Ohne visuelle Regressionsbasis (siehe [CLAUDE.md](../../../CLAUDE.md), „Test coverage gaps") wäre ein Umbau dieser Größe nicht absicherbar.
- **Keine Design-Änderung.** Ziel ist Gleichheit, nicht ein neues Aussehen. Referenzwerte sind die bereits vorhandenen aus `.settings-form`.
- **Keine Übernahme des Open-Props-UI-Codes.** Die Bibliothek dient als Checkliste für Zustände und Varianten (§4), nicht als Abhängigkeit — das Projekt bleibt bei genau einer bewussten Fremdabhängigkeit (Leaflet, siehe CLAUDE.md).
- **Keine Rollenabhängige Deaktivierung von Feldern.** Dass ein Betrachter Formulare sieht, die er nicht speichern kann, bleibt wie es ist (siehe CLAUDE.md, „Client-side viewer enforcement"). Die `:disabled`-Optik wird lediglich definiert, damit sie stimmt, wenn sie gebraucht wird.
- **Keine Änderung an `rider.css`.** Die beiden App-Bundles bleiben unangetastet.

## 4. Zustände und Varianten — Checkliste

Abgeglichen gegen [Open Props UI](https://github.com/felix-bohlin/ui) (`text-field.css`, `select.css`, `form.css`), weil deren Abdeckung ein brauchbarer Vollständigkeitsmaßstab ist:

| Open Props UI | Bei uns heute | Entscheidung |
|---|---|---|
| Fokusring (`:focus-within`, Outline-Offset) | globaler `:focus-visible` (`base.css:41`) | vorhanden, bleibt; Offset in dichten Zeilen prüfen |
| Hover auf dem Feldrand | nichts | übernehmen, dezent |
| `:disabled` (Deckkraft, `not-allowed`) | nur Buttons | übernehmen |
| `:read-only` | nichts — der Checkpoint-Zugangscode ist `readonly` und wirkt editierbar | übernehmen |
| `:user-invalid` / `[data-invalid]` | nichts | `:user-invalid` übernehmen (greift erst nach Eingabe, nicht beim Öffnen), Farbe `var(--stamp)` |
| Pflichtfeld-Sternchen | nichts | nein — kaum `required` im Markup |
| Größenvariante (`ui-small`) | Breiten je Komponente | nein — der Outdoor-Modus ist bereits die Größenachse |
| Hilfetext (`ui-end-text`) | 9 fast gleiche Hint-Klassen, 4 Schriftgrößen, 2 Farben | zusammenführen |
| Prefix/Suffix-Icons, `filled`, `spread`, `auto-fit` | nichts | nein |
| Typenliste `date … url, week` | teils unvollständig | als Selektorbasis übernehmen |

## 5. Abschnitt 1 — Grundschicht

Neu in `src/styles/base.css`, direkt nach der `:focus-visible`-Regel.

**Zwei Paletten, nicht eine.** Die Seitenleiste (`.settings-body`, `.cp-edit`, `.cp-order-mode-row`, `.cp-group-by-row`, `.cp-bulk-bar`, `.zone-*`) arbeitet mit den Papier-Tokens `--paper-2` / `--paper-line` / `--ink`, der Hauptbereich (`.settings-form`, `.pdf-block-editor`, `.riders-*`, `.data-safety-row`, `.status-select`) mit den Asphalt-Tokens `--asphalt-2` / `--asphalt-3` / `--chalk`. Eine einzelne Grundregel kann beide nicht bedienen.

Daraus folgt:

1. **Grundregel = Asphalt** (der häufigere Fall), Werte aus `.settings-form` als Vorlage: Barlow 13px, Polsterung `7px 9px`, Radius 2px, Rahmen `1px solid var(--asphalt-3)`, Hintergrund `var(--asphalt)`, Schrift `var(--chalk)`, `width:100%`.
2. **Eine** Kontextregel für die Papier-Seitenleiste, die ausschließlich die drei Farbwerte umbiegt.
3. Vier Zustandsregeln: Hover, `:disabled`, `:read-only`, `:user-invalid`.

Selektorbasis ist die Typenliste, nicht eine Ausschlussliste — damit `range`, `file`, `color`, `checkbox` und `radio` ihre bewusste Sonderbehandlung behalten:

```
input[type=date], input[type=datetime-local], input[type=email], input[type=month],
input[type=number], input[type=password], input[type=search], input[type=tel],
input[type=text], input[type=time], input[type=url], input[type=week],
select, textarea
```

Der Outdoor-Block (`base.css:1818`) bekommt dieselbe Liste.

## 6. Abschnitt 2 — Entrümpelung

Nachdem die Grundschicht steht, verlieren die komponenteneigenen Regeln ihren Zweck, soweit sie nur dasselbe wiederholen. Was bleibt, ist die echte Abweichung.

| Heute | Nachher |
|---|---|
| 49 Feld-Selektoren, davon rund 18 reine Wiederholungen | 1 Grundregel + 1 Paletten-Override + rund 14 echte Abweichungen |
| 17 Label-Regeln, identisch bis auf die Farbe | 2 (Asphalt/Papier) + 1 Ausnahme (`.pdf-block-targets`, Flex-Layout) |
| 9 Hilfetext-Klassen | 2 Regeln als Gruppenselektor, **Klassennamen bleiben** — kein Markup-Anfassen |

Erhalten bleiben unter anderem: `.coord-input` (Breite, 11.5px), `.zone-radius-field input` (60px), `.riders-count-field input` (90px, Mono 14px), `.riders-search-input` (200–320px), `.status-select` und `.pdf-block-width-label select` (10.5px Mono), die gestrichelten Notfallkontakt-Felder (`.rider-emergency-input`, `.checkin-emergency-input`).

**Risiko Spezifität.** Heute gewinnt jede Komponentenregel gegen eine globale. Fällt ein Duplikat weg, greift die Grundschicht; bleibt eine Regel wegen einer Breite stehen, darf sie nicht nebenbei Farben mitführen, sonst friert sie den alten Zustand ein. Deshalb wird **pro Region** gelöscht, gebaut und angesehen — nicht in einem Rutsch.

## 7. Abschnitt 3 — Tote Klassen

Wird **nach** den Abschnitten 1 und 2 neu vermessen: Sobald jedes nackte `input`/`select` eine Grundregel hat, erledigen sich mehrere Einträge von selbst. `workspace-dropdown` (Org-Auswahl in der Kopfzeile) ist so ein Fall — ein unformatiertes `<select>`, das danach nichts mehr braucht.

Vier Gruppen mit Entscheidung:

| Klasse | Stellen | Vorgehen |
|---|---|---|
| `rider-field` | 18, alle `ui-headquarter.js` | Die sechs Admin-Abschnitte auf `.settings-form` + `.row2` + `.form-actions` umbauen |
| `admin-user-row` | 6, je mit Inline-`style` | Echte Klasse in `base.css` (Rahmen, Radius, Polsterung), Inline-Styles entfernen |
| `rider-note` / `rider-note-error` | 4 + 4 | Umbenennen in `.inline-note` / `.inline-note-error`, in `base.css` definieren — der Name „rider" ist im Organizer irreführend |
| `orga-pin-row` | 1 | Klasse behalten (JS-Hook **und** in `test-suite.js` referenziert), nur Layout-Regel ergänzen |

**Messergebnis (nach Bildschirm-Sichtung, 2026-09-12):** Alle 13 Klassen sind wirkungslose Marker ohne sichtbaren Defekt. Keine braucht eine Regel, keine wird entfernt.

| Klasse | Grund |
|---|---|
| `orga-pin-row` | Markup ist `class="zone-row orga-pin-row"`; `.zone-row` liefert das Layout. Die geplante Regel wäre Fehler gewesen (Konkurrenz mit `.zone-row`). Klasse bleibt: JS-Hook in `src/core/map.js:399`, Test-Referenz. |
| `geo-import-row` | sitzt auf `.zone-row` |
| `category-group-row` | sitzt auf `.type-row` |
| `beamer-points-table` | sitzt auf `.beamer-lb-table` |
| `documentation-section` | sitzt auf `.settings-section` |
| `event-settings-drawer` | sitzt auf `.settings-section` |
| `feature-registry-section` | sitzt auf `.settings-section` |
| `game-modes-panel` | sitzt auf `.settings-section` |
| `beamer-lb-name`, `beamer-lb-time`, `beamer-lb-progress` | `<td>`-Zellen in `.beamer-lb-table`; `td` ist generisch formatiert (Polsterung, 18px, `--chalk`), Nachbarn wie `.beamer-lb-rank` haben bewusst eigene Regeln, diese drei nicht. |
| `overview-widget-body` | Struktur-Wrapper in `.overview-widget` |
| `overview-cp-load-name` | Struktur-Wrapper in `.overview-cp-load-row`; Optik kommt von Nachbarn (`.overview-cp-load-count`) und Header (`h3`). |

Zwölf der dreizehn Klassen haben null JS- oder Test-Hooks; nur `orga-pin-row` wird abgefragt. Entfernen wäre Änderungsrauschen in sechs Dateien ohne sichtbare Wirkung, deshalb bleiben die Namen als lesbare Marker stehen.

**Anmerkung zu Step 3:** Die in der Anforderung geplante CSS-Regel für `orga-pin-row` wurde bewusst nicht hinzugefügt. Das Element trägt bereits das korrektes Layout von `.zone-row`; die geplante Regel hätte konkurriert und die Kartenleiste verändert (Defekt statt Markierung).

**Unangetastet**, weil reine JS-Hooks ohne Optik: `admin-assign-cp`, `newcatgroup-option-input`, `leaderboard-search-input`.

## 8. Absicherung

Es gibt keine visuelle Regressionsbasis. Ersatzweise:

1. Pro Region bauen (`node build.js`) und im Docker-Organizer ansehen (`docker/`, Port 8083) — nicht erst am Ende.
2. Screenshots vorher/nachher für: Benutzerverwaltung, Checkpoint-Editor, Fahrerliste, Manifest, Check-in, Datensicherheit, Spielmodi, Bulk-Import.
3. Beide Themes **und** den Outdoor-Modus prüfen; die Paletten-Trennung aus §5 ist genau dort empfindlich.
4. `test-suite.js` gegen den lokalen Build. Einzige berührte Klasse mit Testbezug: `orga-pin-row`.
5. Lokale Variante gegenprüfen — die CSS ist geteilt, und `node build.js --core-hash` deckt sie **nicht** ab (der Fingerabdruck bildet nur `CORE_FILES`, also JavaScript).

## 9. Offene Punkte

- Der genaue Hover-Effekt (Randfarbe vs. leichte Hintergrundaufhellung) wird beim ersten Durchgang am Bildschirm entschieden, nicht vorab festgelegt.
- Ob die Prüfliste aus §7 in denselben Durchgang gehört oder eine eigene Aufgabe wird, entscheidet ihr Ergebnis: mehr als zwei oder drei echte Nacharbeiten sprechen für eine eigene Runde.

## 10. Offene Restpunkte nach der Umsetzung

Aus dem Schluss-Review des ganzen Branches, bewusst nicht mehr angefasst — keiner ist sichtbar, alle sind hier festgehalten:

- **Zustandsregeln ohne Typenliste.** `input:disabled` und `input:user-invalid` in `base.css` tragen keine `:is()`-Einschränkung und greifen damit auch auf `checkbox`, `radio`, `color`, `file` und `range` — die fünf Typen, die der Kommentar darüber ausdrücklich ausnimmt. Wirkung ist harmlos (Deckkraft, Rahmenfarbe), aber Code und Kommentar widersprechen sich.
- **Drei tote Farbdeklarationen in der Seitenleiste.** `.zone-name-input`, `.event-loc-notes` und `.logistics-speed-row input` deklarieren weiterhin `border`/`background`/`color` in Papier-Tokens, die der `.sidebar`-Override ohnehin liefert. Gleiche Werte, also kein sichtbarer Unterschied — die Entrümpelung ist in dieser Region nur halb gemacht.
- **Zwei Hint-Klassen mit palettenfremder Nutzung.** `.riders-hint` steht in der Asphalt-Gruppe, wird aber an fünf Stellen in der Papier-Seitenleiste gerendert (Kontrast dort 2,77:1 bei 10.5px, unter AA); `.settings-hint` steht in der Papier-Gruppe und wird auf Asphalt-Flächen benutzt (4,74:1, besteht). Beide Farbzuordnungen sind unverändert übernommen, aber die Gruppierung nach Palette behauptet jetzt eine Trennung, die diese zwei nicht einhalten.
- **`type="url"` ist strenger als der Speicherpfad.** `submitRiderAppUrl()` trimmt und speichert nur, also wird `meinhost.de/rider` gespeichert, aber rot als `:user-invalid` markiert. Der Einrichtungsbildschirm in `storage-server.js` benutzt für denselben Wert weiterhin `type="text"`.
- **`.admin-user-row-sub` wird nur in den Einladungszeilen benutzt**, die Benutzerzeilen tragen an derselben Stelle noch ein Inline-`style` mit identischen Werten.
- **Rahmenkontrast.** Die Feldgrenze liegt in allen sechs Themes bei 1,2–1,3:1 gegen den Feldhintergrund, unter den 3:1 aus WCAG 1.4.11 für Bedienelement-Grenzen. Der Wert stammt unverändert aus `.settings-form`; neu ist nur seine Reichweite. Zu beheben wäre er am Token `--asphalt-3`, nicht an dieser Grundschicht.

Außerdem beim Abnahmelauf aufgefallen, unabhängig von diesem Vorhaben: `formatMinutesAgo()` in `src/core/data-safety.js` rundet mit `Math.round`, wodurch ein 30–59 Sekunden alter Zeitstempel als „vor 1 Min." statt „gerade eben" erscheint — die Ursache des bekannten Test-Wacklers.

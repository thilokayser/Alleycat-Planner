# Formularelemente vereinheitlichen — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Formularelemente sehen im gesamten Organizer gleich aus, ohne dass pro Bildschirm eine eigene CSS-Regel nötig ist.

**Architecture:** Eine Grundschicht in `src/styles/base.css` deckt alle Texteingabetypen, `select` und `textarea` ab; eine einzige Kontextregel biegt für die Papier-Seitenleiste die drei Farbwerte um. Danach fallen die komponenteneigenen Regeln weg, soweit sie dasselbe wiederholen, und das Markup der Admin-Bildschirme wandert von undefinierten Klassen auf die vorhandenen Muster `.settings-form` / `.row2` / `.form-actions`.

**Tech Stack:** Plain CSS (keine Präprozessoren, kein Bundler), plain JS in `src/core/*.js`, Build über `node build.js`. Geprüft wird im Browser gegen die Docker-Umgebung in `docker/`.

**Spec:** [docs/superpowers/specs/2026-09-12-formular-vereinheitlichung-design.md](../specs/2026-09-12-formular-vereinheitlichung-design.md)

## Global Constraints

- **Niemals `dist/*.html` bearbeiten.** Alle Änderungen in `src/` oder `templates/`, danach `node build.js`.
- **Kein neues Framework, keine neue Abhängigkeit.** Open Props UI ist Checkliste, nicht Bibliothek.
- **Keine Design-Änderung.** Referenzwerte sind die vorhandenen aus `.settings-form`: `'Barlow',sans-serif`, 13px, Polsterung `7px 9px`, Radius 2px.
- **Zwei Paletten:** Hauptbereich `--asphalt` / `--asphalt-3` / `--chalk`, Seitenleiste (`.sidebar`) `--paper-2` / `--paper-line` / `--ink`.
- **Sichtbares Browser-Pane erforderlich**, sobald `test-suite.js` läuft — bei eingeklapptem Pane sind `innerWidth/innerHeight` 0 und Leaflet wirft `NaN` (siehe CLAUDE.md).
- **`node build.js --core-hash` deckt CSS nicht ab** (nur `CORE_FILES`, also JavaScript). Die lokale Variante hängt an Sichtprüfung und `test-suite.js`.
- **Es gibt keine visuelle Regressionsbasis.** Jede Aufgabe endet deshalb mit einer benannten Sichtprüfung, nicht mit einem grünen Testlauf.
- **UI-Texte immer über `t('namespace.key')`.** Dieser Plan ändert keine Texte; falls doch einer nötig wird: deutsch, `src/i18n/en.json` **nicht** anfassen.

### Wie in diesem Plan geprüft wird

Für CSS gibt es in diesem Projekt keine Unit-Tests. Jede Aufgabe benutzt stattdessen drei Prüfmittel:

1. **Maschinell:** `grep`-Zusicherungen (eine Klasse kommt nicht mehr vor, eine Regel steht genau einmal) und `node build.js` ohne Fehler.
2. **Visuell:** benannte Bildschirme im Docker-Organizer ansehen, vorher/nachher vergleichen.
3. **Funktional:** `test-suite.js` in der Browser-Konsole, `runAlleycatTestSuite()`.

Docker-Umgebung starten (falls nicht schon läuft):

```bash
cd docker && docker compose up -d
```

Nach jedem `node build.js` die kopierten HTML-Dateien im Container auffrischen:

```bash
cd docker && docker compose restart web83
```

Organizer: `http://localhost:8083/alleycat-dispatch-server.html` — Anmeldung mit dem Konto, das `install.php` angelegt hat.

## File Structure

| Datei | Verantwortung in diesem Vorhaben |
|---|---|
| `src/styles/base.css` | Grundschicht, Paletten-Override, Zustände, Entrümpelung, neue Klassen `.admin-user-row`, `.inline-note` |
| `src/core/ui-headquarter.js` | Markup der Admin-Bildschirme: `rider-field` → `.settings-form`, Inline-Styles → Klassen, `rider-note` → `.inline-note` |
| `src/core/map.js` | einzige Fundstelle `orga-pin-row` (Layout-Regel, Klasse bleibt) |
| `docs/superpowers/specs/2026-09-12-formular-vereinheitlichung-design.md` | Nachtrag der Entscheidungen aus Aufgabe 7 |

---

### Task 1: Grundschicht und Zustände

**Files:**
- Modify: `src/styles/base.css:41` (direkt nach der `:focus-visible`-Regel einfügen)
- Modify: `src/styles/base.css:1818-1821` (Outdoor-Typenliste)

**Interfaces:**
- Produces: eine Grundregel für `input:is([type=date],…,[type=week]), select, textarea`; Folgeaufgaben dürfen sich darauf verlassen, dass ein Feld **ohne** eigene Klasse bereits korrekt aussieht.
- Produces: Kontextregel `.sidebar :is(…)` für die Papier-Palette.

- [ ] **Step 1: Ausgangszustand festhalten**

Docker starten, anmelden, zu *Einstellungen → Konto → Benutzer* gehen und einen Screenshot machen. Derselbe Screenshot dient in Schritt 5 als Vergleich. Zusätzlich `#/instance` (Instanz-Panel) und den Checkpoint-Editor (Seitenleiste) aufnehmen — Letzterer ist die Papier-Palette und darf sich **nicht** verändern.

- [ ] **Step 2: Grundschicht einfügen**

In `src/styles/base.css` direkt nach der Zeile mit `:focus-visible{outline:2px solid var(--hivis); outline-offset:2px;}` einfügen:

```css
  /* ---------- Formular-Grundschicht ----------
     Eine Regel für alle Texteingaben, Auswahlfelder und Textbereiche, damit
     ein neuer Bildschirm nichts mitbringen muss, um richtig auszusehen.
     Vorher hing das Aussehen an rund 50 komponenteneigenen Regeln; wo keine
     existierte, erschienen Browser-Voreinstellungen (siehe Spec §1).

     Typenliste statt Ausschlussliste: checkbox, radio, color, file und range
     haben bewusst eigene Behandlung und dürfen hier nicht hineinrutschen.
     Die Liste ist von Open Props UI übernommen (text-field.css). */
  input:is([type=date],[type=datetime-local],[type=email],[type=month],[type=number],[type=password],[type=search],[type=tel],[type=text],[type=time],[type=url],[type=week]),
  select, textarea{
    width:100%;
    font-family:'Barlow',sans-serif; font-size:13px;
    border:1px solid var(--asphalt-3); background:var(--asphalt); color:var(--chalk);
    border-radius:2px; padding:7px 9px;
  }
  textarea{resize:vertical; min-height:44px;}

  /* Die Seitenleiste fährt die Papier-Palette (siehe .sidebar). Hier nur die
     drei Farbwerte umbiegen — Schrift, Polsterung und Radius erbt sie. */
  .sidebar input:is([type=date],[type=datetime-local],[type=email],[type=month],[type=number],[type=password],[type=search],[type=tel],[type=text],[type=time],[type=url],[type=week]),
  .sidebar select, .sidebar textarea{
    border-color:var(--paper-line); background:var(--paper-2); color:var(--ink);
  }

  /* Zustände. Der Fokusring kommt vom globalen :focus-visible oben.
     :read-only bewusst ohne select — ein select ist laut Spezifikation immer
     :read-only, die Regel würde sonst jedes Auswahlfeld abdunkeln. */
  input:is([type=date],[type=datetime-local],[type=email],[type=month],[type=number],[type=password],[type=search],[type=tel],[type=text],[type=time],[type=url],[type=week]):hover:not(:disabled),
  select:hover:not(:disabled), textarea:hover:not(:disabled){
    border-color:var(--steel);
  }
  input:disabled, select:disabled, textarea:disabled{
    opacity:0.5; cursor:not-allowed;
  }
  input:read-only:not([type=checkbox]):not([type=radio]), textarea:read-only{
    background:var(--asphalt-2); color:var(--steel); cursor:default;
  }
  .sidebar input:read-only:not([type=checkbox]):not([type=radio]), .sidebar textarea:read-only{
    background:var(--paper); color:var(--paper-muted);
  }
  /* :user-invalid statt :invalid — meldet erst nach einer Eingabe, nicht
     schon beim Öffnen eines leeren Pflichtfelds. */
  input:user-invalid, select:user-invalid, textarea:user-invalid{
    border-color:var(--stamp);
  }
```

- [ ] **Step 3: Outdoor-Typenliste angleichen**

In `src/styles/base.css` den Block ab `:root[data-theme="outdoor"] input[type=text]` (rund Zeile 1818) ersetzen durch:

```css
  :root[data-theme="outdoor"] input:is([type=date],[type=datetime-local],[type=email],[type=month],[type=number],[type=password],[type=search],[type=tel],[type=text],[type=time],[type=url],[type=week]),
  :root[data-theme="outdoor"] select,
  :root[data-theme="outdoor"] textarea{font-size:14.5px; min-height:44px; border-width:2px;}
```

- [ ] **Step 4: Bauen**

```bash
node build.js && cd docker && docker compose restart web83
```

Erwartet: Build meldet vier Dateien, kein Fehler des Core-Guards.

- [ ] **Step 5: Sichtprüfung**

Im Organizer nachsehen:

- *Einstellungen → Konto → Benutzer*: SMTP-Felder und Fahrer-App-Adresse jetzt volle Breite, dunkler Hintergrund; Rollen-`select` nicht mehr weiß.
- Checkpoint-Editor (Seitenleiste): **unverändert** gegenüber dem Screenshot aus Schritt 1. Wenn dort etwas dunkel wird, greift die `.sidebar`-Regel nicht — prüfen, ob das Element wirklich innerhalb von `.sidebar` liegt.
- Checkpoint-Editor → Zugangscode für Personal (`readonly`-Feld): jetzt abgesetzt, nicht mehr wie ein Eingabefeld.
- Einstellungen → Design → Outdoor-Modus einschalten: SMTP-Felder werden größer (vorher blieben E-Mail- und Passwortfeld klein).

- [ ] **Step 6: Funktionsprüfung**

`test-suite.js` in die Konsole des sichtbaren Panes einfügen, `runAlleycatTestSuite()` aufrufen. Erwartet: keine neuen Fehlschläge gegenüber dem bekannten Stand (zwei bekannte Wackelkandidaten laut CLAUDE.md: `formatMinutesAgo erkennt "gerade eben"` und `selectCp (inkl. Karten-Zentrierung)`, beide bestehen im zweiten Lauf).

- [ ] **Step 7: Commit**

```bash
git add src/styles/base.css
git commit -m "feat: add base layer for form controls"
```

---

### Task 2: Duplikate im Hauptbereich entfernen

**Files:**
- Modify: `src/styles/base.css` — `.settings-form` (≈196-207), `.pdf-block-editor input[type=text]` (≈739), `.riders-search-input` (≈866), `.riders-search-sort-row select` (≈871), `.team-scoring-mode-row select` (≈941), `.checkin-joker-row select` (≈792), `.data-safety-row input[type=number]` (≈1574), `.bulk-import-mapping-grid select` (≈1590)

**Interfaces:**
- Consumes: die Grundregel aus Task 1.
- Produces: `.settings-form` bleibt als **Layout**-Klasse (Karte, Abstände, `.row2`, `.form-actions`) erhalten — Task 6 baut darauf.

- [ ] **Step 1: `.settings-form` auf Layout reduzieren**

Die Regel `.settings-form input[type=text], .settings-form input[type=number]{…}` (≈198-202) **ersatzlos löschen** — Schrift, Rahmen, Hintergrund, Polsterung kommen jetzt aus der Grundschicht. Die Regeln `.settings-form{…}`, `.settings-form label{…}`, `.settings-form .row2`, `.settings-form .row2 > div`, `.settings-form .icon-input`, `.settings-form .checkbox-row`, `.settings-form .form-actions` bleiben unverändert stehen.

- [ ] **Step 2: Die übrigen sieben Regeln auf ihre echte Abweichung kürzen**

- `.pdf-block-editor input[type=text]`: **löschen** (Werte identisch zur Grundschicht bis auf 12.5px/3px Radius — die Abweichung ist nicht beabsichtigt, sondern Streuung).
- `.riders-search-input`: kürzen auf `{flex:1; min-width:200px; max-width:320px;}` — die Breite ist die Abweichung, Farben und Schrift kommen aus der Grundschicht.
- `.riders-search-sort-row select`: **löschen**.
- `.team-scoring-mode-row select`: **löschen**.
- `.checkin-joker-row select`: **löschen**.
- `.data-safety-row input[type=number]`: kürzen auf `{font-family:'IBM Plex Mono',monospace; width:90px;}` — die Mono-Schrift ist hier gewollt (Zahleneingabe in einer Mono-Zeile).
- `.bulk-import-mapping-grid select`: **löschen** (setzte nur `width:100%`, was die Grundschicht bereits tut).

Unangetastet bleiben, weil echte Abweichung: `.riders-count-field input` (90px, Mono 14px), `.status-select` (10.5px Mono), `.pdf-block-width-label select` (10.5px Mono), `.pdf-block-textarea` (Mindesthöhe 70px), `.rider-emergency-input` und `.checkin-emergency-input` (gestrichelter Rahmen), `.coord-input`, `.map-search-box input`, `.leaderboard-search input`, `.cmdp-input`.

- [ ] **Step 3: Bauen und maschinell prüfen**

```bash
node build.js && cd docker && docker compose restart web83
grep -c "font-family:'Barlow',sans-serif" src/styles/base.css
```

Erwartet: Build ohne Fehler; die Zahl der Barlow-Deklarationen ist gegenüber vorher gesunken (vorher notieren, damit der Vergleich möglich ist).

- [ ] **Step 4: Sichtprüfung der betroffenen Bildschirme**

Nacheinander ansehen — jeder muss aussehen wie vorher, nur einheitlicher:

- Fahrer → Fahrerliste (Suchfeld, Sortier-Auswahl, Startnummernzahl)
- Fahrer → Teams (Wertungsmodus-Auswahl)
- Fahrer → CSV-Import (Spaltenzuordnung)
- Check-in (Joker-Auswahl)
- Manifest → PDF-Baukasten (Textfelder, Breiten-Auswahl)
- Einstellungen → Datensicherheit (Zahlenfeld)
- Einstellungen → Kartendesign

- [ ] **Step 5: Commit**

```bash
git add src/styles/base.css
git commit -m "refactor: drop form rules the base layer now covers (main area)"
```

---

### Task 3: Duplikate in der Seitenleiste entfernen

**Files:**
- Modify: `src/styles/base.css` — `.settings-body select, …` (≈493-497), `.cp-edit input…` (≈580-584), `.cp-order-mode-row select` (≈473), `.cp-group-by-row select` (≈677), `.cp-bulk-bar select` (≈517), `.zone-shrink-config select` (≈641), `.zone-radius-field input` (≈636), `.sidebar-head input[type=text]` (≈460)

**Interfaces:**
- Consumes: die `.sidebar`-Kontextregel aus Task 1.

- [ ] **Step 1: Prüfen, dass alle acht Stellen wirklich in der Seitenleiste liegen**

```bash
grep -n "settings-body\|cp-edit\|cp-order-mode-row\|cp-group-by-row\|cp-bulk-bar\|zone-shrink-config\|zone-radius-field\|sidebar-head" src/core/*.js | head -30
```

Erwartet: alle Treffer im Checkpoint-/Karten-Bereich, der innerhalb von `.sidebar` gerendert wird. Findet sich eine Verwendung außerhalb, darf die zugehörige Regel **nicht** gelöscht werden — dann in diesem Task überspringen und in der Commit-Nachricht vermerken.

- [ ] **Step 2: Regeln kürzen**

- `.settings-body select, .settings-body input[type=datetime-local], .settings-body input[type=text], .settings-body input[type=date]`: **löschen** (Grundschicht plus `.sidebar`-Override liefern dasselbe; einzige echte Abweichung war 12.5px statt 13px, das ist Streuung).
- `.cp-edit input[type=text], .cp-edit input[type=number], .cp-edit input[type=tel], .cp-edit textarea, .cp-edit select`: **löschen**. Die Folgezeile `.cp-edit textarea{resize:vertical; min-height:44px;}` ebenfalls löschen — steht jetzt in der Grundschicht.
- `.cp-order-mode-row select`, `.cp-group-by-row select`, `.cp-bulk-bar select`, `.zone-shrink-config select`: **löschen**.
- `.zone-radius-field input`: kürzen auf `{width:60px; font-family:'IBM Plex Mono',monospace; font-size:11px; padding:3px 5px;}` — schmales Zahlenfeld in einer engen Zeile, bewusst kleiner.
- `.sidebar-head input[type=text]`: kürzen auf `{margin-bottom:6px;}` (`width:100%` kommt aus der Grundschicht).

- [ ] **Step 3: Bauen**

```bash
node build.js && cd docker && docker compose restart web83
```

- [ ] **Step 4: Sichtprüfung der Seitenleiste**

Im Karten-Bildschirm prüfen: Checkpoint anlegen und anklicken, Editor öffnen. Kontrollieren: Name, Koordinaten (schmal, Mono), Hinweistext-Textbereich, Typ-Auswahl, Reihenfolge-Auswahl oben, Gruppierung, Zonen-Radius (60px), Suchfeld im Seitenleistenkopf. Alles muss die **helle** Papier-Optik behalten. Ein dunkles Feld heißt: die `.sidebar`-Regel greift nicht, Element liegt außerhalb des Containers.

- [ ] **Step 5: Beide Themes prüfen**

Einstellungen → Design: zwischen den Themes umschalten und die Seitenleiste erneut ansehen. Die Papier-Tokens sind themeabhängig; wenn ein Theme die Seitenleiste dunkel führt, muss die Kontrastprüfung dort ebenfalls stimmen.

- [ ] **Step 6: Commit**

```bash
git add src/styles/base.css
git commit -m "refactor: drop form rules the base layer now covers (sidebar)"
```

---

### Task 4: Labels und Hilfetexte zusammenführen

**Files:**
- Modify: `src/styles/base.css` — 17 Label-Regeln, 9 Hint-Regeln

**Interfaces:**
- Produces: zwei Label-Regeln (Asphalt/Papier) und zwei Hilfetext-Regeln als Gruppenselektor. **Klassennamen bleiben unverändert** — kein Markup wird angefasst.

- [ ] **Step 1: Label-Regeln zusammenfassen**

Die identischen Label-Regeln von `.settings-form label`, `.settings-body label`, `.cp-edit label`, `.cp-order-mode-row label`, `.cp-group-by-row label`, `.riders-count-field label`, `.riders-search-sort-row label`, `.team-scoring-mode-row label`, `.rider-category-field label`, `.spokecard-design label`, `.manifest-settings-image label`, `.checkin-search label`, `.checkin-timing label`, `.checkin-timewindow label`, `.bulk-import-mapping-grid label` löschen und durch zwei Regeln ersetzen, eingefügt direkt unter der Grundschicht aus Task 1:

```css
  /* Feldbeschriftungen: 15 wortgleiche Regeln zusammengeführt. Unterschied
     war allein die Farbe, und die folgt der Palette des Bereichs. */
  .settings-form label, .riders-count-field label, .riders-search-sort-row label,
  .team-scoring-mode-row label, .rider-category-field label, .spokecard-design label,
  .manifest-settings-image label, .checkin-search label, .checkin-timing label,
  .checkin-timewindow label, .bulk-import-mapping-grid label{
    display:block; margin-bottom:3px;
    font-family:'IBM Plex Mono',monospace; font-size:10px;
    text-transform:uppercase; letter-spacing:0.06em; color:var(--steel);
  }
  .settings-body label, .cp-edit label, .cp-order-mode-row label, .cp-group-by-row label{
    display:block; margin-bottom:3px;
    font-family:'IBM Plex Mono',monospace; font-size:10px;
    text-transform:uppercase; letter-spacing:0.06em; color:var(--paper-muted);
  }
```

`.pdf-block-targets label` (Flex-Layout mit Zeigerhand) und `.manifest-settings-cols label` (Flex mit Abstand) bleiben unverändert stehen — das sind echte Abweichungen.

- [ ] **Step 2: Hilfetexte zusammenfassen**

Die Regeln `.settings-hint`, `.addmode-hint`, `.cp-distance-hint`, `.cp-bulk-hint`, `.riders-hint`, `.checkin-confirm-hint`, `.overview-settings-hint`, `.overview-beamer-hint`, `.checkin-search-hint` durch zwei Gruppenregeln ersetzen:

```css
  /* Hilfetexte: neun Klassen mit vier verschiedenen Schriftgrößen und zwei
     Farben, inhaltlich dieselbe Rolle. Namen bleiben, damit kein Markup
     angefasst werden muss. */
  .riders-hint, .checkin-confirm-hint, .overview-settings-hint, .overview-beamer-hint{
    font-family:'IBM Plex Mono',monospace; font-size:10.5px; color:var(--steel); line-height:1.5;
  }
  .settings-hint, .addmode-hint, .cp-bulk-hint, .cp-distance-hint{
    font-family:'IBM Plex Mono',monospace; font-size:10.5px; color:var(--paper-muted); line-height:1.4;
  }
```

Die bisherigen Zusatzangaben dieser Klassen **müssen erhalten bleiben** und wandern in eigene, kurze Folgeregeln:

```css
  .riders-hint{max-width:680px; margin:-6px 0 20px;}
  .riders-hint.warn{color:var(--hivis); font-weight:700;}
  .addmode-hint{margin-top:6px;}
  .cp-bulk-hint{padding:6px 18px 10px;}
  .cp-distance-hint{font-style:italic;}
  .overview-settings-hint{margin-bottom:4px;}
  .checkin-search-hint{font-family:'IBM Plex Mono',monospace; font-size:12px; color:var(--steel); text-align:center; padding:30px 10px;}
```

- [ ] **Step 3: Bauen und prüfen, dass keine Klasse verloren ging**

```bash
node build.js
for c in settings-hint addmode-hint cp-bulk-hint cp-distance-hint riders-hint checkin-confirm-hint overview-settings-hint overview-beamer-hint checkin-search-hint; do
  printf "%-24s css:%s markup:%s\n" "$c" "$(grep -c "\.$c" src/styles/base.css)" "$(grep -rc "$c" src/core/*.js | awk -F: '{s+=$2} END {print s}')"
done
```

Erwartet: jede Klasse hat in `base.css` mindestens einen Treffer. Eine Klasse mit `css:0` und `markup:>0` ist ein Fehler — Regel wieder ergänzen.

- [ ] **Step 4: Sichtprüfung**

Bildschirme mit Hinweistexten ansehen: Karte (Hinweis unter „Checkpoint setzen"), Fahrerliste (Hinweis unter der Toolbar, auch die Warnvariante bei zu wenigen Startnummern), Check-in, Übersicht (Beamer-Kachel), Seitenleiste (Sammelaktionen).

- [ ] **Step 5: Commit**

```bash
git add src/styles/base.css
git commit -m "refactor: merge duplicate label and hint rules"
```

---

### Task 5: `admin-user-row` und `inline-note` zu echten Klassen machen

**Files:**
- Modify: `src/styles/base.css` (neue Regeln)
- Modify: `src/core/ui-headquarter.js:1201`, `:1212`, `:1393`, `:1438`, `:1555`, `:1653` (Inline-Styles), `:1229`, `:1483`, `:1545`, `:1671` (`rider-note`)

**Interfaces:**
- Produces: `.admin-user-row` (Kartenzeile mit Rahmen), `.admin-user-row.compact` (geringere Polsterung), `.inline-note`, `.inline-note-error`.

- [ ] **Step 1: Klassen definieren**

In `src/styles/base.css` am Ende des Einstellungs-Abschnitts einfügen:

```css
  /* Zeilenkarte der Benutzer-, Einladungs- und Org-Listen. Stand bisher
     ausschließlich in Inline-Styles, die Klasse war in keiner CSS-Datei
     definiert. */
  .admin-user-row{
    border:1px solid var(--asphalt-3); border-radius:4px;
    padding:12px 14px; margin-bottom:10px;
  }
  .admin-user-row.compact{padding:10px 14px; margin-bottom:8px;}
  .admin-user-row-head{display:flex; align-items:center; gap:10px; flex-wrap:wrap;}
  .admin-user-row-sub{color:var(--steel); font-size:11px; margin-top:4px;}
  .admin-user-row-meta{color:var(--steel); font-size:12px;}

  /* Hinweiszeile über einem Formular. Hieß im Organizer bisher rider-note,
     obwohl die Regel dazu nur in rider.css steht, die der Organizer nicht
     mitbaut — die Zeile war damit unformatiert. */
  .inline-note{
    font-family:'IBM Plex Mono',monospace; font-size:11.5px;
    color:var(--steel); margin-bottom:10px; line-height:1.4;
  }
  .inline-note-error{color:var(--stamp);}
```

- [ ] **Step 2: Inline-Styles im Markup ersetzen**

An den sechs Fundstellen jeweils `class="admin-user-row" style="border:1px solid var(--asphalt-3); border-radius:4px; padding:12px 14px; margin-bottom:14px;"` ersetzen durch `class="admin-user-row"`. Bei `:1212` (Einladungsliste) und überall dort, wo `padding:10px 14px; margin-bottom:8px;` stand, `class="admin-user-row compact"` verwenden.

Die inneren Inline-Styles mit ersetzen:

- `<div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">` → `<div class="admin-user-row-head">`
- `<div style="color:var(--steel); font-size:11px; margin-top:4px;">` → `<div class="admin-user-row-sub">`
- `<span style="color:var(--steel); font-size:12px;">` → `<span class="admin-user-row-meta">`

`style="margin-left:auto;"` bleibt, wo es steht — das ist Positionierung eines Einzelelements, keine wiederkehrende Komponente.

- [ ] **Step 3: `rider-note` umbenennen**

Alle vier Vorkommen `class="rider-note rider-note-error"` in `src/core/ui-headquarter.js` ersetzen durch `class="inline-note inline-note-error"`.

- [ ] **Step 4: Maschinell prüfen**

```bash
node build.js
grep -c "rider-note" src/core/ui-headquarter.js
grep -c "border:1px solid var(--asphalt-3); border-radius:4px" src/core/ui-headquarter.js
```

Erwartet: beide Zahlen sind `0`.

- [ ] **Step 5: Sichtprüfung**

*Einstellungen → Konto → Benutzer*: Benutzerzeilen und Einladungscode-Zeilen haben weiterhin Rahmen und Abstände. Fehlerfall provozieren: Einstellungen → Konto → Benutzer, „Benutzer anlegen" mit leerem Benutzernamen absenden — die Fehlerzeile erscheint jetzt in Mono und in `--stamp`, nicht mehr als nackter Text. Ebenso `#/instance` (Instanz-Panel).

- [ ] **Step 6: Commit**

```bash
git add src/styles/base.css src/core/ui-headquarter.js
git commit -m "refactor: give admin rows and inline notes real CSS classes"
```

---

### Task 6: Admin-Formulare auf `.settings-form` umbauen

**Files:**
- Modify: `src/core/ui-headquarter.js` — `renderRiderAppUrlSection()` (≈1271-1283), `renderSmtpSection()` (≈1324-1347), Einladungs-Formular (≈1200-1210), Benutzer-Formular (≈1437-1446), Instanz-Panel (≈1673-1677)

**Interfaces:**
- Consumes: `.settings-form`, `.row2`, `.form-actions` aus `base.css` (unverändert seit Task 2).
- Produces: keine neuen Klassen. Nach diesem Task darf `rider-field` im Organizer nicht mehr vorkommen.

- [ ] **Step 1: Fahrer-App-Adresse umbauen**

In `renderRiderAppUrlSection()` den Rumpf ersetzen:

```js
      <div class="settings-form">
        <div>
          <label>${t('phpSetup.riderAppUrlLabel')}</label>
          <input type="url" id="settings-rider-app-url" value="${escapeHtml(riderAppBaseUrl())}" placeholder="${escapeHtml(t('phpSetup.riderAppUrlPlaceholder'))}">
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" onclick="submitRiderAppUrl()">${t('auth.usersSaveButton')}</button>
        </div>
      </div>
```

Der Typwechsel von `text` auf `url` ist beabsichtigt: die Grundschicht deckt `url` ab, und `:user-invalid` markiert damit eine unvollständige Adresse.

- [ ] **Step 2: SMTP-Abschnitt umbauen**

In `renderSmtpSection()` die sechs `rider-field`-Zeilen plus Test-Mail-Zeile ersetzen:

```js
      <div class="settings-form">
        <div class="row2">
          <div><label>${t('auth.smtpHostLabel')}</label>
            <input type="text" id="smtp-host" value="${escapeHtml(cfg.host || '')}"></div>
          <div><label>${t('auth.smtpPortLabel')}</label>
            <input type="number" id="smtp-port" value="${escapeHtml(String(cfg.port || 587))}"></div>
        </div>
        <div class="row2">
          <div><label>${t('auth.smtpUsernameLabel')}</label>
            <input type="text" id="smtp-username" value="${escapeHtml(cfg.username || '')}"></div>
          <div><label>${t('auth.smtpPasswordLabel')}</label>
            <input type="password" id="smtp-password" value="" placeholder="${cfg.password ? escapeHtml(t('auth.smtpPasswordKeepPlaceholder')) : ''}"></div>
        </div>
        <div class="row2">
          <div><label>${t('auth.smtpFromAddressLabel')}</label>
            <input type="email" id="smtp-from-address" value="${escapeHtml(cfg.fromAddress || '')}"></div>
          <div><label>${t('auth.smtpFromNameLabel')}</label>
            <input type="text" id="smtp-from-name" value="${escapeHtml(cfg.fromName || '')}"></div>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" onclick="submitSmtpSettings()">${t('auth.usersSaveButton')}</button>
        </div>
      </div>
      <div class="settings-form">
        <div><label>${t('auth.smtpTestEmailLabel')}</label>
          <input type="email" id="smtp-test-email"></div>
        <div class="form-actions">
          <button class="btn btn-ghost" onclick="submitSmtpTest()">${t('auth.smtpTestButton')}</button>
        </div>
      </div>
```

Die Feld-IDs bleiben exakt gleich — `submitSmtpSettings()` (≈1354-1360) liest sie über `getElementById` und darf nicht angefasst werden.

- [ ] **Step 3: Einladungs-Formular umbauen**

```js
    <div class="admin-user-row">
      <div class="settings-form">
        <div class="row2">
          <div><label>${t('auth.usersRoleLabel')}</label>
            <select id="newinvite-role">${ADMIN_ROLE_OPTIONS.map(r => `<option value="${r}">${escapeHtml(adminRoleLabel(r))}</option>`).join('')}</select>
          </div>
          <div><label>${t('auth.inviteExpiresLabel')}</label>
            <input type="datetime-local" id="newinvite-expires" value="${isFeatureEnabled('invite_default_expiry') ? toLocalDateTimeInputValue(new Date(Date.now() + 7 * 86400000)) : ''}"></div>
        </div>
        <div class="row2">
          <div><label>${t('auth.inviteCountLabel')}</label>
            <input type="number" id="newinvite-count" value="1" min="1" max="50"></div>
          <div><label>${t('auth.inviteNoteLabel')}</label>
            <input type="text" id="newinvite-note" placeholder="${t('auth.inviteNotePlaceholder')}"></div>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" onclick="submitCreateInviteCode()">${t('auth.inviteCreateButton')}</button>
        </div>
      </div>
    </div>
```

- [ ] **Step 4: Benutzer-anlegen-Formular umbauen**

```js
    <div class="admin-user-row">
      <div class="settings-form">
        <div class="row2">
          <div><label>${t('auth.usersUsernameLabel')}</label><input type="text" id="newuser-username"></div>
          <div><label>${t('auth.usersPasswordLabel')}</label><input type="password" id="newuser-password"></div>
        </div>
        <div class="row2">
          <div><label>${t('auth.usersDisplayNameLabel')}</label><input type="text" id="newuser-displayname"></div>
          <div><label>${t('auth.usersRoleLabel')}</label>
            <select id="newuser-role">${ADMIN_ROLE_OPTIONS.map(r => `<option value="${r}">${escapeHtml(adminRoleLabel(r))}</option>`).join('')}</select>
          </div>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" onclick="submitNewUser()">${t('auth.usersSaveButton')}</button>
        </div>
      </div>
    </div>
```

- [ ] **Step 5: Instanz-Panel umbauen**

```js
    <div class="settings-section">
      <h3>${t('instance.createOrgHeading')}</h3>
      <div class="settings-form">
        <div class="row2">
          <div><label>${t('instance.orgSlugLabel')}</label>
            <input type="text" id="instance-new-org-slug" placeholder="${escapeHtml(t('instance.orgSlugPlaceholder'))}"></div>
          <div><label>${t('instance.orgNameLabel')}</label><input type="text" id="instance-new-org-name"></div>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" onclick="submitNewOrg()">${t('instance.createOrgButton')}</button>
        </div>
      </div>
    </div>
```

- [ ] **Step 6: Maschinell prüfen**

```bash
node build.js
grep -c "rider-field" src/core/ui-headquarter.js
grep -n "getElementById('smtp-\|getElementById('newuser-\|getElementById('newinvite-\|getElementById('instance-new-org-" src/core/ui-headquarter.js | wc -l
```

Erwartet: erste Zahl `0`; die zweite unverändert gegenüber vor dem Umbau (die Lesestellen bleiben, weil die IDs gleich blieben).

- [ ] **Step 7: Funktionsprüfung im Browser**

Gegen die Docker-Umgebung, angemeldet als Admin:

1. SMTP-Felder ausfüllen (Host `localhost`, Port 25, Absender `test@example.org`), speichern → Erfolgsmeldung, Seite neu laden, Werte stehen noch da.
2. Benutzer anlegen mit Rolle „Betrachter" → erscheint in der Liste.
3. Einladungscode erzeugen → erscheint in der Liste.
4. `#/instance` → Organisation mit Slug und Name anlegen → erscheint in der Org-Liste.
5. Fahrer-App-Adresse speichern, danach `curl -s "http://localhost:8083/php-backend/auth.php?a=discover"` → `riderAppUrl` enthält den neuen Wert.

- [ ] **Step 8: Commit**

```bash
git add src/core/ui-headquarter.js
git commit -m "refactor: move admin forms onto the settings-form pattern"
```

---

### Task 7: Restliche tote Klassen sichten und entscheiden

**Files:**
- Modify: `src/styles/base.css` (Regel für `orga-pin-row`, je nach Befund weitere)
- Modify: `docs/superpowers/specs/2026-09-12-formular-vereinheitlichung-design.md` (§7, Ergebnis der Prüfliste)

**Interfaces:**
- Consumes: nichts aus vorherigen Tasks außer dem Zustand nach Task 6.

- [ ] **Step 1: Liste neu vermessen**

```bash
for c in overview-widget-body beamer-lb-name beamer-lb-time beamer-lb-progress beamer-points-table category-group-row documentation-section event-settings-drawer feature-registry-section game-modes-panel geo-import-row overview-cp-load-name orga-pin-row workspace-dropdown; do
  printf "%-26s css:%s markup:%s\n" "$c" "$(grep -c "\.$c" src/styles/base.css)" "$(grep -rho "$c" src/core/*.js | wc -l | tr -d ' ')"
done
```

Erwartet: `workspace-dropdown` braucht nach Task 1 keine eigene Regel mehr (ein `select` erbt die Grundschicht). Für alle übrigen mit `css:0` folgt Schritt 2.

- [ ] **Step 2: Jede verbliebene Klasse einmal ansehen**

Pro Klasse den zugehörigen Bildschirm im Browser öffnen und entscheiden — **nur zwei Ausgänge**, keine dritte Möglichkeit:

- Das Element sieht falsch aus → Regel in `base.css` ergänzen.
- Das Element sieht richtig aus (die Optik kommt vom Elternelement) → Klasse aus dem Markup entfernen, sie trägt nichts bei.

Zuordnung Klasse → Bildschirm: `overview-widget-body` → Event-Übersicht; `beamer-lb-*`, `beamer-points-table` → `#/beamer/<event-id>`; `category-group-row` → Fahrer → Kategorien; `documentation-section` → Einstellungen → Dokumentation; `event-settings-drawer` → Karte, Seitenleiste ganz unten; `feature-registry-section` → Einstellungen → Feature-Übersicht; `game-modes-panel` → Einstellungen → Spielmodi; `geo-import-row` → Karte, GPX-Datei hineinziehen; `overview-cp-load-name` → Event-Übersicht, Checkpoint-Auslastung.

- [ ] **Step 3: `orga-pin-row` mit Layout versehen**

Diese Klasse bleibt in jedem Fall im Markup — sie wird in `src/core/map.js:399` per `querySelector` gesucht **und** in `test-suite.js` referenziert. Ergänzen:

```css
  .orga-pin-row{display:flex; align-items:center; gap:6px; margin-bottom:6px; flex-wrap:wrap;}
```

- [ ] **Step 4: Ergebnis in der Spec festhalten**

In `docs/superpowers/specs/2026-09-12-formular-vereinheitlichung-design.md`, Abschnitt 7, die Prüfliste durch das tatsächliche Ergebnis ersetzen: pro Klasse eine Zeile mit „Regel ergänzt" oder „Klasse entfernt".

- [ ] **Step 5: Bauen, prüfen, committen**

```bash
node build.js && cd docker && docker compose restart web83
```

Beamer-Ansicht und Event-Übersicht ansehen, danach:

```bash
git add src/styles/base.css src/core/ docs/superpowers/specs/2026-09-12-formular-vereinheitlichung-design.md
git commit -m "refactor: resolve remaining undefined CSS classes"
```

---

### Task 8: Gesamtabnahme beider Varianten

**Files:**
- Keine Änderung erwartet. Werden hier Fehler gefunden, gehören die Korrekturen in den Task, aus dem sie stammen.

- [ ] **Step 1: Beide Varianten bauen**

```bash
node build.js && node build.js --core-hash
```

Erwartet: vier Dateien, kein Fehler. Der Kern-Fingerabdruck **ändert sich** in diesem Vorhaben, weil Task 5 und 6 `ui-headquarter.js` anfassen und diese Datei zu `CORE_FILES` gehört — eine Abweichung ist hier also kein Alarm. Maßgeblich ist allein, dass der Build durchläuft, also `assertCoreIsBackendAgnostic()` nicht anschlägt.

- [ ] **Step 2: Lokale Variante prüfen**

`dist/alleycat-dispatch-local.html` direkt im Browser öffnen (kein Server nötig). Durchgehen: Dashboard, Karte mit Checkpoint-Editor, Fahrerliste, Check-in, Manifest, Einstellungen. Die Benutzerverwaltung existiert hier nicht (`hasAdminRoles()` ist `false`) — das ist richtig so und kein Fehler.

- [ ] **Step 3: `test-suite.js` gegen die lokale Variante**

Bei **sichtbarem** Browser-Pane einfügen und `runAlleycatTestSuite()` aufrufen. Vorher die Seite neu laden, damit kein Zustand aus vorherigem Konsolengebrauch hineinspielt. Erwartet: dieselben Ergebnisse wie vor der Arbeit.

- [ ] **Step 4: Outdoor-Modus und beide Themes**

In der Servervariante: Einstellungen → Design. Je Theme und zusätzlich mit eingeschaltetem Outdoor-Modus die Benutzerverwaltung und den Checkpoint-Editor ansehen. Kontrollpunkte: Lesbarkeit der Feldschrift, Sichtbarkeit des Feldrahmens, Fokusring erkennbar, Seitenleiste weiterhin in Papier-Optik.

- [ ] **Step 5: Abschlussvergleich**

Die Screenshots aus Task 1, Schritt 1 nebeneinander mit dem jetzigen Zustand legen. Erwartung: Benutzerverwaltung deutlich verändert (das war das Ziel), Checkpoint-Editor und Fahrerliste praktisch unverändert.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: close form styling pass"
```

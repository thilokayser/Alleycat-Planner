# Redesign-Fundament: Signal-Theme + Sidebar-Nav — Design

Stand: 27.08.2026. Erstes von fünf Teilprojekten der Hi-Fi-Redesign-Vorlage aus Claude Design ([`Alleycat Dispatch - Redesign Hi-Fi.dc.html`](https://claude.ai/design/p/f7ccc3bb-c4d7-4eff-8e11-a16f1ce415cd)). Reihenfolge der Teilprojekte: **1. dieses Fundament** (Farben + Typografie + Sidebar-Nav) → 2. Screen-Redesigns (Dashboard/Karten-Editor/Ziel-Check-in/Leaderboard) → 3. neues Feature „Raceday-Vollbild" → 4. Staff-Mobile-Ansicht fürs Ziel-Check-in. Nur Teilprojekt 1 ist Gegenstand dieses Dokuments. Betrifft ausschließlich die Server-Variante (siehe [`docs/alleycat-dispatch-roadmap-14-23.md`](../../alleycat-dispatch-roadmap-14-23.md) — lokale Variante bleibt feature-frozen).

## 1. Ziel

Die Mockup-Bildsprache (Barlow/Barlow Condensed/IBM Plex Mono, Graphit-Hintergrund mit Signal-Orange-Akzent, Papier-Fläche für Gedrucktes/Unterschriebenes) wird neue Standard-Optik der App. Die horizontale Tab-Leiste in der Topbar wird durch eine feste linke Icon-Sidebar ersetzt. Beides gilt themenübergreifend (wie die bestehenden Fonts heute auch), die neue Farbpalette wird ein zusätzliches, standardmäßig aktives Theme.

## 2. Nicht-Ziele

- Keine inhaltliche Neugestaltung einzelner Screens (Dashboard-KPI-Grid, Karten-Inspector, Check-in-Karte, Leaderboard-Tabelle) — das ist Teilprojekt 2.
- Kein neues Feature „Raceday-Vollbild" — Teilprojekt 3.
- Keine mobile Neugestaltung — die bestehende `.bottom-nav` (Icon+Label-Leiste, `ui-headquarter.js:551`) bleibt unverändert; ihr Redesign ist Teil von Teilprojekt 4 (Staff-Mobile).
- **Korrektur während der Umsetzung**: `renderTopbar()` ist Core-Code, gemeinsam für beide Varianten — die Nav-Buttons dort zu entfernen hätte der lokalen Variante jede Desktop-Navigation genommen (Bottom-Nav erscheint nur unter 700px). `templates/local.template.html` bekommt deshalb denselben `#icon-sidebar`+`.app-body`-Umbau wie die Server-Variante (§5) — keine neue Funktion, sondern notwendig, um die bestehende Navigation zu erhalten (CLAUDE.md: „lokale Variante darf nicht regressieren").
- Keine Änderung an den 4 bestehenden Nicht-Standard-Themes (`hell`/`dunkel`/`dracula`/`outdoor`) außer der Font- und Layout-Änderung, die ohnehin themenübergreifend gilt.
- Keine neuen CSS-Variablen für Fonts — Font-Familien bleiben wie heute direkt in Selektoren hartkodiert (siehe §4), da sie nicht pro Theme variieren.

## 3. Farben — neues Theme `signal`

**Neuer Eintrag in `THEMES`** (`src/core/ui-headquarter.js:561`), nach dem Muster der bestehenden 5:
```js
signal: {label: () => t('settings.themeSignalLabel'), desc: () => t('settings.themeSignalDesc'), swatch: ['#0e1113', '#f5f2ec', '#f4762a', '#e05540']}
```

**Neuer Block in `src/styles/themes.css`**, nach dem `outdoor`-Block, Variablennamen 1:1 wiederverwendet (keine Umbenennung nötig — Mapping unten geprüft gegen die tatsächliche Verwendung jeder Variable im bestehenden CSS):
```css
:root[data-theme="signal"]{
  --asphalt:#0e1113; --asphalt-2:#171a1d; --asphalt-3:#1f2327;
  --paper:#f5f2ec; --paper-2:#efe9de; --paper-line:#ddd8cc; --paper-muted:#8a8577;
  --ink:#20211f; --hivis:#f4762a; --hivis-2:#ff9152; --stamp:#e05540;
  --steel:#8b9499; --chalk:#eef0ef; --ok:#2fa46a;
  --warn:#d9a406;
  --tile-underway-bg:#2c3237; --tile-finished-bg:#1e3327; --tile-alert-bg:#3a2422;
}
```
Anmerkungen zum Mapping:
- `--ink` ist die Textfarbe *auf* `--paper`-Flächen (z. B. `.checkin-card` nutzt `color:var(--ink)` auf `--paper`-Hintergrund) — deshalb `#20211f` (dunkel, passend zur hellen Papier-Fläche), **nicht** `#eef0ef`. Die primäre Lesetextfarbe auf dem dunklen Grundhintergrund ist `--chalk` (`#eef0ef`), analog zu den 4 bestehenden Themes.
- `--paper-2`/`--paper-line` im Mockup nicht explizit benannt (nur `--paper` als `#f5f2ec` dokumentiert) — abgeleitet im gleichen Verhältnis wie bei `hell` (`--paper-2` minimal dunkler, `--paper-line` = Bordertyp `#ddd8cc`, im Mockup selbst als Inspector-Border belegt).
- `--tile-underway-bg`/`-finished-bg`/`-alert-bg` (KPI-Kachel-Hintergründe, nur in Teilprojekt 2 sichtbar verwendet) im Mockup nicht spezifiziert — hier as gedeckte Varianten von `--stamp`/`--ok`/`--asphalt-3` abgeleitet, analog zum bestehenden `dunkel`-Theme-Muster; werden in Teilprojekt 2 bei Bedarf feinjustiert.
- `--warn` im Mockup nicht vorhanden — `#d9a406` von `dunkel`/`hell` übernommen (Gelb funktioniert auf Graphit wie auf Papier).

**Default-Theme ändern** (2 Stellen, beide bereits identische Literale):
- `src/core/ui-headquarter.js:29` (State-Literal): `theme: 'feldpost'` → `theme: 'signal'`
- `src/core/ui-headquarter.js:398` (`Object.assign`-Default in `loadAppSettings()`): `theme: 'feldpost'` → `theme: 'signal'`

Bestehende Nutzer mit gespeichertem `appSettings.theme` sind nicht betroffen (`Object.assign(default, JSON.parse(res.value))` — gespeicherter Wert überschreibt Default). Kein `:root{}`-Block-Umbau nötig: `document.documentElement.setAttribute('data-theme', state.appSettings.theme)` (`ui-headquarter.js:405`) setzt das Attribut immer explizit, auch für `signal` — der neue `:root[data-theme="signal"]`-Block matcht unabhängig davon, welches Theme der CSS-Cascade-Default (`:root{}`, weiterhin `feldpost`) ist.

**i18n**: neue Keys `settings.themeSignalLabel`/`themeSignalDesc` (Namespace `settings`, neben den 5 bestehenden `theme*Label`/`theme*Desc`-Paaren).

## 4. Typografie — globaler Font-Wechsel

`Inter` → `Barlow`, `Oswald` → `Barlow Condensed`, `JetBrains Mono` → `IBM Plex Mono`. Gilt für alle 6 Themes (Fonts sind heute schon themenübergreifend, keine Variable nötig).

- **`src/styles/base.css:1`** (`@import`-URL): Google-Fonts-Query auf `family=Barlow:wght@400;500;600&family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap` ändern.
- Jedes hartkodierte `font-family:'Inter'`/`'Oswald'`/`'JetBrains Mono'` in `base.css` (Zeilen 9, 18, 23 und alle weiteren Treffer — `grep -n "font-family:'Inter'\|font-family:'Oswald'\|'JetBrains Mono'" src/styles/base.css` listet alle Stellen) wird 1:1 ersetzt: `Inter`→`Barlow`, `Oswald`→`Barlow Condensed`, `JetBrains Mono`→`IBM Plex Mono`. Reine Suchen-Ersetzen-Operation, keine Selektor-Logik ändert sich.
- Rider-Bundle (`src/styles/rider.css`) bleibt **unverändert** — eigenes Stylesheet, nicht Teil dieses Redesigns (Staff-Mobile-Teilprojekt betrifft die Organizer-App, nicht den Rider-Bundle; falls der Rider-Bundle später mitziehen soll, ist das eine separate Entscheidung).

## 5. Sidebar-Nav statt Topbar-Buttons + kein `.bottom-nav`-Umbau

**Bestehendes Nav-Modell bleibt unverändert**: `getNavItems()` (`ui-headquarter.js:505`) liefert bereits exakt die 6 Zieldestinationen des Mockups (Übersicht/Karte/Fahrer/Ziel/Board/Druck = `overview`/`editor`/`riders`/`checkin`/`leaderboard`/`manifest`). Nur das **Rendering-Ziel** ändert sich — kein neuer State, keine neue Navigationslogik.

**Abweichung vom Mockup (bewusst)**: Das Mockup zeigt zweistellige Mono-Codes (ÜB/KA/FA/ZI/LB/PDF) statt Icons. Die App hat für jeden Nav-Punkt bereits ein SVG-Icon (`getNavItems()`-Objekte, `icon`-Feld) und ein `shortLabel` (bereits für `.bottom-nav` genutzt, z. B. `navCheckinShort`). Die Sidebar nutzt **Icon + `shortLabel`** statt neuer zweistelliger Codes — spart einen neuen i18n-Key-Satz, der pro Sprache uneindeutig zu kürzen wäre (z. B. „Riders"/„Fahrer" beide sinnvoll auf „FA", aber „Leaderboard"/„Board" nicht ohne Weiteres auf 2 Buchstaben), und die Icons existieren bereits produktionsreif. Visuell bleibt der Effekt identisch (kompakte vertikale Icon-Spalte mit aktivem Zustand).

**Neue Container-Struktur** in `templates/server.template.html` (Zeilen 21–79):
- `#app` wird von `flex-direction:column` (aktuell `#app{height:100vh; display:flex; flex-direction:column}`, `base.css:12`) zu `flex-direction:row`.
- Neues Element `<nav class="icon-sidebar" id="icon-sidebar"></nav>` als erstes Kind von `#app`, von `renderTopbar()` befüllt (siehe unten) — voller Höhe (`height:100%`), fixe Breite `84px`, `background:var(--asphalt-2)`, rechter Border `1px solid var(--asphalt-3)`.
- Die bisherigen direkten `#app`-Kinder `.topbar`, `#main`, `.bottom-nav` werden in einen neuen Wrapper `<div class="app-body">…</div>` verschoben (zweites Kind von `#app`, `flex:1; display:flex; flex-direction:column; min-width:0; height:100%`). Reine Verschachtelungs-Änderung im Template, keine der drei Elemente selbst ändert ihre bisherige CSS-Klasse/ID.

**`renderTopbar()`** (`ui-headquarter.js:521`) bekommt eine dritte Ziel-Referenz `iconSidebar = document.getElementById('icon-sidebar')` und befüllt sie parallel zu `bottomNav`:
- Ganz oben immer: Brand-Mark „AC" (wiederverwendet `.brand-mark`, `base.css:35`, dort bereits `background:var(--hivis)` — identisch zum Mockup-Wortmark, keine neue Klasse nötig).
- Solange kein Event geöffnet ist (`state.view === 'dashboard'`) oder in `settings`: Sidebar zeigt nur die Brand-Mark, keine Nav-Items (analog zur heutigen Logik, die `bottomNav.innerHTML = ''` in diesen Fällen setzt).
- Sonst: 6 Items aus `getNavItems()`, gerendert als `.icon-sidebar-item` (Icon + `shortLabel` gestapelt, aktiver Zustand = `background:rgba(244,118,42,.14)` + `box-shadow:inset 2px 0 0 var(--hivis)` + Textfarbe `var(--hivis)`, sonst `var(--steel)` — Werte direkt aus dem Mockup übernommen).
- Danach ein `flex:1`-Spacer, dann ein „⌘K"-Eintrag (`onclick="openCommandPalette()"`, existierende Funktion aus `command-palette.js`) und ein Settings-Eintrag (`onclick="openSettings()"`, ersetzt den bisherigen `#settings-gear-btn`, der aus der Topbar entfernt wird — bisher separates Zahnrad-Icon rechts in der Topbar, `templates/server.template.html:32`).

**Topbar-Inhalt** (`.topbar`, bleibt als Kopfzeile *innerhalb* von `.app-body`, oberhalb von `#main`): behält Event-Name, Status-Badge, Meta-Zeile, Save-Status und Aktions-Buttons — verliert nur die horizontalen Nav-Buttons (`.topbar-nav-buttons`, `ui-headquarter.js:549`) und das Settings-Zahnrad, beide jetzt in der Sidebar. `renderTopbar()`s `actions.innerHTML`-Template (Zeile 545–550) verliert die `<span class="topbar-nav-buttons">`-Zeile.

**`.bottom-nav` unverändert**: bleibt Kind von `.app-body`, Sichtbarkeits-Umschaltung weiterhin über die bestehende `@media (max-width: 700px)`-Regel (`base.css:1503`). Diese Regel bekommt eine Ergänzung `.icon-sidebar{display:none;}`, damit sich Sidebar und Bottom-Nav wie heute Topbar-Buttons und Bottom-Nav gegenseitig ausschließen — keine neue Breakpoint-Logik, nur ein zusätzlicher Selektor in der bestehenden Media-Query.

**Print** (`@media print`, `base.css:1463`): keine Änderung nötig — die bestehende Regel blendet global `body *` aus außer `#print-root`, die neue Sidebar ist davon automatisch erfasst.

## 6. Status-Badge — gefüllter statt getönter Stil

`.status-badge` (`base.css:1174`) wechselt von transluzentem Tint (`background:rgba(...,0.18); color:var(--...)`) zu vollflächiger Füllung mit dunklem Text, exakt nach Mockup-Mapping:
```css
.status-badge.status-planning{background:var(--asphalt-3); color:var(--steel);}
.status-badge.status-ready{background:#6c8cf5; color:var(--asphalt);}
.status-badge.status-running{background:var(--hivis); color:var(--asphalt);}
.status-badge.status-completed{background:var(--ok); color:var(--asphalt);}
```
`#6c8cf5` (Ready-Badge-Hintergrund) ist im Mockup ein eigenständiger, nicht an eine Theme-Variable gebundener Blauton (auch als Sekundärfarbe für die „Gears"-Kategorie verwendet) — hier als Literal übernommen, nicht als neue Variable, da er nur an dieser einen Stelle pro Theme gebraucht wird und in den 4 unveränderten Themes ohnehin nicht referenziert werden soll (die Regel gilt zunächst themenübergreifend mit diesem einen Blauton; falls sich das in Teilprojekt 2 als falsch für z. B. `outdoor` erweist, wird dort nachjustiert). Die bestehende `status-pulse`-Animation auf `.status-running` (Zeile 1180) bleibt erhalten.

`.status-select` (Zeile 1186, das `<select>` für manuellen Statuswechsel) bleibt unverändert — reines Formularelement, kein Mockup-Gegenstück.

## 7. Bereits passende Komponenten (keine Änderung nötig)

Zur Abgrenzung, was in diesem Teilprojekt *nicht* angefasst wird, weil es bereits dem Mockup entspricht:
- `.toggle-switch` (`base.css:1606`) nutzt bereits `var(--hivis)` im aktiven Zustand — identisch zum Mockup-Toggle.
- `.leaderboard-progress-bar`/`-fill` (`base.css:1120`) entspricht bereits Track/Fill-Muster (`--asphalt-3`-Track, `--hivis`-Fill) des Mockups.

## 8. Betroffene Dateien (Zusammenfassung)

| Datei | Änderung |
|---|---|
| `src/core/ui-headquarter.js` | neuer `THEMES.signal`-Eintrag; 2× Default-Theme `feldpost`→`signal`; `renderTopbar()` befüllt zusätzlich `#icon-sidebar`; Topbar-Actions-Template verliert Nav-Buttons+Zahnrad |
| `src/styles/themes.css` | neuer `:root[data-theme="signal"]`-Block |
| `src/styles/base.css` | Font-`@import` + alle `font-family`-Literale ersetzt; `#app` → `flex-direction:row`; neue `.icon-sidebar`/`.icon-sidebar-item`-Klassen; `.status-badge.status-*`-Farben; `.icon-sidebar{display:none}` in bestehender 700px-Media-Query |
| `templates/server.template.html` | `#icon-sidebar`-Element + `.app-body`-Wrapper um Topbar/Main/Bottom-Nav; `#settings-gear-btn` entfernt |
| `templates/local.template.html` | dieselbe `#icon-sidebar`+`.app-body`-Struktur wie oben (Regressionsfix, siehe Nicht-Ziele) — sonst unverändert, lokale Variante bleibt ansonsten feature-frozen |
| `src/core/i18n.js` | `settings.themeSignalLabel`/`themeSignalDesc`, `commandPalette.shortcutHint` |

## 9. Testing

- `node build.js` (baut alle drei Ausgaben) + `node build.js --core-hash` (Kernguard).
- Manuelles Durchklicken aller 6 Sidebar-Ziele in `dist/alleycat-dispatch-server.html`, inkl. Theme-Wechsel in Settings (alle 6 Themes einzeln anwählen, prüfen dass `signal` korrekt lädt und die anderen 5 unverändert aussehen).
- Mobile Breakpoint (< 700px) prüfen: Sidebar verschwindet, Bottom-Nav erscheint wie bisher.
- `test-suite.js` gegen den lokalen Build laufen lassen (muss unverändert grün bleiben — lokale Variante ist von diesem Teilprojekt gar nicht betroffen, dient hier nur als Regressions-Gate laut CLAUDE.md).
- Print-Vorschau eines Manifests prüfen (Sidebar darf nicht mitgedruckt werden — siehe §5).

## 10. Edge Cases

| Fall | Verhalten |
|---|---|
| Nutzer hat manuell ein anderes Theme gespeichert (bestehender Account) | Bleibt unverändert aktiv, `signal` wird nicht erzwungen (siehe §3). |
| `state.view === 'dashboard'` oder `'settings'` (kein Event offen) | Sidebar zeigt nur Brand-Mark, keine Nav-Items — analog zur heutigen `bottomNav.innerHTML = ''`-Logik in `renderTopbar()`. |
| Viewport-Wechsel über die 700px-Grenze zur Laufzeit (Fenster-Resize, nicht nur Rotation) | Rein CSS-gesteuert (Media Query), kein JS-Zustand — funktioniert automatisch wie beim bestehenden Topbar-Buttons/Bottom-Nav-Umschalten. |
| Druckansicht (Manifest/Spokecards/etc.) | Sidebar automatisch ausgeblendet durch bestehende `@media print`-Regel (§5) — kein zusätzlicher Code nötig. |

# Onboarding-Assistent (geführte Tour) — Design

Stand: 25.08.2026. Zweites Teilprojekt der "Erstnutzer-Erfahrung"-Initiative, nach dem [Splashscreen](../../../src/core/splashscreen.js) (Teil 1) und vor der geplanten Dokumentationsseite (Teil 3). Siehe [CLAUDE.md](../../../CLAUDE.md) für Projektkontext und Modul-Layout.

## 1. Ziel

Ein Erstnutzer soll nach dem Splashscreen automatisch eine kurze, geführte Tour durch die sechs Kern-Views der App sehen (Dashboard → Editor → Fahrer → Check-in → Leaderboard → Manifest), anhand des bereits automatisch angelegten Beispiel-Events ("Kölner Kurierrennen"). Die Tour ist reines Zuschauen-und-Weiterklicken (kein Learning-by-Doing), läuft click-gesperrt bis auf die eigene Steuerung, und ist jederzeit über die Einstellungen wiederholbar.

## 2. Nicht-Ziele

- Kein Learning-by-Doing (keine echten Nutzeraktionen werden während der Tour erwartet/validiert).
- Keine Personalisierung der Tour-Inhalte pro Event-Typ oder Feature-Flag-Zustand.
- Keine neue Abhängigkeit (kein CDN-Tour-Framework) — reines CSS/JS, konsistent mit der einzigen dokumentierten Ausnahme (Leaflet.draw, `PROJEKT-UEBERSICHT.md` §9).
- Kein Fix für den Fall "kein Event vorhanden" über die Tour selbst hinaus — sie bricht dann sauber mit einem Hinweis ab, statt selbst ein Event anzulegen.

## 3. Datenmodell

**Neu in `state` (transient, nicht persistiert):**
```js
onboarding: {active: false, stepIndex: 0, eventId: null}
```

**Neu in `state.appSettings` (persistiert, geräte-lokal, gleiches Muster wie `showSplashScreen`):**
```js
onboardingCompleted: false  // Default
```
Muss an beiden bestehenden Stellen ergänzt werden: dem State-Literal (`ui-headquarter.js`) und dem `Object.assign`-Default in `loadAppSettings()` — bestehende Nutzer ohne dieses Feld bekommen automatisch `false` (Tour läuft beim nächsten Splash-Dismiss einmal an), kein Migrationscode nötig.

## 4. Neues Modul `src/core/onboarding.js`

```js
const ONBOARDING_STEPS = [
  {view: 'dashboard', selector: '.event-card', titleKey: 'onboarding.step1Title', textKey: 'onboarding.step1Text'},
  {view: 'editor',    selector: '.cp-list',    titleKey: 'onboarding.step2Title', textKey: 'onboarding.step2Text'},
  {view: 'riders',    selector: '.rider-grid', titleKey: 'onboarding.step3Title', textKey: 'onboarding.step3Text'},
  {view: 'checkin',   selector: '#checkin-bib-input', titleKey: 'onboarding.step4Title', textKey: 'onboarding.step4Text'},
  {view: 'leaderboard', selector: '.leaderboard-table', titleKey: 'onboarding.step5Title', textKey: 'onboarding.step5Text'},
  {view: 'manifest',  selector: '#manifest-content', titleKey: 'onboarding.step6Title', textKey: 'onboarding.step6Text'}
];
```

Kern-Funktionen:
- `findOnboardingTargetEvent()` — sucht in `state.eventsIndex` nach `name === 'Kölner Kurierrennen (Beispiel)'` (demo-event.js:61), Fallback: `eventsIndex[0]`. `null` wenn `eventsIndex` leer. **Invariante für Schritt 1's Selektor** (`.event-card`, generische Klasse ohne `data-event-id`): das gefundene Ziel-Event ist immer entweder das per Namen gefundene Demo-Event (per Seeding-Logik garantiert `eventsIndex[0]`, solange nicht gelöscht/eine andere Reihenfolge erzwungen) oder explizit der Fallback `eventsIndex[0]` — in beiden Fällen ist die erste `.event-card` im DOM (Dashboard rendert `eventsIndex` in Array-Reihenfolge) exakt das Ziel-Event. `document.querySelector('.event-card')` (erstes Match) ist damit korrekt, kein `nth-of-type`/Text-Matching nötig.
- `startOnboardingTour(silent = false)` — bricht ab, wenn kein Ziel-Event existiert; zeigt dabei `showToast({message: t('onboarding.noEventToast')})` (Signatur laut `ui-headquarter.js:89`, nimmt ein Objekt, keinen reinen String), außer `silent` ist `true` (siehe §8, Auto-Start ruft `startOnboardingTour(true)`). Sonst: setzt `state.onboarding = {active: true, stepIndex: 0, eventId: target.id}`, ruft `goToTourStep(0)`.
- `goToTourStep(index)` — Grenzen prüfen (0 ≤ index < 6). Ziel-View bestimmen; falls `state.view !== step.view`, die passende Navigationsfunktion aufrufen:
  - `dashboard` → `goDashboard()`
  - `editor` → `openEditor(state.onboarding.eventId)`
  - `riders`/`checkin`/`leaderboard`/`manifest` → `openRiders()`/`openCheckin()`/`openLeaderboard()`/`openManifest()` (kein Event-Parameter nötig, operieren auf dem von `openEditor()` bereits gesetzten `state.currentEvent`)
  - Danach `state.onboarding.stepIndex = index;` und mit `setTimeout(..., 50)` + `if(state.view !== step.view) return;`-Guard (exakt das Muster aus `openEditor()`, `ui-headquarter.js:277`) `renderOnboardingOverlay()` aufrufen.
- `renderOnboardingOverlay()` — sucht `document.querySelector(step.selector)`; nicht gefunden → bis zu 5× alle 100ms erneut versuchen (`retryFindOnboardingTarget()`), dann ohne Spotlight-Rechteck weitermachen (nur zentrierter Tooltip). Gefunden → `getBoundingClientRect()` + 8px Padding als Spotlight-Rechteck, Tooltip-Position darunter/darüber je nach Platz (siehe §6).
- `advanceOnboardingStep()` / `retreatOnboardingStep()` — Wrapper um `goToTourStep(stepIndex ± 1)`, Buttons im Tooltip.
- `finishOnboardingTour()` / `skipOnboardingTour()` — beide: Overlay ausblenden, `resize`-Listener entfernen, `state.onboarding.active = false`, `state.appSettings.onboardingCompleted = true; saveAppSettings();`. Unterscheiden sich nur im Analytics-losen Sinne (kein Tracking in dieser App) — technisch identisch, zwei benannte Funktionen der Lesbarkeit halber (ein Reviewer soll am Aufrufer sehen, ob reguläs beendet oder übersprungen wurde).

## 5. Integration in bestehende Module

- **`src/core/splashscreen.js`**, `dismissSplashscreen()`: nach `state.view = 'dashboard'; render();` ergänzen um `if(!state.appSettings.onboardingCompleted) startOnboardingTour();`.
- **`src/core/ui-headquarter.js`**: `showSplashScreen`-Default-Objekte (State-Literal + `loadAppSettings()`) um `onboardingCompleted: false` erweitern. Neuer Button „Einführung erneut anzeigen" in `renderSettingsSectionTheme()` direkt unter dem bestehenden Splashscreen-Toggle (`onclick="startOnboardingTour()"`).
- **`build.js`**: `'onboarding.js'` in `CORE_FILES`, direkt vor `'ui-headquarter.js'` (gleiche Position wie `splashscreen.js`).
- **Templates** (`local.template.html`, `server.template.html`): `<div id="onboarding-root" style="display:none;"></div>` neben `#splashscreen-root`.
- **`src/core/i18n.js`**: neuer Namespace `onboarding` mit `step1Title`…`step6Text`, `noEventToast`, `back`, `next`, `finish`, `skip`, `stepCounter` (Platzhalter `{current}`/`{total}`).

## 6. Overlay-Rendering & Interaktionssperre

- `#onboarding-root` enthält bei aktiver Tour: einen vollflächigen `.onboarding-backdrop` (fixed, inset:0, `pointer-events:all`, blockiert jeden Klick auf die App dahinter — deine Entscheidung: komplett gesperrt außer Tour-Steuerung), ein `.onboarding-spotlight`-Element (absolut positioniert exakt über `getBoundingClientRect()` des Ziels + 8px Padding, `box-shadow:0 0 0 9999px rgba(0,0,0,.72)` zur Freistellung, selbst nicht klickbar), und eine `.onboarding-tooltip`-Karte (Titel, Text, Schrittzähler, Zurück/Weiter/Überspringen-Buttons — diese Buttons sitzen *innerhalb* des Overlays und sind damit über dem Backdrop klickbar).
- Tooltip-Position: bevorzugt 16px unterhalb des Spotlight-Rechtecks; passt das nicht in den Viewport (Rechteck-Unterkante + Tooltip-Höhe + 16 > `window.innerHeight`), stattdessen 16px oberhalb. Horizontal an der Spotlight-Mitte ausgerichtet, an den Viewport-Rändern (16px Marge) geklemmt.
- `window.addEventListener('resize', repositionOnboardingOverlay)` während aktiver Tour, entfernt in `finishOnboardingTour()`/`skipOnboardingTour()`.
- Ohne gefundenes Ziel-Element (Fallback nach §4): Spotlight-Element bleibt unsichtbar (`display:none`), Tooltip wird viewport-zentriert.

## 7. CSS (`src/styles/base.css`)

Neue Klassen `.onboarding-backdrop`, `.onboarding-spotlight`, `.onboarding-tooltip`, `.onboarding-tooltip-actions` — nutzen ausschließlich bestehende Theme-Variablen (`--asphalt-2`, `--chalk`, `--hivis`, etc.), damit die Tour automatisch mit allen 5 Themes inkl. Outdoor-Kontrast funktioniert. Keine neuen Fonts/Assets.

## 8. Fehlerfälle & Edge Cases

| Fall | Verhalten |
|---|---|
| Kein Event in `eventsIndex` (z. B. Server-Variante ohne Demo-Seeding, oder Nutzer hat alles gelöscht) | `startOnboardingTour()` zeigt Toast, startet nichts. Gilt für Auto-Start (still, kein Toast beim automatischen Trigger — siehe unten) und manuellen Button gleichermaßen. |
| Auto-Start ohne Event | Kein Toast beim automatischen Trigger nach dem Splash (`dismissSplashscreen()` ruft `startOnboardingTour()` nur als Bequemlichkeit auf; ein Toast direkt nach der Splash-Landung wäre verwirrend). `startOnboardingTour()` bekommt dafür einen zweiten Parameter `silent` (Default `false`), der den Toast unterdrückt; der Auto-Trigger ruft `startOnboardingTour(true)`. |
| Ziel-Selektor eines Schritts nicht im DOM (z. B. Demo-Checkpoints gelöscht) | Retry-Schleife (§4), danach Tooltip ohne Spotlight. Kein Fehler/Crash. |
| Nutzer navigiert während der Tour trotzdem weg (z. B. Browser-Zurück, Tastatur-Shortcut) | Nicht technisch verhinderbar (Backdrop blockiert nur Maus-Klicks auf App-Elemente, keine Browser-/Tastatur-Navigation) — out of scope für diese Iteration, wie auch bestehende Modals das nicht global lösen. `goToTourStep()`s `state.view !== step.view`-Guard verhindert zumindest, dass ein verzögertes `renderOnboardingOverlay()` noch auf einer falschen View positioniert. |
| Demo-Event während der Tour gelöscht (z. B. über einen zweiten Tab) | Nicht adressiert (Rand-Rand-Fall, gleiche Kategorie wie das dokumentierte "Last-Writer-Wins"-Storage-Protokoll) — würde zu einem Tooltip ohne Spotlight führen, kein Crash, da `openEditor()` bereits mit fehlenden Events umgehen kann (bestehendes Verhalten). |
| Manueller Restart über Settings, während `onboardingCompleted` bereits `true` ist | Button ignoriert das Flag komplett, startet immer (`startOnboardingTour()` ohne `silent`). |

## 9. Tests (`test-suite.js`)

- `ONBOARDING_STEPS` hat 6 Einträge mit den erwarteten `view`-Werten in der richtigen Reihenfolge.
- `state.appSettings.onboardingCompleted` ist per Default `false`.
- `findOnboardingTargetEvent()` findet das Demo-Event über den Namen; liefert `null` bei leerem `eventsIndex`.
- `startOnboardingTour()` ohne Event zeigt einen Toast und setzt `state.onboarding.active` nicht auf `true`.
- `startOnboardingTour(true)` (silent) ohne Event zeigt **keinen** Toast.
- `goToTourStep()` navigiert korrekt zwischen Views (Stichprobe: Schritt 0→1 wechselt `state.view` auf `'editor'`, behält `state.currentEvent`).
- `advanceOnboardingStep()`/`retreatOnboardingStep()` respektieren die Grenzen (kein Schritt < 0 oder ≥ 6).
- `finishOnboardingTour()` und `skipOnboardingTour()` setzen `onboardingCompleted = true` und `state.onboarding.active = false`.
- Settings-Button „Einführung erneut anzeigen" ist im gerenderten HTML vorhanden und ruft `startOnboardingTour()` auf.

Kein automatisierter Test für die visuelle Spotlight-Positionierung (`getBoundingClientRect`-Mathematik) — wird wie beim Splashscreen manuell im Browser verifiziert, konsistent mit der bestehenden Lücke "kein visueller Regressionstest" (CLAUDE.md, Test coverage gaps).

## 10. Scope-Grenze zu Teil 3 (Dokumentationsseite)

Die Tour verweist an keiner Stelle auf die geplante Doku-Seite unter Einstellungen (noch nicht gebaut) — kein Cross-Link in dieser Iteration. Falls gewünscht, kann ein späterer, separater Schritt einen Tooltip-Text um einen Link ergänzen, sobald Teil 3 existiert.

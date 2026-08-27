# Öffentliche Online-Vorab-Registrierung — Design

Stand: 28.08.2026. Zweite Hälfte von Rider-App Teilprojekt 3 (siehe [`docs/alleycat-dispatch-roadmap-14-23.md`](../../alleycat-dispatch-roadmap-14-23.md), Paket 16) — Beamer-Ping (erste Hälfte) ist bereits fertig. Baut auf dem Rider-App-Fundament ([`2026-08-25-rider-app-fundament-design.md`](2026-08-25-rider-app-fundament-design.md)) und der Fahrer-App ([`2026-08-25-rider-app-fahrer-app-design.md`](2026-08-25-rider-app-fahrer-app-design.md)) auf. Betrifft ausschließlich die Server-Variante — lokale Variante hat per Definition keine Fahrer-App (`riderAppBaseUrl()` liefert dort immer `''`).

## 1. Ziel

Ein Besucher ohne vorherigen QR-Scan und ohne organizer-seitig zugeteilten Slot soll sich für ein Event vorab online anmelden können: freie Startnummer wählen, Name + Kontakt eintragen, absenden — landet danach in derselben Warteschlange wie eine QR-basierte Anmeldung heute schon (`pendingRiderRegistrations()`/`confirmPendingRider()`, bereits vorhanden).

## 2. Nicht-Ziele

- Kein Beamer-Ping (bereits fertig, siehe `docs/alleycat-dispatch-roadmap-14-23.md` Paket 16).
- Keine Notfallkontakt-Erfassung im öffentlichen Formular — bewusst erst nach Bestätigung, über die schon bestehende Fahrer-App-Startseite nachreichbar (muss beim Bau verifiziert werden, ob diese Ansicht das Feld editierbar zeigt — sonst kleine Ergänzung dort, siehe §7).
- Keine CAPTCHA-/E-Mail-Verifizierung. Freie Startnummern sind endlich (durch „Erwartete Fahrer" begrenzt) und jede Anmeldung landet ohnehin in der bestehenden manuellen Freigabe-Warteschlange — der Worst Case eines Spam-Skripts ist ein leergeräumter Freiplatz-Pool vor echten Anmeldungen, kein unbegrenzter Schaden. Explizit akzeptiertes Risiko, siehe §8.
- Keine Änderungen an `evt.riderApp.progress`/`.map`/`.leaderboard` — diese haben ebenfalls keine organizer-seitige UI (überraschender Fund während der Recherche, siehe §9), bleiben hier aber unangetastet. Nur `.selfRegister` bekommt in diesem Zug eine UI.
- Kein neues Fahrer-Bundle — Registrierung ist eine neue Route innerhalb von `dist/alleycat-rider.html`.

## 3. Bestehende Bausteine (Wiederverwendung)

Die Recherche vor diesem Design fand bereits vorhandene, aber unverdrahtete Scaffolding-Teile:

- **`evt.riderApp.selfRegister`** (dashboard.js:42/46, Default `false`) — Feld existiert, keine UI setzt es.
- **`GET rider.php?a=freebibs`** (rider.php:297-317) — liefert freie Bib-Nummern (nur Zahlen, nie Tokens: „Nur Nummern, keine Namen — auch nicht für belegte Slots", rider.php:315-316), gated auf `settings.selfRegister`. Kein Client-Code ruft das bisher auf.
- **Jeder Slot hat schon einen Token** — `generateRiderSlots()` (rider.js:36-45) erzeugt `riderToken`/`riderCode` für JEDEN Slot beim Anlegen, auch unbelegte. Der Token wird nur nie öffentlich preisgegeben (nur übers gedruckte Spokecard-QR).
- **Pending/Approve-Flow** — `pendingRiderRegistrations()`, `confirmPendingRider()`, `rejectPendingRider()` (rider-sync.js:288-337) plus die Organizer-UI dazu (`renderRidersSectionPending()`, rider.js:445-475) sind fertig und werden 1:1 wiederverwendet.
- **`buildRiderSyncPayload()`** (rider-sync.js:139-147) sendet `settings: Object.assign({}, evt.riderApp)` bei jedem Publish — sobald der Client `evt.riderApp.selfRegister = true` setzt, steht es beim nächsten Sync-Zyklus serverseitig zur Verfügung. Keine Sync-Änderung nötig.

Der fehlende Baustein: `register` (rider.php:394-438) verlangt einen bereits bekannten `riderToken` — ein Besucher ohne Spokecard hat den nicht. Das ist die eigentliche Lücke, die dieses Design schließt.

## 4. Server: neue Aktion `claim`

Neue Aktion in `php-backend/rider.php`, nach dem Muster von `register` (Zeile ~394) und `freebibs` (Zeile ~297):

```
POST ?a=claim   Freie Startnummer ohne bekannten Token belegen (nur bei Selbstregistrierung)
```

- Body: `{publicId, bib, name, contact}`.
- Gate: `settings.selfRegister` muss `true` sein (403 `self_register_disabled`, exakt wie bei `freebibs`) — verhindert, dass die Aktion bei Events ohne aktivierte Selbstregistrierung überhaupt greift.
- Atomarer Claim exakt wie in `register` (rider.php:414-418), nur ohne Token in der WHERE-Klausel:
  ```sql
  UPDATE ..._rider_slot SET status='pending' WHERE public_id=? AND bib=? AND status='free'
  ```
  Kein Treffer → 409 `slot_taken` (Race mit einem zweiten Besucher, der dieselbe Nummer eine Sekunde früher nimmt).
- Bei Erfolg: den beim Slot-Anlegen bereits generierten Klartext-Token braucht der Server nicht neu erzeugen — er kennt nur den Hash (`token_hash`, per `generateRiderToken()` clientseitig erzeugt und gehasht synced). **Konsequenz:** `claim` muss selbst einen neuen Token generieren und dessen Hash speichern (`riderToken = bin2hex(random_bytes(16))` analog zu `generateRiderToken()`'s Client-Pendant, dann `UPDATE ... SET token_hash=?`), und den Klartext-Token einmalig in der Erfolgsantwort zurückgeben. Der alte, nie ausgegebene Token dieses Slots wird damit wertlos — unproblematisch, da er ohnehin nie auf einem Spokecard gedruckt wurde (Slot war frei).
- Log-Eintrag wie bei `register`: `type='register'`-Zeile in `..._rider_log` mit `{name, contact}` als Payload (kein `emergencyContact`, `categories: {}` — siehe §2).
- Rate-Limiting: automatisch durch `riderCheckRateLimit()` (rider.php:228, greift für alle Aktionen außer `sync`/`log`/`slotstatus`) — keine neue Logik nötig, `claim` reiht sich in die bestehende IP-basierte Sperre ein.
- Response: `{ok: true, riderToken, bib}`.

## 5. Client: Registrierungs-Route in der Fahrer-App

**Neues Fragment-Format** in `src/core/rider-qr.js` (geteilt zwischen Organizer- und Fahrer-Bundle), neben `r.` (Fahrer) und `c.` (Checkpoint): `#g.<publicId>` — kein Token im Link, das ist der ganze Punkt. `parseRiderQrPayload()` (rider-qr.js:20-38) bekommt einen dritten Zweig:
```js
if(parts[0] === 'g' && parts.length === 2){
  const [, publicId] = parts;
  if(!RIDER_PUBLIC_ID_RE.test(publicId)) return null;
  return {kind: 'selfRegister', publicId};
}
```

**`src/rider/init.js`** — `initRider()` (Zeile 9-54) prüft `fromUrl.kind === 'selfRegister'` VOR dem bestehenden `session`-Check (dieser Einstieg braucht keine Session, im Gegensatz zu `rider`/`checkpoint`): setzt `riderState.selfRegisterPublicId = fromUrl.publicId`, `riderState.view = 'selfRegisterList'`, lädt `GET ?a=freebibs&public_id=...` (neue Funktion `riderApiFreeBibs()` in `src/rider/api.js`, analog zu den bestehenden `riderApi*`-Funktionen). Leere Liste oder `self_register_disabled` → eigene Fehlermeldung („Für dieses Event ist keine Online-Anmeldung offen").

**`src/rider/state.js`** — `view`-Enum (Zeile 18) erweitert um `selfRegisterList | selfRegisterForm`.

**`src/rider/views.js`** — zwei neue Views:
- `riderViewSelfRegisterList()`: Bib-Nummern als klickbare Chips (Layout wie das bestehende Score-Button-Raster im Organizer-Check-in, `checkin-score-row`/`score-btn` — gleiches Muster, neue Klasse `rider-bib-pick`).
- `riderViewSelfRegisterForm()`: Name + Kontakt (zwei Felder, wiederverwendet `rider-reg-name`/`rider-reg-contact`-Stil aus `riderViewRegister()`, Zeile 91-108 — nur ohne das dritte Notfallkontakt-Feld), Submit ruft `riderSubmitClaim()`.

**`src/rider/init.js`** — `riderSubmitClaim()` (neu, neben `riderSubmitRegistration()`, Zeile 174-212): sammelt Formularfelder VOR jedem `renderRider()` (derselbe Bug wie im Kommentar bei Zeile 175-180 dokumentiert — Formular leert sich beim Neu-Rendern), POSTet `?a=claim`, setzt bei Erfolg `riderState.session = {publicId, riderToken: res.data.riderToken, bib: res.data.bib}`, `riderSaveSession(...)`, dann `riderRouteBySlotStatus()` — landet automatisch auf `pending`, identisch zum QR-Pfad. Fehler (`slot_taken`) → zurück zur Liste, neu laden.

## 6. Organizer-Seite: Toggle + Link

Neuer Nav-Punkt `selfRegister` in `ridersNavGroups()`'s `config`-Gruppe (rider.js:97-101), gleiche Sichtbarkeits-Bedingung wie der bestehende `pending`-Punkt (`riderAppBaseUrl()` truthy — ohne Fahrer-App ergibt Selbstregistrierung keinen Sinn):
```js
...(riderAppBaseUrl() ? [{id: 'selfRegister', icon: '📝', label: () => t('riderApp.selfRegisterNav')}] : [])
```
Neue `renderRidersSectionSelfRegister(evt)` (rider.js, neben `renderRidersSectionPending`): ein Toggle (`evt.riderApp.selfRegister`, gleiches `.toggle-switch`-Markup wie überall sonst in der App) + bei aktiviertem Toggle ein Copy-Feld mit `${riderAppBaseUrl()}#g.${evt.publicId}` (Muster wie die bestehenden Spokecard-Link-Anzeigen). `evt.publicId` ist leer, bis zum ersten Publish (`publishRiderConfigNow()`, rider-sync.js:192) — Hinweistext „Link erscheint nach dem ersten Speichern" für diesen Zwischenzustand, analog zu bestehenden ähnlichen Wartehinweisen in der App (z. B. Backup-Status).

`ridersSectionContent()`-Switch (rider.js:498-508) bekommt den neuen `case 'selfRegister'`.

## 7. Zu verifizieren beim Bauen

- Ob `riderViewHome()` (die bestätigte Fahrer-Ansicht) das Notfallkontakt-Feld editierbar zeigt. Falls nicht: kleine Ergänzung dort (eigenes Formularfeld + `?a=me`-Update-Aktion, oder — falls das den Rahmen sprengt — als Nicht-Ziel zurückstufen und der Organizer trägt es bei der manuellen Freigabe nach, wie es die bestehende Pending-Karte mit optionalem `d.emergencyContact` (rider.js:468) ohnehin schon zulässt).
- `RIDER_TOKEN_RE`/`generateRiderToken()`'s genaues Format (rider-qr.js bzw. rider.js) — der neue serverseitige Token in `claim` muss exakt kompatibel sein (Länge, Zeichensatz), sonst schlägt der spätere `riderResolveSlot()`-Hash-Vergleich fehl.

## 8. Fehlerfälle & Edge Cases

| Fall | Verhalten |
|---|---|
| `selfRegister` deaktiviert, Besucher öffnet `#g.<publicId>` trotzdem | `?a=freebibs` liefert 403 `self_register_disabled` — eigene Fehlermeldung, kein Absturz. |
| Zwei Besucher klicken zeitgleich dieselbe Bib-Nummer | Der zweite `claim`-Aufruf trifft die atomare `UPDATE ... WHERE status='free'` nicht mehr → `slot_taken`, zurück zur (neu geladenen) Liste. |
| Alle Startnummern schon vergeben | `?a=freebibs` liefert leere Liste → eigene „Keine freien Startnummern mehr" statt leerer Chip-Reihe. |
| Spam-Skript belegt alle Freiplätze mit Müllnamen | Landen alle in der bestehenden Pending-Warteschlange, kein automatisches Confirm — Organizer lehnt sie manuell ab (`rejectPendingRider()`, bereits vorhanden, setzt Slot zurück auf `free`). Akzeptiertes Risiko, siehe §2. |
| Besucher schließt Tab nach `claim`, bevor `riderRouteBySlotStatus()` läuft | Slot bleibt `pending` in der DB (Server-State ist Quelle der Wahrheit), aber der Client hat die Session nicht gespeichert — Besucher kann sich nicht mehr einloggen und weiß seine Bib-Nummer nicht mehr. Gleiches Verhalten wie ein Netzwerkfehler mitten im bestehenden `riderSubmitRegistration()`-Pfad (kein Sonderfall, kein zusätzlicher Code). Organizer sieht den Pending-Eintrag trotzdem und kann ihn bestätigen; der Fahrer braucht dann einen neuen Weg zum Login (z. B. Organizer teilt den `riderCode` manuell mit — bestehender Fallback-Pfad). |
| Lokale Variante | `riderAppBaseUrl()` liefert `''` → der neue Nav-Punkt in `ridersNavGroups()` erscheint gar nicht (gleiche Bedingung wie `pending`). Kein Sonderfall nötig. |

## 9. Nebenfund (dokumentiert, nicht Teil dieses Umbaus)

`evt.riderApp.progress`/`.map`/`.leaderboard` haben ebenfalls keine organizer-seitige UI — nur `.selfRegister` wird in diesem Umbau verdrahtet. Wert für eine spätere, eigene Aufräum-Runde, kein Blocker hier.

## 10. Betroffene Dateien (Zusammenfassung)

| Datei | Änderung |
|---|---|
| `php-backend/rider.php` | neue Aktion `claim` |
| `src/core/rider-qr.js` | `parseRiderQrPayload()` erkennt `g.<publicId>`; geteilt mit Fahrer-Bundle |
| `src/core/rider.js` | neuer Nav-Punkt + `renderRidersSectionSelfRegister()` + `ridersSectionContent()`-Case |
| `src/rider/state.js` | zwei neue `view`-Werte |
| `src/rider/api.js` | `riderApiFreeBibs()`, `riderApiClaim()` |
| `src/rider/views.js` | `riderViewSelfRegisterList()`, `riderViewSelfRegisterForm()` |
| `src/rider/init.js` | Fragment-Abzweigung in `initRider()`, `riderSubmitClaim()` |
| `src/core/i18n.js` | neue Keys unter `riderApp` (Organizer-UI) und `riderScan` (Fahrer-App-Strings, muss im `RIDER_I18N_NAMESPACES`-Trim landen — Namespace existiert schon) |

## 11. Testing

- `node build.js` + `node build.js --core-hash`.
- PHP: kein automatisierter Lauf möglich (bestehende Einschränkung, siehe CLAUDE.md) — manueller Test gegen lokale PHP+MariaDB (XAMPP o. ä.): `selfRegister` aktivieren, Link öffnen, Bib wählen, absenden, im Organizer-Tab unter „Ausstehend" bestätigen, prüfen dass der Fahrer danach per gespeicherter Session einloggen kann.
- Rennstart/`running`-Status ist für `claim` nicht relevant (anders als `checkin`) — Registrierung soll auch in `planning`/`ready` möglich sein, das beim Bauen explizit gegenprüfen (kein Status-Gate in `claim` vorsehen, im Unterschied zu `checkin`s Status-Prüfung).

# Claude Code Handover: Selbstregistrierung mit Invite-Codes

Status: Vorschlag, nicht umgesetzt. Baut auf dem bestehenden Admin-Rollensystem auf (`{prefix}_admin_user`, `auth.js`, `auth.php`). Nur Server-Variante — lokale Variante hat kein Rollensystem (`hasAdminRoles()` dort immer `false`).

## 1. Ziel

Thilo will Tester einladen können, ohne für jeden manuell einen Account anzulegen. Er erzeugt einen Invite-Code mit fester Rolle und Ablaufdatum, schickt ihn dem Tester, der Tester registriert sich selbst damit (Username/Passwort wählen). Code ist danach verbraucht.

## 2. Datenmodell — neue Tabelle `{prefix}_invite_code`

| Spalte | Typ | Anmerkung |
|---|---|---|
| id | INT PK | |
| code_hash | VARCHAR | gehasht wie `staff_code_hash` beim Checkpoint-Zugang — Klartext-Code nur einmal bei Erstellung angezeigt |
| role | ENUM/VARCHAR | admin/editor/viewer/checkpoint_staff — beim Erstellen fix gewählt |
| note | VARCHAR NULL | freies Notizfeld für den Admin, z. B. "für Anna" — rein intern, taucht nirgends auf der Visitenkarte oder im Registrierungs-Screen auf |
| expires_at | DATETIME | Pflichtfeld, vom Admin beim Erstellen gesetzt |
| used_at | DATETIME NULL | NULL = noch offen |
| used_by_user_id | INT NULL | FK auf `{prefix}_admin_user`, gesetzt bei Einlösung |
| created_by_user_id | INT | welcher Admin hat den Code erzeugt |
| created_at | DATETIME | |

Migration 5 (nach Migration 4 / admin_user-Migration), gleiche Konventionen (idempotent, `migrate.php` picked up).

## 3. Backend-Endpunkte (auth.php)

Alle bearer-token-basiert wie die bestehenden Admin-Endpunkte, außer Registrierung selbst (die ist der Einstiegspunkt, kein Token vorhanden).

- `POST auth.php?a=invite-create` (Rolle admin) — Body `{role, expiresAt, count?, note?}`. Erzeugt einen oder (mit `count`) mehrere zufällige Codes (ausreichend lang, z. B. 10 Zeichen alphanumerisch), speichert je nur den Hash (+ optionale Notiz im Klartext), gibt die Klartext-Codes einmalig als Array in der Response zurück — Batch-Erstellung ist die Grundlage für den Visitenkarten-Druck (Abschnitt 6): mehrere Tester gleichzeitig einladen, ein PDF mit allen Karten exportieren. Bei `count > 1` teilen sich alle Codes im Batch dieselbe Notiz — für unterschiedliche Notizen pro Code braucht es mehrere Aufrufe.
- `GET auth.php?a=invite-list` (Rolle admin) — Liste aller Codes mit Status (offen/eingelöst/abgelaufen), Rolle, Notiz, Ablaufdatum, wer eingelöst hat. Kein Klartext-Code mehr enthalten (nur Hash existiert ja noch).
- `DELETE auth.php?a=invite-revoke` (Rolle admin) — Body `{id}`. Löscht/entwertet einen offenen Code vorzeitig.
- `POST auth.php?a=register` (kein Token nötig) — Body `{code, username, password}`. Validiert: Code-Hash matched, `used_at IS NULL`, `expires_at > now()`. Bei Erfolg: legt `admin_user` mit der Code-Rolle an, setzt `used_at`/`used_by_user_id`, gibt sofort ein Session-Bearer-Token zurück (Auto-Login, gleiches Muster wie `checkpoint-login`). Bei Fehlschlag: generische Fehlermeldung ("Code ungültig oder abgelaufen") — nicht verraten, ob Code existiert vs. abgelaufen vs. schon benutzt (verhindert Code-Enumeration).

Rate-Limiting: `?a=register` muss wie `rider.php`s Rate-Limiter behandelt werden — Fehlversuche pro IP in einer Tabelle zählen, sonst ist Code-Bruteforcing möglich trotz Hash.

Storage-Seam-Erweiterung in `src/storage/storage-server.js` (analog zu `adminLogin()`): `createInviteCode()`, `listInviteCodes()`, `revokeInviteCode()`, `registerWithInviteCode()`. Lokale Variante: alle vier null/no-op, UI blendet die Sektion entsprechend aus (`hasAdminRoles()` bereits vorhandener Schalter dafür).

## 4. Admin-UI

Settings → Konto → Benutzer, neue Sektion "Einladungscodes" (admin-only, wie der Rest der Seite):

- Tabelle bestehender Codes: Rolle, Notiz, Status-Badge (Offen/Eingelöst/Abgelaufen), Ablaufdatum, eingelöst von (falls zutreffend).
- "Code(s) erstellen"-Button → Modal mit Rollen-Dropdown, Ablaufdatum-Picker, Anzahl-Feld (Standard 1), optionalem Notiz-Feld (Freitext, z. B. "für Anna") → nach Erstellung alle Klartext-Codes einmalig angezeigt, jeweils mit Kopier-Button ("wird nicht wieder angezeigt").
- Direkt im selben Modal-Ergebnis: Button "Als Visitenkarten-PDF exportieren" (nur wenn `count > 1` sinnvoll, aber auch bei 1 Code anbieten) — siehe Abschnitt 6.
- Revoke-Button pro offenem Code.

## 5. Registrierungs-Screen (öffentlich, kein Login nötig)

Neuer Zustand in `renderAdminLogin()` bzw. eigene `renderAdminRegister()` in `storage-server.js`: Link "Ich habe einen Einladungscode" auf dem Login-Screen. Formular: Code (vorausgefüllt falls per URL-Query übergeben, z. B. `?invite=ABC123`), Username, Passwort (+ Wiederholung). Bei Erfolg: direkt eingeloggt, landet im normalen Dashboard mit der zugewiesenen Rolle.

## 6. Visitenkarten mit QR-Code (Offline-Verteilung)

Analog zu den bestehenden Rider-QR-Codes (`rider-qr.js`, Bib/Spokecard-Export in `export-pdf.js`) — Ziel: gedruckte Karten zum Verteilen an Tester, kein Netzwerk beim Verteilen nötig.

Neue Exportfunktion `exportInviteCardsPDF(codes)` in `export-pdf.js`, gleiches jsPDF-Setup wie Spokecards.

- Grid mehrerer Karten pro A4-Seite im Kreditkarten-Format (ISO/IEC 7810 ID-1, 85,60 × 53,98mm), nicht das gängige Business-Card-Maß — Schnittmarken wie bei Spokecards falls dort schon vorhanden.
- Kartenlayout: nicht nur ein schlichtes Funktions-Grid — Corporate Design wie bei Spokecards: AC-Mark, Terracotta-Akzent (`--hivis`), JetBrains Mono/Oswald/Inter-Typografie.
- Pro Karte: QR-Code, Ablaufdatum, Fallback der rohe Code als Text (falls QR-Scan mal nicht klappt oder Gerät keine Kamera-App zur Hand hat).
- QR-Payload: analog `parseRiderQrPayload` ein strukturierter Link, kein nackter Code — öffnet direkt den Registrierungs-Screen mit vorausgefülltem Code (`?invite=<code>`, siehe Abschnitt 5). Basis-URL wird automatisch zur Laufzeit aus `window.location.origin` + aktuellem Pfad ermittelt, keine neue Einstellung nötig — die Registrierung ist Teil derselben `dist/alleycat-dispatch-server.html`, die der Admin beim Erstellen der Karten gerade geöffnet hat (kein separates Bundle wie bei der Rider-App). Voraussetzung: Karten werden auf der tatsächlichen Live-Domain erzeugt, nicht versehentlich in einer lokalen/internen Testumgebung mit abweichender URL.
- Erzeugung direkt nach Batch-Erstellung: Codes sind nur einmalig im Klartext verfügbar (Abschnitt 3), der PDF-Export muss also im selben Request-Zyklus wie `invite-create` passieren, nicht nachträglich aus der Liste (die zeigt nur noch Status, keinen Klartext mehr).
- Doku-Pflicht: neuer Eintrag im In-App-Nachschlagewerk (`documentation.js`, Settings → Hilfe) für die komplette Invite-Code-Funktion (Erstellen, Rollen-Zuweisung, Kartenexport, Revoke) — kein optionaler Nice-to-have-Punkt, sondern Teil des Kern-Scopes: jede admin-nutzbare Funktion wird dokumentiert.

## 7. Sicherheit

- Code-Hash wie `staff_code_hash`, nicht Klartext in DB.
- Generische Fehlermeldung bei jedem Validierungsfehler (kein Unterschied zwischen "existiert nicht"/"abgelaufen"/"benutzt" in der Response) — außer Username-Kollision bei der Registrierung selbst, die bekommt eine konkrete, eigene Fehlermeldung ("Benutzername bereits vergeben"), da das kein Sicherheitsrisiko am Code selbst ist.
- Rate-Limiting auf `?a=register` analog `rider.php`.
- Ablaufdatum ist Pflicht — kein "nie ablaufender" Code möglich, reduziert Risiko bei versehentlich geteilten Codes (z. B. wenn eine Visitenkarte verloren geht).

Passwort-Policy (an aktuellen Best Practices orientiert, NIST-SP-800-63B-Linie statt veralteter Komplexitätsregeln): Mindestlänge statt Zeichenklassen-Zwang — z. B. 12 Zeichen minimum, keine Pflicht zu Sonderzeichen/Großbuchstaben/Ziffern-Mix (Nutzer weichen bei Zwang erfahrungsgemäß auf vorhersehbare Muster aus). Zwei Bausteine, beide global, nicht nur fürs Registrierungsformular:

- Validierung zentral in `auth.js` als `validatePasswordStrength()`, verwendet von jedem Passwort-Eingabepunkt im System: Admin-Bootstrap (`auth.php?a=bootstrap`), Registrierung (`?a=register`), und einem eventuellen späteren Passwort-Ändern-Screen — eine Policy statt mehrerer divergierender.
- Stärke-Indikator als gemeinsame, wiederverwendbare UI-Komponente (z. B. `renderPasswordStrengthMeter()`), rein clientseitiges Feedback, kein Blocker — an derselben Stelle eingebunden, wo `validatePasswordStrength()` greift, damit Bootstrap, Registrierung und ein späterer Passwort-Ändern-Screen optisch/funktional identisch bleiben statt eine Insel nur bei der Einladungs-Registrierung zu sein.

## 8. Erweiterungen (optional, per Feature-Registry togglebar)

Passend zum bestehenden modularen Grundgedanken (`feature-registry.js`, `FEATURE_REGISTRY` — Features sind Device-/Event-Toggles, nichts ist fest verdrahtet an): die folgenden zwei Punkte sind nicht Teil des Kern-Scopes und nicht standardmäßig aktiv. Sie hängen als eigene Einträge im Feature-Registry, Default aus, genau wie andere optionale Features im Projekt:

- Standard-Ablaufdauer als Einstellung (z. B. "7 Tage" vorausgewählt statt jedes Mal manuell ein Datum zu picken) — rein ein Komfort-Default für den Erstellungs-Dialog, ändert nichts am Pflichtfeld selbst.
- Restgültigkeit im Registrierungs-Screen sichtbar machen ("Code gültig bis 12.09.") — reine Anzeige-Erweiterung, kein Einfluss auf die Validierungslogik.

Beide bleiben unabhängig vom Kern-Feature (Invite-Codes selbst) schaltbar — wer sie nicht braucht, sieht sie nicht, analog zu Rollenverwaltung/CSV-Import-Tiers.

Noch nicht entschieden, ob mitgebaut werden soll (aus einem früheren Vorschlag): Status-Übersicht, Undo-Log-Anbindung, PNG-Einzelexport, Rollen-Reveal nach Scan, Passwort-Sichtbar-Toggle, Mobile-Optimierung des Formulars. Falls gewünscht, ebenfalls als optionale Feature-Registry-Einträge statt fest eingebaut.

## 9. Community-Verwaltung — weitere optionale Erweiterungen

Über die Invite-Codes hinaus, an WordPress' Benutzerverwaltung orientiert. Genau wie in Abschnitt 8: alle hier gelisteten Punkte sind eigene Feature-Registry-Einträge, Default aus, keiner ist Kern-Scope dieses Docs. Bauen auf der bestehenden `{prefix}_admin_user`-Infrastruktur auf, kein neuer Grund-Umbau nötig.

**Profil & Status**

- Account sperren statt löschen (User bleibt in der DB, kann sich aber nicht mehr einloggen — reaktivierbar)
- Anzeige-Name getrennt vom Login-Username
- "Zuletzt aktiv" pro User in der Userliste

**Sicherheit & Sessions**

- "Passwort vergessen"-Flow ohne E-Mail-Infrastruktur (Projekt hat aktuell keinen Mailversand): Admin erzeugt einen Reset-Code — gleiche Infrastruktur wie die Invite-Codes (Hash, Ablaufdatum, Einmal-Nutzung), nutzt also dieselbe `{prefix}_invite_code`-artige Tabelle bzw. eine Schwester-Tabelle mit gleichem Muster
- "Überall abmelden" — alle Bearer-Tokens eines Users auf einmal invalidieren

**Admin-Übersicht**

- Suche/Filter/Sortierung in der Userliste nach Rolle, Status, letzter Aktivität
- Bulk-Aktionen (mehrere User gleichzeitig Rolle ändern oder sperren)
- CSV-Export der Userliste (Muster existiert schon in `bulk-import.js`/`export-csv.js`, nur die Export-Richtung fehlt für Admin-User)

**Audit/Nachvollziehbarkeit**

- Login-/Rollen-Änderungs-Log über `action-log.js` (bestehendes Undo-Log-Modul)

Bewusst nicht vorgesehen (auch nicht optional): frei definierbare/granulare Rollen mit eigenen Capabilities — bei 4 festen Rollen für ein Einpersonen-Projekt Overkill, würde `currentUserCan()` unnötig verkomplizieren.

## 10. Status

Kern-Scope (Abschnitte 1–7) ist entscheidungsreif für Claude Code. Abschnitte 8–9 sind bewusst optional gehaltene Erweiterungslisten — nichts davon ist für die erste Umsetzung verbindlich, alles hängt am Feature-Registry mit Default aus.

Wichtiger Hinweis, unabhängig vom Scope: Das Einlösen eines Codes braucht immer eine Serververbindung — die Visitenkarte macht nur die Verteilung offline-tauglich, nicht die Registrierung selbst.

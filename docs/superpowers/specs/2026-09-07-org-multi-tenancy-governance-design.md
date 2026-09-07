# Multi-Tenancy & Governance (Orgs/RBAC) — Design

Stand: 07.09.2026. Erster Schritt eines zweiteiligen Community-Management-Vorhabens (siehe Ad-hoc-Brainstorming mit Thilo, 07.09.2026). Zweiter Schritt — Spokecard-Claiming-Flow (Ghost-Profiles für Gast-Fahrer) — ist bewusst **nicht** Teil dieses Specs, baut aber direkt auf der hier eingeführten `event`-Tabelle auf und folgt als eigener Spec/Plan-Zyklus.

Betrifft **ausschließlich die Servervariante**. Die lokale Variante ist per Definition Single-Tenant (ein Nutzer, eine Installation, keine Org-Konzept nötig) und bleibt vollständig unverändert — kein Berührungspunkt, kein Seam-Update nötig.

## 1. Ziel

Eine Servervariante-Installation soll mehrere unabhängige Crews ("Organisationen") gleichzeitig hosten können, strikt gegeneinander isoliert: Daten, Rollen und Zugriff einer Org dürfen unter keinen Umständen für eine andere sichtbar oder veränderbar sein. Innerhalb einer Org soll der Org-Admin ("Captain") Rechte an andere Mitglieder delegieren können — org-weit (feste Rolle) oder auf ein einzelnes Event begrenzt (temporäre Delegation).

## 2. Nicht-Ziele

- **Keine volle Normalisierung der Event-Inhalte.** Checkpoints, Zonen, PDF-Baukasten-Blöcke, Kartendesign etc. bleiben eine JSON-`payload`-Spalte auf der neuen `event`-Zeile, keine eigenen Tabellen pro Entität. Grund: würde praktisch jedes Modul in `src/core/*.js` anfassen (Checkpoint-CRUD, Zonen, PDF-Baukasten, Teams, Kategorien — 10+ Module) für ein Ziel (Cross-Checkpoint-Analytics), das aktuell unvalidiert ist. Eigene, spätere Roadmap-Position, falls der Bedarf sich konkretisiert.
- **Kein Spokecard-Claiming-Flow / Ghost-Profiles.** Eigener Anschluss-Spec, siehe oben.
- **Kein Selfservice bei Org-Erstellung.** Nur SysAdmin legt neue Orgs an (Modell "geschlossen" — Instance-Betreiber schaltet Crews händisch frei). Kein offenes Registrierungsformular für neue Orgs.
- **Keine automatische Migration bestehender Installationen.** Das Tool ist noch nirgends produktiv im Einsatz (bestätigt von Thilo) — reine Breaking-Change-Migration in `migrations.php`, kein Kompatibilitätspfad für Alt-Installs nötig.
- **Kein Pflicht-Pretty-URL-Routing.** Hash-Routing (`#/org/<slug>/...`) ist der garantiert funktionierende Default auf jedem Hosting. Pretty-URLs via `.htaccess` sind Bonus, kein Blocker (siehe §5).
- **Keine eigene "Event-Admin"-Rolle im Rollen-Enum.** Wird als Delegationstabelle abgebildet, nicht als fünfter Rollenname (siehe §4).
- **Kein Bulk-/Recurring-Grant für Event-Delegationen.** Eine Delegation gilt für genau ein Event; wiederkehrende Mitarbeit läuft über die org-weite `editor`-Rolle. Bewusst einfach gehalten für diesen ersten Wurf.

## 3. Datenbank-Schema

Alle neuen Tabellen mit bestehendem `{prefix}_`-Namensschema, angelegt über eine neue Migration in `migrations.php` (idempotent, `CREATE TABLE IF NOT EXISTS`, gleiches Muster wie alle bisherigen Migrationen).

### `{prefix}_organization`
| Spalte | Typ | Hinweis |
|---|---|---|
| `id` | PK | |
| `slug` | VARCHAR, UNIQUE | URL-Bestandteil, z. B. `koelner-kuriere` |
| `name` | VARCHAR | Anzeigename |
| `crest_svg_config` | JSON, nullable | Wappen-Baukasten-Konfiguration — Spalte jetzt vorsehen, Baukasten-UI selbst ist spätere Ausbaustufe (siehe Roadmap-Notiz, Community-Brainstorming) |
| `noticeboard_text` | TEXT, nullable | Community-Pinnwand |
| `created_at` | DATETIME | |

### `{prefix}_user` (Umbau von `{prefix}_admin_user`)
Bestehende `{prefix}_admin_user` wird zur instanzweiten User-Tabelle:
- Neue Spalte `is_sysadmin` BOOLEAN DEFAULT 0.
- Bestehende `role`-Spalte **entfällt** — Rolle ist ab jetzt org-abhängig, nicht mehr instanzweit (siehe `org_member` unten). Genau ein SysAdmin-Bootstrap bleibt wie heute Teil von `install.php`.

### `{prefix}_org_member`
| Spalte | Typ | Hinweis |
|---|---|---|
| `id` | PK | |
| `org_id` | FK → `organization` | |
| `user_id` | FK → `user` | |
| `role` | ENUM(`captain`,`editor`,`viewer`,`checkpoint_staff`) | Default bei Beitritt: `viewer` |
| `joined_at` | DATETIME | |

UNIQUE auf (`org_id`,`user_id`) — eine Person hat pro Org genau eine Rolle. Eine Person kann Mitglied in mehreren Orgs mit unterschiedlicher Rolle sein.

`captain` = funktionales Äquivalent zum heutigen `admin`. Name bewusst an Thilos ursprünglichen Vorschlag angelehnt.

### `{prefix}_org_event_admin`
| Spalte | Typ | Hinweis |
|---|---|---|
| `id` | PK | |
| `org_id` | FK → `organization` | Redundant zu `event.org_id`, aber nötig für den Lint-Guard (§6) — jede org-gebundene Tabelle trägt `org_id` direkt, kein impliziter Join nötig um den Scope zu prüfen |
| `event_id` | FK → `event` | |
| `user_id` | FK → `user` | |
| `granted_at` | DATETIME | |

UNIQUE auf (`event_id`,`user_id`). Gewährt Editor-Äquivalent-Rechte, aber ausschließlich für das referenzierte Event — kein Fortwirken auf andere oder künftige Events. Nur ein `captain` der zugehörigen Org darf Zeilen hier anlegen/löschen.

### `{prefix}_event` (Umbau vom heutigen KV-Key `event:<id>`)
| Spalte | Typ | Hinweis |
|---|---|---|
| `id` | PK | bisherige Event-`id` (uid) |
| `org_id` | FK → `organization` | |
| `slug` | VARCHAR | |
| `status` | ENUM | Spiegel von `evt.raceStatus` (planning/ready/running/completed) — als echte Spalte für künftige Cross-Event-Queries (z. B. Liga-Berechnung, Dashboard-Filter), auch wenn der Wert redundant im `payload` steht |
| `start_date` | DATE, nullable | ebenfalls gespiegelt, gleicher Grund |
| `payload` | JSON | Rest des Event-Objekts unverändert wie heute (Checkpoints, Zonen, Teams, Kategorien, PDF-Baukasten, Kartendesign, …) |
| `updated_at` | DATETIME | |

UNIQUE auf (`org_id`,`slug`). `status`/`start_date` werden bei jedem Save aus `payload` gespiegelt (kleine Erweiterung in der Save-Route, kein neuer Schreibpfad).

### Bestehende Tabellen, Erweiterung
`{prefix}_checkpoint_staff`, `{prefix}_admin_session`, `{prefix}_checkpoint_session`, `{prefix}_rider_*`-Tabellen: bekommen `org_id` dazu, wo nicht schon über `event_id` → `event.org_id` ableitbar (nötig für den Lint-Guard, der direkte `org_id`-Prädikate erwartet, siehe §6).

## 4. Rollenmodell

Vereinheitlicht auf die vier bereits bestehenden Rollennamen, jetzt org-gebunden statt instanzweit:

- **SysAdmin** (`user.is_sysadmin`) — instanzweit, kein Org-Bezug. Besteht jede Org-Prüfung implizit als `captain`-Äquivalent, ohne eigene `org_member`-Zeile (Top-Down-Vererbung).
- **`captain`** — Org-Admin. Volle Rechte innerhalb der Org: Events anlegen, Mitglieder verwalten, Rollen vergeben, Event-Delegationen vergeben, Wappen/Pinnwand pflegen.
- **`editor`** — org-weit Schreibrechte auf alle Events der Org (funktional das heutige `admin`/`editor`-Verhalten, nur jetzt org-gebunden statt instanzweit).
- **`viewer`** — Leserechte, org-weit. **Default-Rolle bei Beitritt** — neue Mitglieder starten hier, bis ein `captain` hochstuft. Deckt exakt den Fall "neues Mitglied, noch keine Rechte zugewiesen" ab, kein separater "member"-Platzhalter nötig.
- **`checkpoint_staff`** — unverändert wie heute, Zugriff nur auf zugewiesene Checkpoints der eigenen Org (bestehendes `checkpointResolveScope()`-Muster bleibt, nur zusätzlich org-gescoped).

**Event-Admin ist keine eigene Rolle**, sondern die oben beschriebene `org_event_admin`-Delegation: ein `captain` kann eine Person mit Editor-Äquivalent-Rechten für genau ein Event ausstatten, ohne sie org-weit zum `editor` zu machen. Zwei Anwendungsfälle, klar getrennt:
- Dauerhafte Mitarbeit an allen Events → org-weite `editor`-Rolle.
- Einzelnes, abgegrenztes Event (Gast-Organizer) → `org_event_admin`-Delegation, muss pro Event neu vergeben werden.

## 5. Routing

Hash-basiert, garantierter Default auf jedem Hosting: `dist/alleycat-dispatch-server.html#/org/<slug>/dashboard`. Slug steuert client-seitig, welche Org aktiv ist — kein echter Server-Pfad nötig.

Zusätzlich, best effort: `install.php` schreibt einen klar markierten, idempotenten `.htaccess`-Block, der (falls Apache mit `mod_rewrite`/`AllowOverride` verfügbar) `/<slug>/...`-Pfade auf dieselbe statische Datei umschreibt — rein kosmetisch (hübschere URL), kein funktionaler Unterschied zum Hash-Modus, kein Blocker falls die Regel auf dem jeweiligen Hosting nicht greift (nginx, `AllowOverride None`, …). Muss vorhandene `.htaccess`-Inhalte respektieren (append/replace nur des markierten Blocks, nie die ganze Datei überschreiben).

## 6. RBAC-Durchsetzung

- **Login** (`auth.php?a=login`) bleibt instanzweit, Bearer-Token identifiziert nur den User — **kein Org-Bezug im Token**, gleiches Prinzip wie das bestehende Checkpoint-Scoping (nie backen, immer live auflösen, damit Rechteänderungen sofort wirken).
- **Neuer Endpoint** `auth.php?a=my-orgs` — liefert alle Orgs, in denen der eingeloggte User Mitglied ist (`org_member` wo `user_id`), plus alle Orgs falls SysAdmin. Speist das Workspace-Dropdown im Frontend.
- **Jeder Request** gegen `api.php`/`rider.php` trägt den Org-Slug aus der aktiven URL. `apiVerifyAccess()` (`bootstrap.php`) wird erweitert:
  1. Slug → `org_id` auflösen.
  2. SysAdmin? → durch, `captain`-Äquivalent.
  3. Sonst: `org_member`-Zeile für (User, Org) suchen, Rolle prüfen wie heute (`viewer` nur GET, `editor`/`captain` auch POST/DELETE).
  4. Bei event-spezifischen Aktionen zusätzlich `org_event_admin` als Fallback auf Editor-Niveau prüfen, falls die Org-Rolle allein nicht reicht.
- **Guard gegen vergessene `org_id`-Filter** (Kernrisiko von "eine geteilte DB"): neues Lint-/Testskript, analog zu `assertCoreIsBackendAgnostic()` im bestehenden Core-Guard-Muster. Scannt `api.php`/`rider.php`/`auth.php` und schlägt fehl (Build-/Test-Gate, nicht Laufzeit), wenn eine Query gegen eine org-gebundene Tabelle kein erkennbares `org_id`-Prädikat enthält. Muss vor jedem Merge grün sein — exakt dieselbe Disziplin wie der bestehende Core-Guard für die Backend-Agnostizität von `src/core/*`.

## 7. Frontend/UI

- **Workspace-Dropdown** in der Topbar (neben Sprache/Theme): aktive Org + Liste aller Orgs des Users (aus `my-orgs`). Wechsel navigiert zu `#/org/<neuer-slug>/dashboard`, lädt Dashboard-Liste neu.
- **Neue Settings-Seite "Organisation"**, gleiches Sidebar-Pattern wie Settings/Riders/Manifest (`.settings-layout` etc., siehe CLAUDE.md): Wappen-Konfigurationsfeld (Platzhalter-UI, volle Baukasten-UX später), Pinnwand-Text-Editor, Mitgliederverwaltung (`org_member`-CRUD, Rollenzuweisung), Event-Delegationen-Übersicht. Ersetzt/erweitert die heutige org-lose "Benutzerverwaltung" unter Settings → Konto.
- **Neues, schlankes Instance-Panel für SysAdmin**, außerhalb der normalen Sidebar-Navigation: Orgs anlegen/deaktivieren, instanzweite User-Übersicht.
- **`storage-server.js`-Seams**: `loadEvent`/`saveCurrentEvent`/Dashboard-Liste fragen jetzt org-gescoped ab (`org_id` aus aktivem Workspace) statt implizit "alle Events der Installation". `debouncedSave()` schreibt weiter den `payload`, jetzt gegen die `event`-Tabellenzeile statt einen KV-Key.

## 8. Testing

- **`test-suite.js`** (Browser-Konsole, bestehendes Muster): neue Checks für Workspace-Dropdown/-Wechsel, Dashboard-Filterung nach aktiver Org.
- **PHP-Backend gegen echtes lokales MySQL** (Setup wie beim letzten verifizierten Lauf, siehe CLAUDE.md "Known issues"): Kernszenario **Cross-Org-Isolation** — zwei Orgs, zwei Events, `editor` von Org A darf Event von Org B unter keinen Umständen sehen/ändern (401/403 erwartet). Zusätzlich: SysAdmin-Zugriff über Org-Grenzen hinweg, Event-Delegation greift nur für das zugewiesene Event, `viewer`-Default bei Neubeitritt.
- **Lint-Guard** (§6) läuft als Teil von `node build.js` oder eigenem Skript, muss vor Merge grün sein.
- Weiterhin offen, unabhängig von diesem Spec (siehe CLAUDE.md): PHP-Backend nie auf echtem Shared-Hosting getestet — gilt für dieses Feature genauso wie für den Rest des Backends.

## 9. Abgrenzung zum Anschluss-Spec (Spokecard-Claiming)

Der zweite Schritt (Ghost-Profiles, `guest_id`, `claim_pin`, Batch-Spokecard-PDFs mit anonymen QR-Codes, Merge-Flow nach dem Rennen) setzt auf der hier eingeführten `event`-Tabelle auf (`race_entries`/`results` referenzieren `event_id`), ist aber inhaltlich unabhängig von Multi-Tenancy/RBAC — funktioniert im Kern auch für eine einzelne Org. Bewusst als eigener Spec/Plan-Zyklus, nicht Teil dieses Umbaus.

# Spokecard-Claiming-Flow (Persistente Fahrer-Konten) — Design

Stand: 08.09.2026. Zweiter Schritt des zweiteiligen Community-Management-Vorhabens (siehe Ad-hoc-Brainstorming mit Thilo, 07.09.2026; erster Schritt: [Multi-Tenancy & Governance](2026-09-07-org-multi-tenancy-governance-design.md)). Baut auf der dort eingeführten `{prefix}_event`-Tabelle auf (via `public_id`), ist aber inhaltlich unabhängig von Org/RBAC — funktioniert im Kern auch für eine einzelne Org.

Betrifft **ausschließlich die Servervariante**. Die lokale Variante kennt keine Rider-App und bleibt vollständig unberührt.

## 1. Ziel

Fahrer sollen ein persistentes, instanzweites Konto anlegen können, das ihre Teilnahmen über mehrere Events und Organisationen hinweg sammelt ("Hall of Fame"/Renn-Historie). Ein Konto claimt eine Startnummer (`rider_slot`), indem es den Besitz der zugehörigen Spokecard nachweist — sowohl **vor** dem Rennen (Fahrer registriert sich selbst, verknüpft die neue Startnummer sofort mit dem eigenen Konto) als auch **nach** dem Rennen (Fahrer scannt/tippt nachträglich den Code einer bereits gefahrenen Spokecard ein, um das Ergebnis rückwirkend anzuhängen).

Der bestehende anonyme Self-Register-Flow (`?a=claim` ohne Konto, siehe [2026-08-28-public-pre-registration-design.md](2026-08-28-public-pre-registration-design.md)) bleibt unverändert parallel bestehen — ein Konto ist nie Pflicht, um an einem Rennen teilzunehmen.

## 2. Nicht-Ziele

- **Kein neues "Ghost-Profile"-Datenmodell.** Eine unclaimte `rider_slot`-Zeile (Migration aus [rider-app-fundament](2026-08-25-rider-app-fundament-design.md)) ist bereits anonym (kein Name, nur Token/Code) — sie IST das Ghost-Profil. Kein zusätzliches `guest_id`-Feld nötig.
- **Kein Merge zweier bestehender Konten.** Legt ein Fahrer versehentlich zwei Konten an (z. B. zwei E-Mail-Adressen), gibt es in v1 keinen Zusammenführungs-Weg. Eigene, spätere Position, falls der Bedarf sich zeigt.
- **Kein Profilbild, keine Bio, kein Social-Feed.** Historie ist eine reine Liste vergangener Teilnahmen, keine Community-Profilseite.
- **Keine Änderung am Spokecard-Druck/QR-Format.** Der Token/Code-Mechanismus existiert bereits vollständig (siehe rider-app-fundament-Spec) und wird nur wiederverwendet, nicht verändert.
- **Kein Passwort-Reset ohne E-Mail-Versand.** Reset ist Pflichtfeature (siehe §5) — heißt im Umkehrschluss: ohne konfigurierten SMTP-Versand ist Fahrer-Kontoerstellung nicht sinnvoll benutzbar (siehe §7, Betriebsvoraussetzung).
- **Kein Selfservice-Undo eines Claims durch eine dritte Partei.** Nur wer den Slot-Token/Code selbst kennt, kann einen Claim setzen oder überschreiben (siehe §4) — kein Organizer-Override in v1.

## 3. Datenbank-Schema

Neue Migration in `migrations.php`, gleiches Muster wie alle bisherigen (idempotent, `CREATE TABLE IF NOT EXISTS`). Alle drei Tabellen sind **instanzweit**, kein `org_id` — ein Fahrer-Konto gehört keiner Org, genau wie beschlossen.

### `{prefix}_rider_user`
| Spalte | Typ | Hinweis |
|---|---|---|
| `id` | PK | |
| `email` | VARCHAR(191), UNIQUE | Instanzweiter Schlüssel |
| `password_hash` | VARCHAR(255) | `password_hash()`/PASSWORD_DEFAULT |
| `display_name` | VARCHAR(191) | Frei wählbar bei Registrierung |
| `status` | VARCHAR(16) DEFAULT 'active' | `active`/`disabled` (Reserve für Missbrauchsfälle) |
| `created_at` | DATETIME | |

### `{prefix}_rider_session`
| Spalte | Typ | Hinweis |
|---|---|---|
| `token_hash` | CHAR(64) PK | SHA-256, gleiches Muster wie `admin_session`/`checkpoint_session` |
| `rider_user_id` | INT UNSIGNED | FK-logisch auf `rider_user.id` |
| `expires_at` | DATETIME | |
| `created_at` | DATETIME | |

### `{prefix}_rider_claim`
| Spalte | Typ | Hinweis |
|---|---|---|
| `public_id` | VARCHAR(16) | Teil des zusammengesetzten Schlüssels, verweist auf `rider_slot.public_id` |
| `bib` | INT UNSIGNED | Teil des zusammengesetzten Schlüssels, verweist auf `rider_slot.bib` |
| `rider_user_id` | INT UNSIGNED | FK-logisch auf `rider_user.id` |
| `claimed_at` | DATETIME | |
| | PRIMARY KEY (`public_id`, `bib`) | Ein Slot gehört zu genau einem Konto — erneutes Claimen (mit gültigem Token/Code) überschreibt per `ON DUPLICATE KEY UPDATE` |
| | KEY (`rider_user_id`) | Für die Historie-Abfrage (§5) |

### `{prefix}_rider_password_reset`
| Spalte | Typ | Hinweis |
|---|---|---|
| `token_hash` | CHAR(64) PK | SHA-256 des Reset-Tokens |
| `rider_user_id` | INT UNSIGNED | FK-logisch |
| `expires_at` | DATETIME | 30 Minuten Gültigkeit ab Erzeugung |
| `created_at` | DATETIME | |

## 4. Auth- & Claim-Flow

Neue Actions in `rider.php`, kein Admin-Key, kein Org-Kontext — dieselbe Zugriffsklasse wie die bestehenden Fahrer-Aktionen (Token/Code-authentifiziert bzw. offen mit Rate-Limit).

```
POST ?a=rider-register   {email, password, displayName}
                          → legt rider_user an, gibt Session-Bearer zurück (Auto-Login)
POST ?a=rider-login      {email, password}
                          → prüft password_verify(), gibt Session-Bearer zurück
POST ?a=rider-forgot     {email}
                          → erzeugt Reset-Token, verschickt Mail (§5)
                          → IMMER dieselbe Erfolgsantwort, unabhängig ob E-Mail existiert
                            (Enumeration-Schutz)
POST ?a=rider-reset      {token, newPassword}
                          → prüft Token/Ablauf, setzt password_hash neu,
                            löscht ALLE rider_session-Zeilen dieses Kontos
POST ?a=rider-claim      Auth: X-Rider-Auth (Session-Bearer) + X-Rider-Token oder
                                X-Rider-Code (Slot-Nachweis, wie ?a=me)
                          Body: {publicId, bib}
                          → prüft Token/Code gegen rider_slot(public_id,bib),
                            schreibt/überschreibt rider_claim-Zeile
GET  ?a=rider-history    Auth: X-Rider-Auth (Session-Bearer)
                          → Liste aller geclaimten (public_id,bib), gejoint mit
                            rider_event (Name/Status) + eigenen rider_log-Zeilen
```

**Warum Claim denselben Token/Code-Nachweis braucht wie `?a=me`:** bloßes Eingeloggtsein reicht nicht — sonst könnte jedes Konto jede fremde Startnummer kapern, indem es einfach `{publicId, bib}` errät. Der Token/Code ist der physische Nachweis ("ich halte die Spokecard in der Hand"), exakt dieselbe Sicherheitsannahme wie beim bestehenden Check-in. `riderRecordFailure()`/`rider_ratelimit` (bestehende Infrastruktur) zählt auch hier fehlgeschlagene Nachweisversuche.

**Warum Claim überschreiben statt ablehnen darf:** wer den Token/Code kennt, hat dieselbe Autorität wie der ursprüngliche Claimer — deckt den Fall "Startnummer an jemand anderen weitergegeben" ohne Organizer-Eingriff ab.

**Pre-Race- und Post-Race-Fall sind derselbe Call.** Kein Zeitfenster, keine Statusprüfung auf dem Slot nötig — ob die Spokecard noch ungefahren oder schon eingecheckt ist, spielt für den Claim selbst keine Rolle.

## 5. Passwort-Reset per E-Mail

Pflichtfeature (siehe Konversation mit Thilo, 08.09.2026) — ohne Reset-Möglichkeit sperrt ein vergessenes Passwort das Konto endgültig aus.

**Versandweg:** eigener minimaler SMTP-Client (`stream_socket_client`, `AUTH LOGIN` Base64, kein Composer/Vendor-Library) — passt zum bestehenden Projekt-Prinzip "kein Framework, keine Abhängigkeiten außer den bereits dokumentierten Ausnahmen" (siehe CLAUDE.md, Tech-Stack). Kein `mail()`, weil Zustellung ohne SPF/DKIM/Reverse-DNS-Setup des Hosters unzuverlässig ist — ein Passwort-Reset, der im Spam-Ordner landet oder gar nicht zugestellt wird, ist funktional ein fehlendes Reset-Feature.

**Konfiguration:** instanzweite Einstellung (KV-Key `config:smtpSettings`: Host, Port, Benutzername, Passwort, Absender-Adresse, Absender-Name), analog zu `config:riderAppUrl`. Neuer SysAdmin-only Settings-Screen (Settings → Konto → E-Mail-Versand), da instanzweit und sicherheitsrelevant (SMTP-Zugangsdaten).

**Mail-Inhalt:** Klartext oder minimales HTML mit Link `<riderAppUrl>#reset.<token>`, 30 Minuten gültig. Rider-App bekommt eine neue Route `#reset.<token>` → Formular für neues Passwort → `POST ?a=rider-reset`.

**Fehlerfall (SMTP nicht konfiguriert oder Versand schlägt fehl):** `?a=rider-forgot` gibt trotzdem immer dieselbe Erfolgsantwort zurück (Enumeration-Schutz bleibt bestehen) — der Fehler wird serverseitig geloggt, nicht an den Client durchgereicht. Betreiber merkt einen kaputten SMTP-Versand also nicht am Symptom "Fahrer beschweren sich, Reset kommt nie an" — Settings-Screen bekommt deshalb einen "Test-Mail senden"-Button, der den konfigurierten SMTP-Pfad direkt prüft und den echten Fehler dem SysAdmin zeigt.

## 6. Rider-App-UI

Neue Screens in `dist/alleycat-rider.html` (`src/rider/*.js`):

- **Login/Register** — E-Mail + Passwort, Link "Passwort vergessen?" → `rider-forgot`-Formular.
- **Reset-Formular** — erreichbar über `#reset.<token>`, neues Passwort setzen.
- **Mein Profil** (neuer Tab neben Home/Progress) — zeigt Historie: Liste vergangener Teilnahmen (Event-Name, Datum/Status, eigene Checkpoint-Fortschritt/Zeit, wo vorhanden), sortiert neueste zuerst.
- **"Startnummer meinem Konto zuordnen"** — Button auf dem bestehenden Home/Progress-Screen. Eingeloggt: ruft direkt `rider-claim` mit dem aktuell aktiven Slot-Token auf. Nicht eingeloggt: Prompt zu Login/Register, danach automatisch Claim.

## 7. Sicherheits-/Datenschutz-Überlegungen

- **Enumeration-Schutz** bei `rider-forgot` (immer gleiche Antwort) und `rider-login` (gleiche Fehlermeldung bei falscher E-Mail vs. falschem Passwort).
- **Reset invalidiert alle Sessions** des Kontos — Standardverhalten, verhindert dass ein gestohlenes altes Session-Token nach einem Reset weiter funktioniert.
- **Claim ohne Token-Nachweis unmöglich** (§4) — die eigentliche Zugriffskontrolle bleibt beim physischen Kartenbesitz, nicht beim Konto.
- **Historie ist bewusst Org-übergreifend sichtbar.** Ein Fahrer sieht seine eigene Teilnahmehistorie über alle Orgs der Instanz hinweg — das ist selbst-geclaimte, eigene Information, keine Organizer-Datenleckage zwischen Orgs (Organizer-Daten wie Notfallkontakte, Personalplanung etc. bleiben wie bisher unsichtbar für Fahrer). Explizit vermerkt, kein stiller Nebeneffekt der Instanzweite-Konten-Entscheidung.
- **SMTP-Zugangsdaten** liegen wie andere Instanz-Konfiguration im KV-Store, nur für SysAdmin lesbar/schreibbar (gleiche Rollenprüfung wie andere instanzweite Settings).
- **Betriebsvoraussetzung:** Fahrer-Kontoerstellung ist ohne konfigurierten SMTP-Versand technisch möglich, aber nicht empfehlenswert (kein Reset möglich) — Settings-Screen zeigt einen Warnhinweis, wenn `config:smtpSettings` fehlt, ähnlich bestehenden Warnhinweisen im Data-Safety-Bereich.

## 8. Abgrenzung zum ersten Schritt (Multi-Tenancy)

Diese Arbeit ist unabhängig von Org/RBAC nutzbar — auch eine Single-Org-Installation profitiert von Fahrer-Konten. Die einzige Abhängigkeit: `rider_claim`/`rider-history` lesen `rider_event`, das aus der Multi-Tenancy-Migration stammt (bereits in `main`). Kein Rückbau, keine Wartezeit — beide Schritte sind bereits vollständig sequenziell umsetzbar.

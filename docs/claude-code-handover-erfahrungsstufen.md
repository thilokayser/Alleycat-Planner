# Handover: Erfahrungsstufen-System (Einsteiger / Fortgeschritten / Profi)

Für: Claude Code, Umsetzung im Alleycat-Dispatch-Repo.
Herkunft: Ausgearbeitet in einem Brainstorming-/Planungs-Chat mit Thilo, siehe `docs/erfahrungsstufen-vorschlag.md` (vollständiger Vorschlag mit Begründungen — dieses Dokument fasst die für die Umsetzung relevanten Entscheidungen zusammen und ergänzt sie um konkrete Implementierungshinweise).

**Bevor du anfängst:** Das ist ein Vorschlag mit einigen noch offenen Detailfragen (Abschnitt 6). Bei allem, was dort als offen markiert ist, bitte mit Thilo klären statt anzunehmen — insbesondere Abschnitt 5 (Feature-Zuordnung) ist nur teilweise bestätigt.

## 1. Ziel

Drei UI-Komplexitätsstufen, zwischen denen jeder Nutzer selbst wählt. Kein neues Datenmodell, keine unterschiedlichen Builds — ein UI-Filter über bestehende Funktionen, damit sowohl Einzel-Event-Freiwillige als auch Profi-Organizer mit Marshal-Personal aus derselben Codebasis bedient werden.

## 2. Architektur-Andockpunkt

- Erweiterung von `feature-registry.js`: jeder `FEATURE_REGISTRY`-Eintrag bekommt `minTier: 'einsteiger' | 'fortgeschritten' | 'profi'`.
- Neuer zentraler Helper (Vorschlag: `isFeatureVisible(featureKey)` in `feature-registry.js` oder `auth.js`), analog zu `currentUserCan()`. Rendering-Funktionen rufen diesen Helper statt Tier-Logik zu duplizieren.
- **Vor der Umsetzung: `feature-registry.js` und die tatsächlichen Registry-Keys lesen.** Die Feature-Zuordnung in Abschnitt 5 basiert auf der Doku (CLAUDE.md/PRODUCT.md), nicht auf dem echten Code — die Keys/Granularität dort können abweichen.
- State: `state.settings.experienceTier` (Name an bestehendes Settings-Schema anpassen, falls dort andere Konvention gilt).
- **Kein neuer Storage-Seam.** Läuft durch die vorhandene `storageGet`/`storageSet`-Abstraktion:
  - Server-Variante mit Account: gespeichert am Account-Datensatz (`{prefix}_admin_user`).
  - Local-Variante oder Server ohne persönlichen Account (Master-API-Key-Modus): `localStorage`, Gerät-gebunden.
  - Fallback-Logik: Account, wenn vorhanden — sonst Gerät.
- Geltung ist **pro Nutzer, nicht pro Event**. Zwei Organizer am selben Event können unterschiedliche Stufen sehen.

## 3. UI-Verhalten für höherstufige Funktionen

**Nicht verstecken — ausgrauen mit Tooltip.** Element bleibt im DOM/Layout sichtbar:
- `disabled`-Attribut
- CSS-Klasse (Vorschlag: `.feature-locked`)
- `title="Verfügbar ab Stufe Fortgeschritten"` (bzw. "Profi", je nach Feature)

Downgrade-Fall (Nutzer stuft zurück, hat aber schon High-Tier-Daten aktiv, z. B. konfigurierte Zonen): Warnung anzeigen, Wechsel aber **erlauben**. Bereits aktiv konfigurierte Funktionen bleiben immer bedienbar, unabhängig von der aktuellen Stufe — nur das *Neu-Anlegen* wird gesperrt.

## 4. Erststart-Flow

- Neuer Schritt zwischen `splashscreen.js` und `onboarding.js`.
- Drei Karten (Einsteiger/Fortgeschritten/Profi), je 2–3 Stichpunkte was enthalten ist.
- Auswahl oder "Später entscheiden" → letzteres setzt `experienceTier = 'einsteiger'` still im Hintergrund (Einsteiger ist der sichere Fallback-Default, kein stiller Default vor expliziter Wahl/Überspringen).
- Onboarding-Tour (`onboarding.js`) läuft danach wie gehabt, sollte aber nur auf Elemente zeigen, die in der gewählten Stufe sichtbar sind — sonst zeigt die Tour auf ausgegraute Elemente.
- Jederzeit änderbar unter Settings, vermutlich als neue Sidebar-Nav-Seite im bestehenden `.settings-layout`-Muster (siehe CLAUDE.md, Abschnitt "Sidebar-nav pages").

## 5. Feature-Zuordnung — bestätigter Stand

| Stufe | Enthält |
|---|---|
| **Einsteiger** | Event/Checkpoint-CRUD (5 Standard-Typen), Dashboard, Basis-Checkin inkl. QR-Scan, freie Checkpoint-Reihenfolge, Standard-Manifest-Export (ohne PDF-Baukasten-Anpassung), Splashscreen/Onboarding, Sonnenlicht-Theme, **CSV-Bulk-Import** (bewusst hier, nicht erst Fortgeschritten — auch als Einstieg über ein großes Beispiel-Rennen) |
| **Fortgeschritten** | + Teams & Kategoriegruppen, GPX/GeoJSON/KML-Import, fixe Checkpoint-Reihenfolge mit Override, Basis-Zones (Kreis/Polygon, kein Staged-Shrink), 2–3 einfache Game-Modes, Leaderboard-Filter, Social-Share-Cards, Route-Estimator/Proximity-Warnungen, custom Checkpoint-Typen, **Admin-Rollensystem & Benutzerverwaltung** (bewusst hier, nicht erst Profi) |
| **Profi** | + Alle 7 Game-Modes inkl. Staged-Shrink-Zones, HQ/Afterparty-Sonderorte, voller PDF-Baukasten (alle Blocktypen, Mehrfach-Attachment), Checkpoint-App-Auth-Konfiguration (Code/Account-Modus), Offline-Tile-Cache-Einstellungen, Auto-Backup-Konfiguration, Command Palette |

**Nicht stufenfiltern, immer aktiv:**
- Race-Status-Maschine (planning→ready→running→completed) — Kernworkflow.
- Datensicherheit (Auto-Backup-Verhalten selbst, Wake-Lock, Beforeunload-Schutz) — bleibt immer aktiv, auch wenn die *Einstellungen* dazu erst ab Profi sichtbar sind.

## 6. Offene Fragen — bitte vor/während der Umsetzung mit Thilo klären

1. **Klick auf gesperrtes Element**: direkt zum Stufen-Wechsel-Dialog springen, oder nur Tooltip, Nutzer navigiert selbst zu Settings?
2. **Granularität**: ganze Views sperren (z. B. komplette Sidebar-Seite ausblenden) oder auch einzelne Bedienelemente innerhalb einer sichtbaren View (z. B. Checkpoint-Editor sichtbar, "Custom-Typ anlegen"-Button darin gesperrt)? Zweiteres granularer, aber mehr Aufwand pro Formular — vermutlich pragmatisch view-weise anfangen und nur bei Bedarf feiner werden.
3. **Checkpoint-Personal-Rolle**: gilt das Stufensystem auch für Nutzer mit Rolle `checkpoint_staff`, oder ist es nur für Organizer-Rollen (Admin/Editor/Betrachter) relevant? Checkpoint-Personal sieht ohnehin nur die separate Checkpoint-App — evtl. hinfällig, aber sicherstellen.
4. **Zusammenspiel mit Rollen-System**: soll ein `viewer` Profi-Funktionen überhaupt *sehen* dürfen (nur nicht bearbeiten), oder greift die strengere Einschränkung aus Rolle UND Stufe kombiniert?
5. **Exakte Registry-Keys**: Abschnitt 5 ist ein Entwurf basierend auf Doku, nicht auf `feature-registry.js` selbst — beim Implementieren gegen echten Code abgleichen, Abweichungen mit Thilo besprechen statt eigenmächtig zu entscheiden.

## 7. Testabdeckung

- `test-suite.js` sollte um Tests ergänzt werden, die Tier-Filterung prüfen (z. B. "Feature X ist bei Tier Einsteiger disabled, bei Fortgeschritten aktiv").
- Falls das Visual-Regression-Vorhaben (`docs/visual-regression-vorschlag.md`) parallel umgesetzt wird: die drei Stufen sind ein weiterer State-Parameter, der die dort gelisteten Kern-Views beeinflusst — beim Aufsetzen der Baselines mitdenken, aber nicht zwingend alle Views × alle Stufen abdecken (gleiche Scope-Disziplin wie beim Theme-Sampling dort).

## 8. Nicht-Ziele (zur Abgrenzung)

- Keine unterschiedlichen Datenmodelle oder Builds pro Stufe.
- Keine Stufe pro Event, nur pro Nutzer.
- Kein hartes Entfernen von Funktionen bei Downgrade — nur UI-Sichtbarkeit ändert sich, Daten und Funktion bleiben erhalten.

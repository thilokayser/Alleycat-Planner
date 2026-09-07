# Alleycat Dispatch — Produktseite-Briefing (für Claude Design)

## Was ist das Projekt

Organizer-Tool für Alleycat-Rennen (Checkpoint-Straßenrennen für Fahrrad-Kuriere). Grassroots-Event-Software, kein Corporate-SaaS-Produkt: wird von ehrenamtlichen Organisator:innen draußen im Feld benutzt, oft bei Wind und Wetter, auf Handys und Laptops.

Das Tool selbst besteht aus vier Apps: Organizer (Event/Checkpoint-Planung, Dashboard), Rider (Fahrer-Check-in per QR/GPS), Checkpoint-Staff (Personal am Checkpoint scannt Fahrer ein), Beamer (Live-Leaderboard-Anzeige fürs Ziel/HQ). Läuft entweder komplett lokal im Browser (kein Server nötig) oder mit self-hosted PHP+MySQL-Backend fürs Team-Zusammenspiel. Kein zentraler Dienst des Herstellers, kein Account-Zwang, keine Abo-Bindung — der Organizer besitzt seine Daten vollständig.

## Ziel dieser Seite

Eigenständige Produktseite/Landingpage, die das Tool nach außen bewirbt — bisher existiert nur die App selbst (`dist/*.html`), keine Marketingfläche. Soll Organizer:innen, die ein Alleycat ausrichten wollen, überzeugen, es auszuprobieren.

**Hauptzielgruppe:** Organizer/Crews, die ein Rennen ausrichten wollen. Rider/Checkpoint-Personal tauchen nur als Nutznießer der jeweiligen App auf, nicht als eigene Werbe-Zielgruppe.

**Haupt-CTA:** "Live-Demo starten" → führt zu einer gehosteten Instanz von `alleycat-dispatch-local.html` (läuft rein im Browser, kein Setup nötig, sofort ausprobierbar). Sekundärer CTA: "Selbst hosten" → GitHub/Setup-Doku.

## Ton & Haltung

- Ehrlich, technisch kompetent, nicht Startup-Marketing-Sprech. Zielgruppe ist Szene-nah, durchschaut leere Buzzwords sofort.
- Selbstbewusst über die Abgrenzung zu gehosteten/kommerziellen Alternativen: kein Vendor-Lock-in, keine Abhängigkeit von einem fremden Server, volle Datenhoheit.
- Kein Vergleich mit oder Erwähnung von Konkurrenzprodukten auf der Seite selbst.

## Sprache

Zweisprachig, umschaltbar (Deutsch/Englisch), analog zur App selbst (Deutsch ist Quellsprache, Englisch wird synchron gepflegt).

## Visuelle Richtung

Eigene Identität, nicht generischer Tech-/SaaS-Look — abgeleitet aus der echten App-Farbwelt (`src/styles/themes.css`, Default-Theme). Straßen-/Werkstatt-/Depot-Charakter: Motive wie Asphalt, vergilbtes Papier, Tinte, Warnweste, Genehmigungsstempel, Stahl, Kreide (siehe auch `docs/logo-briefing.md`, dieselbe Metaphern-Familie).

**Farbpalette (Default/Dark, Rollen bleiben über alle App-Themes gleich):**

| Rolle | Hex | Verwendung |
|---|---|---|
| `asphalt` | `#17191a` | Haupt-Hintergrund, fast Schwarz |
| `paper` | `#eee5cd` | Content-Karten, warmes vergilbtes Papierbeige — Manifest/Ticket-Anmutung |
| `ink` | `#241f18` | Fließtext auf Papier-Flächen |
| `hivis` | `#ff5f1f` | Hauptakzent/CTA-Farbe, Warnorange |
| `stamp` | `#b23a2e` | Zweiter Akzent, für Badges/Hervorhebungen — Stempel-Motiv |
| `steel` | `#7c8388` | Sekundärtext, Rahmen |
| `chalk` | `#f3f1e8` | Fließtext auf dunklem Asphalt-Hintergrund |

Wiederkehrendes Gestaltungselement: Manifest-/Stempelkarten-Optik für Content-Blöcke (Checkpoint-Liste als Ticketstreifen, Feature-Punkte als "abgestempelte" Badges) — soll sich wie ein echtes Kurier-Dispatch-Formular anfühlen, nicht wie eine austauschbare SaaS-Landingpage.

## Seitenstruktur

1. **Hero** — Headline + Sub, Haupt-CTA "Live-Demo starten", sekundärer Link "Selbst hosten →"
2. **Kurz-Pitch** — was ist Alleycat Dispatch, ein Satz Abgrenzung (kein Cloud-Zwang, volle Datenhoheit)
3. **Vier-Apps-Übersicht** — Karten für Organizer/Rider/Checkpoint-Staff/Beamer, je mit Screenshot
4. **Feature-Tiefe** — Checkliste/Tabelle: Checkpoints & Zonen, Game-Modes, PDF-Baukasten/Bib-Druck, Offline-Fähigkeit, Rollensystem, Liga-/Saison-System
5. **So läuft ein Rennen** — 3 Schritte aus Organizer-Sicht: Checkpoints planen → Team vor Ort dispatchen → live Leaderboard/Beamer verfolgen
6. **Architektur-Transparenz** — eigene Sektion für technisch interessierte Organizer: self-hosted (PHP+MySQL, eigener Server) oder komplett lokal (Browser, kein Server), offline-fähig (Check-ins funktionieren ohne Netz, werden synchronisiert sobald wieder online), keine Blackbox — Code einsehbar
7. **FAQ** — mindestens: Wie viel Aufwand ist das Setup? Was kostet es? Was passiert mit den Daten? Funktioniert es ohne Internet vor Ort?
8. **Footer** — Impressum, Datenschutzerklärung (rechtlich nötig bei deutscher Zielgruppe, nicht optional), Kontakt

Sektionen 3/4/6 brauchen echte Screenshots — frisch angefertigt (nicht die alten aus `modern-redesign-proposal/`, die stammten aus einer veralteten Version fürs GitHub-Readme). Aktuelle Aufnahmen liegen unter [`docs/screenshots-produktseite/`](screenshots-produktseite/), erzeugt aus dem aktuellen `dist/alleycat-dispatch-local.html`-Build (Demo-Event "Kölner Kurierrennen"):

- `01-dashboard.png` — HQ-Board
- `02-map-checkpoints.png` — Checkpoint-Editor auf der Karte
- `03-event-overview.png` — Event-Übersicht mit Status-Kacheln
- `04-riders.png` — Fahrerliste inkl. druckfertiger Startnummern-/Bib-Karten mit QR-Code
- `05-leaderboard.png` — Live-Leaderboard mit Podium
- `06-manifest.png` — PDF-Manifest-Vorschau (Papier-/Stempel-Optik)
- `07-beamer.png` — Beamer-Live-Ansicht (Karte + Checkpoint-Fortschritt)

Spokecard-Druckvorschau (separates PDF-Layout, Pokerkarten-Format) fehlt noch — bei Bedarf gesondert nachreichen.

## Technische Anforderungen

- Muss ohne Server/Build lauffähig sein (plain HTML/CSS, minimales JS nur für Sprachumschalter) — passend zur Zero-Dependency-Philosophie der App selbst.
- Responsive: Organizer:innen lesen das auch mobil.
- Kein Tracking/Analytics-Skript ohne expliziten Cookie-Consent (Datenschutz ist Teil des eigenen Verkaufsarguments — Seite sollte selbst mit gutem Beispiel vorangehen).

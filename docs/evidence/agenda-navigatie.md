# A1 — Agenda en navigatie op max2

Uitgevoerd op 24 september 2026 voor T-6 / ST-003, sprint S-2026-09-24-2.
Code: `b2e4de9b4d25a442e1c51e31540dab5e5368789b`, vanaf main
`147be545839222e2c6cc6e0ef6cd5975fc4f0623`.

## Gecontroleerd gedrag

- De bestaande Chrome-sessie opent Agenda als landingspagina. Menu: Agenda,
  Volgen, Instellingen; Volgen bevat de negen bestaande series.
- Eén maand geeft op 24 september zes afleveringen van Lanterns en Slow Horses
  tot en met 23 oktober. Twee maanden geeft zeven afleveringen, inclusief Dexter
  op 30 oktober. Na herstart van uitsluitend de app blijft twee maanden bewaard.
  Na de proef is de voorkeur teruggezet op één maand.
- De algemene banner laadt vanaf de app. Beschrijvingen beginnen gesloten.
- Desktop en 375 px breed zijn visueel gecontroleerd. Agenda en Volgen hebben op
  375 px geen horizontale overflow. De toetsenbordfocus is zichtbaar (3 px).
- Gezondheid via de publieke HTTPS-URL en vanuit de container: HTTP 200.
  Het bannerbestand is aanwezig in het productie-image (HTTP 200, SVG).

## Databehoud en uitrol

Vorige release: `b31af05`. Nieuwe app-release/image: `b2e4de9`.
Vóór activatie is met SQLite's backup-API een consistente private backup gemaakt:
`/srv/apps/when2watch/db-backups/pre-b2e4de9-20260924T105908040788Z.db`
(0600; integrity check: ok).

Voor en na migratie, periodewijziging en app-herstart zijn aantallen én
inhoudshashes van bestaande tabellen vergeleken. Ze zijn ongewijzigd:

| Tabel | Rijen |
|---|---:|
| User / Account / Session / CalendarSettings | elk 1 |
| TrackedShow | 9 |
| Episode | 170 |
| CalendarEventLink | 11 |
| Probe | 1 |
| SyncRun | 12 |

Alleen de nieuwe UserPreferences-rij is toegevoegd (1 maand, Europe/Amsterdam).
De proef heeft geen synchronisatie of Google-write aangeroepen. Database-integriteit
blijft `ok`. De `current`-symlink is pas na geslaagde controles omgezet.

De migratie is toevoegend. De vorige release kan bij een A1-probleem worden
teruggezet zonder bestaande agenda-/seriegegevens te verwijderen.

## Automatische verificatie

- Baseline: 64 tests geslaagd.
- A1: 87 tests geslaagd; typecheck en productiebuild geslaagd.
- HTTP-proef met echte Next.js-server en tijdelijke SQLite: 80 controles geslaagd.
  Google is daarin gesimuleerd.
- De tests dekken maandafkapping, schrikkeljaar, jaarwisseling, tijdzonegrenzen,
  eigenaarisolatie, strikte invoer, opgeslagen voorkeuren en migratiebehoud.
- Een verbreed/verkleind schermvenster en databaseheropening veranderen geen
  event-ID, payload of hash en veroorzaken geen extra bron-/Google-aanvragen.

Dit bewijst A1. Accountwissel, nieuwe installatie en nieuwe meldingsproeven horen
bij de latere taken; deze resultaten claimen daarover niets.

## Administratie

Implementatie, tests en commit zijn via Scrum4Me gelogd. Taakstatus bijwerken
faalt door de bestaande ISS-7 (`tasks.dispatch_request_id` ontbreekt in de
aangesloten MCP-database). Geen directe statuswrite, migratie of serverherstart
uitgevoerd om dit te omzeilen.

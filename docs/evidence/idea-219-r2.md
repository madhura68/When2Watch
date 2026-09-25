# IDEA-219 R2 — bewijs en acceptatiematrix

Status: **R2 is technisch compleet en de repetitie is geslaagd; de openstelling wacht op JP.** Nog niet uitgevoerd:
de praktijkproef met twee accounts, de iPhone/iPad-proef, de controle op werkelijk ontvangen meldingen en de
sentinelproef in de proxylogs. Dit document noemt geen onuitgevoerde proef PASSED.

Branch `claude/idea-219-r2`. Lokaal: vitest 248/248 op PostgreSQL 17, typecheck, build, HTTP-smoke 187 asserties,
Docker-build (runtime en tools). Geen productiesecrets in tests of CI.

## Acceptatiematrix (specificatie A1–A12)

| Id | Criterium (kort) | Bewijs | Resultaat |
|---|---|---|---|
| A1 | < 4 tekens: 0 bronaanvragen; 500 ms; laat antwoord overschrijft niet | `tests/search.test.ts` (vier tekens, late success/failure), `SEARCH_DEBOUNCE_MS=500` | PASSED (synthetisch) |
| A2 | Twee gebruikers: gedeelde cache/catalogus, één snapshot | `tests/idea219-acceptance.test.ts` (meting hieronder), `tests/search-cache.test.ts`, `tests/shared-sync.test.ts` | PASSED (synthetisch); praktijkmeting open |
| A3 | Bronstoring/429/onvolledig verwijdert niets; herstel verwerkt gemiste wijziging | `tests/catalog.test.ts` (applied pas na volledige snapshot, retry), `tests/tvmaze.test.ts` (429/5xx) | PASSED (synthetisch) |
| A4 | A krijgt nooit B's data via UI/API/ID's/export/cache | `tests/user-isolation.test.ts`, `tests/privacy.test.ts` (export), `tests/shared-sync.test.ts`, smoke (401/403/404, no-store) | PASSED (synthetisch); twee-accountproef open |
| A5 | Uitnodiging één keer, passend geverifieerd account | `tests/invitations.test.ts` (echte NextAuth-callbackvolgorde, race, geen vrije registratie) | PASSED (synthetisch); praktijk open |
| A6 | Blokkeren stopt sessies en sync; gewone gebruiker geen beheer/counts | `tests/admin-users.test.ts`, `tests/shared-sync.test.ts` (cron slaat BLOCKED over), smoke (403 op admin en stats) | PASSED (synthetisch) |
| A7 | Alleen admin, juiste aantallen, Proberen eenmaal, blokkeren/verwijderen telt mee | `tests/admin-stats.test.ts` | PASSED (synthetisch) |
| A8 | Eigen agendanaam, naamconflict, hernoemen behoudt binding, alleen bewezen app-agenda | `tests/limited-calendar.test.ts`, `tests/calendar-settings.test.ts` | PASSED (synthetisch) |
| A9 | Echte Google-proef met beperkte scopes | P1: `docs/evidence/idea-219-preflight.md` (PASSED: app-agenda CRUD, lijst gepagineerd, legacy-agenda 404, refresh) | PASSED (P1-script); herhaling via de uiteindelijke UI open |
| A10 | Na migratie gelijke ID's, series, events, hashes; eerste sync zonder duplicaten | R1: `docs/evidence/idea-219-r1.md` (0 verschillen, readback 23/23, eerste sync 0 writes); R2-repetitie hieronder (verify 0 problemen) | PASSED (R1 productie, R2 repetitie) |
| A11 | iPhone/iPad-PWA: login, agenda, volgen, instellingen, wisselen van login | — | OPEN (JP) |
| A12 | Export/verwijderen alleen eigen data; restore brengt verwijderde gebruiker niet terug | `tests/privacy.test.ts` (A/B, journaal, backup-restore), `tests/credentials.test.ts` | PASSED (synthetisch) |

Product-DoD (werkelijk ontvangen melding in de gekozen agenda): **open** voor R2. Het bewijs uit R1/increment 1
(24 september) geldt voor de oude agenda, niet voor een nieuwe When2Watch-app-agenda.

## TVmaze-verkeer (A2), gemeten op de echte client

`tests/idea219-acceptance.test.ts` telt de uitgaande aanvragen van de TVmaze-client, inclusief spacing en retries,
over een synthetisch transport. Google-verkeer telt niet mee.

| Stap | TVmaze-aanvragen |
|---|---|
| A zoekt "Slow Horses" | 1 (zoeken) |
| B zoekt "  slow   horses " | 0 (gedeelde cache) |
| A volgt (Proberen) | 2 (snapshot + artwork) |
| B volgt dezelfde serie | 0 |
| Beide openen hun overzicht | 0 |
| B stopt en volgt opnieuw binnen het uur | 0 |
| Dagelijkse run, bron ongewijzigd | 1 (update-index) |
| B volgt opnieuw de volgende dag | 1 (snapshot, maximaal één per serie per uur) |

Gevonden en opgelost tijdens deze meting: een eerste snapshot bewaarde zijn eigen TVmaze-versie niet. Daardoor
haalde de eerstvolgende dagelijkse run elke nieuw gevolgde serie nog één keer op. In productie toont
`/beheer/series` de teller sinds de laatste start.

## R2-repetitie op max2 (25 september 2026, release 811cffb)

`deploy/rehearse-r2.sh`: een bevroren `pg_dump` van de live database, een privé-container op een intern netwerk
zonder egress (`egress_check blocked`), en synthetische secrets. Productie bleef `healthy` op image `8b87838`.

| Stap | Resultaat |
|---|---|
| Kopie | 106 612 bytes, 120 ms; vooraf 1 user, 23 series, 478 afleveringen, 23 links, 2 sessies |
| Expand-migratie | 1,6 s |
| Backfill | 23 catalogusseries, 478 afleveringen, 23 follows, 1 binding, 23 links, 1 probe; 2 sessies ingetrokken; retry `already-completed` |
| verify-catalog | passed, 0 problemen |
| Versleutelen | 1 account, 1 clientsecret; retry: 0 nieuw, 3 al verzegeld; plaintext-secrets daarna 0 |
| Journaal | aangemaakt; tweede `init` geweigerd |
| Na afloop | 1 admin, 23 follows, 0 links zonder eigenaar, 0 sessies |
| App | start 1,6 s, health 200; `/api/shows` zonder sessie 401; `/privacy` 200; herstart 1,6 s, health 200 |
| Startcontrole | zonder journaal: stopt met exit 66 |
| Backup en herstel na R2 | herstel 0,7 s; journaal toegepast (0 verwijderingen); verify passed, 0 problemen |

Eerdere run op f4b1c4e: het script gaf de backfill-variabelen na de imagenaam mee. De backfill draaide daardoor niet
en de startcontrole weigerde de start terecht ("catalog backfill has not completed"). Hersteld in 811cffb.

## Open vóór openstelling (JP)

1. **Overgang van de eigenaarsagenda (beslissing).** De huidige agenda van JP heeft geen bewijs van aanmaak door de
   app (geen `CalendarCreationAttempt`). Na de backfill is de binding dus `LEGACY_UNVERIFIED`. Met de beperkte
   rechten pauzeert de sync; P1 bewees dat Google zo'n agenda met 404 weigert. Voorgestelde keuze: bij de
   openstelling maakt JP in Instellingen een nieuwe When2Watch-agenda en stapt bewust over. De oude afspraken
   blijven dan in de oude agenda staan.
2. Twee-accountproef (A2/A4/A5/A6/A7/A8), met herkenbare proefagenda's.
3. iPhone/iPad-PWA (A11) en een werkelijk ontvangen melding in de nieuwe agenda (product-DoD).
4. Sentinelproef in proxy-, Next- en foutlogs vóór openstelling (zie runbook §5).
5. Een expliciete opdracht voor merge en uitrol.

# IDEA-219 R1 — bewijs providerwissel (T-18/T-19)

Status 25 september 2026: **code, lokale gates en repetitie op een privékopie geslaagd. Forgejo-CI en de geautoriseerde productie-omschakeling nog open.**

## Lokale gates (PostgreSQL 17.11, macOS)

| Gate | Resultaat |
|---|---|
| `npm test -- --maxWorkers=2 --testTimeout=30000 --hookTimeout=30000` | 178/178 (22 bestanden) |
| `npm run build`, `npm run typecheck` | geslaagd |
| `npm run test:http` | 154 asserties, echte Next + tijdelijke PostgreSQL-database |
| `docker build .` | geslaagd |
| Rollen/start (lokaal, synthetisch) | runtime-rol: `CREATE TABLE` geweigerd, DML toegestaan, `_prisma_migrations` alleen lezen; start vóór migratie exit 65, met `file:`-DSN exit 64; migratie als app-rol faalt, als migrator slaagt; daarna health 200 |

## Repetitie op max2 — 25 september 15:51 UTC

`deploy/rehearse-r1.sh`, release `469e1a9` (zelfde code als de huidige branch, op documentatie na). Privémap 0700, intern Docker-netwerk zonder egress (TVmaze-fetch vanuit de tools-container: **blocked**), geen proxy, geen cron, synthetische app-secrets. Productie bleef `when2watch:fb7a690`, healthy.

| Fase | Duur |
|---|---|
| SQLite backup-API van de live database (read-only) | 50 ms |
| `migrate deploy` baseline (migrator-rol) | 1,7 s (incl. containerstart) |
| Export / import / verify | 24 / 125 / 16 ms |
| App-start tot health 200 (runtime-rol) | 1,6 s; `/api/shows` zonder sessie 401 |
| Herstart tot health 200 | 1,7 s |
| `pg_dump -Fc` / restore naar aparte database | 167 ms (105 kB) / 556 ms |

Bron: sha256 `c02bc1f8…adb31` (gelijk aan de preflightbackup van 15:31 — de live database was in die tijd niet gewijzigd). Run-ID `d30483ca-2db5-4ec1-8407-6cb46784059b`.

Invarianten (DB-plan §6), viermaal gemeten — na import, na app-start, na herstart en op de gerestorede dump — telkens **passed, 0 verschillen per veld en relatie**:

| Tabel | Rijen | Tabel | Rijen |
|---|---|---|---|
| User | 1 | Episode | 469 |
| Account | 1 | CalendarEventLink | 23 |
| Session | 2 | SyncRun | 28 |
| VerificationToken | 0 | OAuthClientConfig | 1 |
| UserPreferences | 1 | Installation | 1 |
| CalendarSettings | 1 | GoogleConnectionAttempt | 0 |
| Probe | 1 | CalendarCreationAttempt | 0 |
| TrackedShow | 22 | | |

Geheimen (tokens, clientsecret) zijn alleen in het geheugen vergeleken; het rapport bevat geen waarden of hashes daarvan. Na afloop zijn containers, netwerk, images, kopie, manifest en dump verwijderd.

Tijdens de repetitie gevonden en hersteld: `pg_isready` via de socket slaagt al tijdens de init-server (nu `-h 127.0.0.1`, ook in compose); het init-script moet leesbaar zijn voor uid 999; de tools-image bouwt als `node`.

## Niet bewezen / open

- **Forgejo-CI** met de `postgres:17`-service is nog niet gedraaid.
- **Afbreken vóór nieuwe writes** is niet live uitgevoerd (zou de productiecontainer stoppen). Wel aangetoond: de bron wordt alleen read-only geopend en bleef bytegelijk; de terugweg staat in het [cutover-runbook](../runbooks/idea-219-r1-cutover.md#5-afbreken-en-herstel).
- **Readback-dry-run tegen echte Google** hoort bij de cutover (vereist egress); in CI getest met gesimuleerde Google (alleen GET, geen DB-writes).
- **Productie-omschakeling**, eigenaar-acceptatie en eerste sync zonder migratieduplicaten: wachten op JP's uitrolopdracht. R2 (T-20 e.v.) begint pas daarna.

# IDEA-219 R1 — bewijs providerwissel (T-18/T-19)

Status 25 september 2026: **R1 staat in productie op PostgreSQL 17 (release `8b87838`). Import en eerste sync zonder verschillen of duplicaten. Wacht nog op eigenaar-acceptatie in de UI.**

## Gates

Forgejo-CI op PR #5, commit `32c0b85`: **success** (postgres:17-service, tests, build, typecheck, HTTP-smoke, Dockerbuild, tools-image). Onafhankelijke review van de hele branch: 0 Critical; 3 Important opgelost met eerst falende tests.

### Lokaal (PostgreSQL 17.11, macOS)

| Gate | Resultaat |
|---|---|
| `npm test -- --maxWorkers=2 --testTimeout=30000 --hookTimeout=30000` | 181/181 |
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

## Productie-omschakeling — 25 september 2026 (JP: "doe de merge en start de omschakeling")

PR #5 gemerged als `8b87838` (inhoud gelijk aan `cb35f1a`; laatste code-CI groen op `d0473fe`, daarna alleen documentatie; Actions daarna door JP gepauzeerd). Repetitie op `8b87838` vooraf opnieuw: viermaal 0 verschillen, egress geblokkeerd.

| Stap (UTC) | Resultaat |
|---|---|
| Voorbereiding | Release-map, `.env.db`/`.env.migrate` (0600, nieuwe wachtwoorden), `DATABASE_URL` app-rol aan private `.env` toegevoegd (backup in `config-backups`). `when2watch-db-1` (postgres:17) alleen op `when2watch_database`, geen hostpoort; baseline gemigreerd met de migrator-rol. |
| Drain | Cron-regel verwijderd (backup `config-backups/crontab.before-8b87838.*`). Lopende sync 0, onzekere eventlinks 0, verzonden agenda-aanmaak 0, open OAuth-flows 0. |
| 19:18:30 writer dicht | `when2watch-web-1` (fb7a690) gestopt. |
| Snapshot | `db-backups/pre-8b87838-20260925T191830Z.db` (0600), integrity ok, 0 FK-fouten; sha gelijk aan de preflightbackup (`c02bc1f8…`). |
| Import + verify | Run `e0291d62-f2da-4571-8087-4544bdd1a53e`: export 13 ms, import 151 ms, verify 24 ms; **passed, 0 verschillen**; 1 user, 22 series, 469 afleveringen, 23 eventlinks, 28 syncruns. |
| Achter onderhoud | Nieuwe app zonder proxy: health 200; verify opnieuw 0 verschillen. Readback (alleen GET, token in geheugen): **23 links, 23 unchanged**, 0 remoteChanged/missing/foreign/pending/otherCalendar. |
| ± 19:19 open | `when2watch-web-1` = `when2watch:8b87838`, healthy; `current` → release `8b87838`; HTTPS health 200, `/api/shows` zonder sessie 401; cron-regel terug. Schrijfvrije periode ± 1 minuut. |
| 19:19:26 eerste sync | Via het cronscript (trigger `cron`): **success; created 0, updated 0, deleted 0, unchanged 21, failed 0** over 22 series. Alle 23 eventlinks met gelijke ID, event-ID en status; 0 nieuwe links. |
| Opruimen | Privémanifest, bronkopie en migratieconfig verwijderd; alleen het tellingenrapport en de pre-backup blijven. SQLite-bron en vorige release/image blijven bewaard voor herstel. |

## Niet bewezen / open

- **Afbreken vóór nieuwe writes** is niet live uitgevoerd (zou de productiecontainer stoppen). Wel aangetoond: de bron wordt alleen read-only geopend en bleef bytegelijk; de terugweg staat in het [cutover-runbook](../runbooks/idea-219-r1-cutover.md#5-afbreken-en-herstel).
- **Eigenaar-acceptatie:** JP logt in en bevestigt dezelfde series, Agenda, voorkeuren en Google-koppeling. Daarna is R1 geaccepteerd en kan R2 (T-20 e.v.) starten.
- **Afbreken vóór nieuwe writes** bleef ongebruikt; de terugweg (fb7a690 + ongewijzigde SQLite) blijft beschikbaar tot er PostgreSQL-writes zijn — die zijn er inmiddels (sync), dus herstel loopt nu via DB-plan §7.

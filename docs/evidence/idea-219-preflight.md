# IDEA-219 P1 — preflight (T-17)

Status 25 september 2026: **bron, host en SQLite-opslagtypen vastgesteld; echte Google-proef nog open** (zie §5).

## 1. Bron

| Item | Waarde |
|---|---|
| origin/main | `53a8a2f7a080236e5f847edc531c529c5ff46380` = plan-`source_commit`; geen drift |
| Productierelease max2 | `fb7a690` (`/srv/apps/when2watch/current`), voorouder van 53a8a2f; verschil alleen CI en documentatie, `prisma/` en `src/` identiek |
| Schema-SHA-256 (`prisma/schema.prisma`) | `e158fd1d10ffa94c5585e9e3c1aa69dd5d3e956856bcc65df478eeaad773a1ba` |
| SQLite-migraties | 9, `20260923160000_initial` t/m `20260924200000_series_trying` |
| Applicatiemodellen | 15, gelijk aan DB-plan §2 |

## 2. Host max2 (read-only gelezen)

| Item | Bevinding |
|---|---|
| Database | `/srv/apps/when2watch/data/when2watch.db`, 466.944 bytes, map 0700/bestand 0600; geen `-wal`/`-shm` naast het bestand |
| Writer | één container `when2watch-web-1` (healthy), één proces; geen tweede writer |
| Cron | alleen `5 6 * * * … when2watch-sync.sh … # When2Watch daily` (Europe/Amsterdam) |
| Schijf | 643 GB vrij op `/` |
| Host-sqlite | geen `sqlite3`-CLI; `python3` met SQLite 3.46.1 (backup-API beschikbaar, zoals eerdere backups) |
| PostgreSQL op host | `postgres:17` draait al voor andere apps (`scrum4me-postgres` op 127.0.0.1:5432, `media-organizer-postgres` op LAN-poort 5433) |
| Runtime-env | sleutels ALLOWED_GOOGLE_EMAIL, CRON_SECRET, GOOGLE_CALENDAR_ID, GOOGLE_CLIENT_ID/SECRET, NEXTAUTH_SECRET/URL, RELEASE_TAG; `compose.yaml` zet `DATABASE_URL` hard op `file:` en overschrijft daarmee `.env` (reviewpunt ronde 3, P2/P3) |

## 3. Keuzes

- **PostgreSQL-major: 17**, gepind voor CI, tests en productie (`postgres:17`), gelijk aan de al draaiende hostversie.
- **Eigen When2Watch-database** in een eigen `postgres:17`-container binnen het compose-project `when2watch`, alleen op een intern Docker-netwerk; **geen hostpoort**. Andere clusters (scrum4me, media-organizer) worden niet gedeeld of gewijzigd.
- **Rollen:** `when2watch_migrator` bezit het schema en voert alleen `prisma migrate deploy` uit als afzonderlijke releasestap; `when2watch_app` krijgt uitsluitend `CONNECT`, `USAGE` op het schema en `SELECT/INSERT/UPDATE/DELETE` op applicatietabellen. Geen superuser, geen `CREATEDB`.
- Werkelijke provisionering gebeurt pas in de geautoriseerde uitrolscope (P3-runbook), niet in P1.

## 4. Bronmanifestcontract (invoer voor P2)

Manifest v1, privé (map 0700, bestanden 0600), nooit in Git/CI:

```json
{ "version": 1, "runId": "<uuid>", "exportedAt": "<ISO UTC>",
  "schemaSignature": "<sha256 van de tabel-DDL, gelijk aan de gearchiveerde migraties>",
  "migrations": ["<9 namen; checksums gecontroleerd tegen prisma/legacy-sqlite>"], "sourceSha256": "<sha256 van het backupbestand>",
  "tables": { "<Model>": { "count": 0, "key": ["id"], "rows": [ { "<veld>": "tekst | getal | true/false | null | {\"$date\": \"<ISO ms Z>\"}" } ] } } }
```

Implementatie: `scripts/migration/manifest.ts`, `sqlite-export.ts`. Conversieregels (bevestigd door de typeninspectie van §5): DateTime alleen uit SQLite-INTEGER (Unix-milliseconden), TEXT `YYYY-MM-DD HH:MM:SS[.fff]` (UTC, uit `DEFAULT CURRENT_TIMESTAMP`) of ISO-8601 met `Z`; ieder ander opslagtype is een exportfout. Booleans alleen 0/1 of `true`/`false`. Int alleen veilige gehele getallen. Datumstrings (`airdate`, `date`, `lastDate`) en JSON-tekst ongewijzigd als tekst. Null en lege string blijven verschillend. `_prisma_migrations` wordt nooit geëxporteerd. Een bron met afwijkend schema, onvoltooide migratie, integriteits- of FK-fout wordt geweigerd; er wordt niets gerepareerd.

## 5. SQLite-backup en opslagtypen (15:31 UTC)

Consistente kopie via de SQLite backup-API: `/srv/apps/when2watch/db-backups/idea219-preflight-20260925T153129Z.db`, mode 0600, sha256 `c02bc1f8182f5ba0b6d34a21308e0a099582e09d9110195ce8299f54143adb31`. `journal_mode=delete`, `integrity_check=ok`, 0 foreign-key-overtredingen. `_prisma_migrations`: alle 9 archiefmigraties voltooid, geen rolled back.

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

Opslagtypen: **alle gevulde DateTime-kolommen zijn INTEGER (Unix-milliseconden)**, ook kolommen met `DEFAULT CURRENT_TIMESTAMP` (Prisma schrijft de waarde zelf). Alle booleans INTEGER 0/1. Nullable tekstkolommen bevatten alleen `text` of `null`. Er is dus geen tekst-datum in de productiebron; de importer ondersteunt die vorm wel (getest) maar hoeft hem hier niet te gebruiken.

## 5b. Open punt

**Echte Google-proef** met `scripts/prove-limited-calendar.ts`: vereist een apart proef-OAuth-client, een proefaccount en JP's toestemmingsklik ([runbook](../runbooks/idea-219-google-proef.md)). Uitkomst nu: **BLOCKED — not executed: authorize**. Een fixture-run geldt niet als proef. Dit blokkeert P9/R2, niet de providerwissel van R1.

## 6. Meetplan downtime (uitvoering in P3-repetitie)

Per fase wandkloktijd loggen: writers dicht → backup-API → export → `migrate deploy` baseline → import → verify → app-start + health → read-only readback. Met een bron van ~0,5 MB wordt de omschakeling in seconden verwacht; het onderhoudsvenster wordt pas na de repetitiemeting vastgelegd.

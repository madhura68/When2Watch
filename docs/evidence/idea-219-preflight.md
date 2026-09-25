# IDEA-219 P1 — preflight (T-17)

Status 25 september 2026: **bron en host vastgesteld; SQLite-backup/typeninspectie en echte Google-proef nog open** (zie §5).

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
  "schemaSha256": "<sha van prisma/schema.prisma van de bronrelease>",
  "migrations": ["<9 namen>"], "sourceSha256": "<sha van backupbestand>",
  "tables": { "<Model>": { "count": 0, "primaryKey": ["id"], "rows": [ { "<kolom>": { "t": "text|int|real|null|bool|datetime", "v": "..." } } ] } } }
```

Conversieregels (definitief na de typeninspectie van §5): DateTime-kolommen accepteren alleen SQLite-INTEGER als Unix-milliseconden of TEXT in het vaste formaat `YYYY-MM-DD HH:MM:SS[.fff]` (UTC, uit `DEFAULT CURRENT_TIMESTAMP`) of ISO-8601 met `Z`; ieder ander opslagtype is een exportfout. Booleans alleen 0/1. Datumstrings (`airdate`, `date`, `lastDate`) en JSON-tekst ongewijzigd als tekst. Null en lege string blijven verschillend. `_prisma_migrations` wordt nooit geëxporteerd.

## 5. Open punten

1. **Consistente SQLite-backup + typeninspectie** (backup-API, `integrity_check`, `foreign_key_check`, `typeof`-verdeling per kolom zonder waarden). Het commando staat klaar in [het runbook](../runbooks/idea-219-google-proef.md#sqlite-preflightbackup); de uitvoering vanuit de agentsessie werd door de permissielaag geweigerd (productie-read) en wacht op JP.
2. **Echte Google-proef** met `scripts/prove-limited-calendar.ts`: vereist een apart proef-OAuth-client, een proefaccount en JP's toestemmingsklik. Uitkomst nu: **BLOCKED — not executed: authorize**. Een fixture-run geldt niet als proef.

## 6. Meetplan downtime (uitvoering in P3-repetitie)

Per fase wandkloktijd loggen: writers dicht → backup-API → export → `migrate deploy` baseline → import → verify → app-start + health → read-only readback. Met een bron van ~0,5 MB wordt de omschakeling in seconden verwacht; het onderhoudsvenster wordt pas na de repetitiemeting vastgelegd.

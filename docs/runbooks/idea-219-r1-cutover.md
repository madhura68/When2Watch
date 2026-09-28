# IDEA-219 R1 — cutover SQLite → PostgreSQL op max2

Deze omschakeling is **niet** geautoriseerd door dit document. Uitvoeren alleen na expliciete opdracht van JP voor een concrete release-SHA en onderhoudsmoment. R1 verandert geen OAuth-rechten, agenda of remote events.

Bewezen vooraf: repetitie op een privékopie zonder egress ([bewijs](../evidence/idea-219-r1.md)): hele pijplijn < 1 s, app-start < 2 s. Onderhoudsvenster voorstel: **15 minuten**, waarvan het schrijfvrije deel (stap 4–8) enkele minuten.

## 0. Vooraf (app blijft open)

1. CI groen voor de release-SHA; repetitie (`deploy/rehearse-r1.sh`) op die SHA geslaagd.
2. Release-map: `git archive <sha>` naar `/srv/apps/when2watch/releases/<sha>`; `chmod 0644 deploy/postgres-init.sh` (de postgres-entrypoint draait als uid 999).
3. Privéconfig in `/srv/apps/when2watch/` (0600, nooit printen), gesymlinkt in de release-map:
   - `.env.db`: `POSTGRES_PASSWORD`, `W2W_MIGRATOR_PASSWORD`, `W2W_APP_PASSWORD` (willekeurig, ≥ 32 tekens).
   - `.env.migrate`: `MIGRATION_DATABASE_URL=postgresql://when2watch_migrator:…@db:5432/when2watch`.
   - `.env`: bestaande sleutels plus `DATABASE_URL=postgresql://when2watch_app:…@db:5432/when2watch`. Controle zonder waarde te tonen: `grep -c '^DATABASE_URL=postgresql://when2watch_app:' .env` → `1`.
4. `mkdir -m 700 /srv/apps/when2watch/postgres`; images bouwen: `RELEASE_TAG=<sha> docker compose -p when2watch build web` en `docker build --target tools -t when2watch-tools:<sha> .`.
5. `docker compose -p when2watch up -d db` (alleen db; intern netwerk, geen hostpoort) → healthy. `docker compose -p when2watch --profile migrate run --rm migrate` → "All migrations have been successfully applied".

## 1. Onderhoud en drain

1. Cron uit: bewaar `crontab -l` in `config-backups/crontab.<ts>`, verwijder alleen de regel `# When2Watch daily`.
2. Wacht tot geen synchronisatie loopt en er geen onzekere intenties zijn (read-only op de live DB):
   `SyncRun.status='running'`, `CalendarEventLink.status IN ('prepared','updating','deleting')`, `CalendarCreationAttempt.status='sending'`, `GoogleConnectionAttempt.status='pending' AND expiresAt>now`. Alles 0, anders eerst afhandelen (JP: handmatige sync / flow laten verlopen); niets geforceerd resetten.
3. Stop de oude writer: `docker stop when2watch-web-1`. Hiermee zijn ook OAuth-callbacks dicht (proxy geeft 502). Vanaf nu is de bron bevroren.

## 2. Snapshot, import, verificatie

1. Definitieve backup met de SQLite backup-API naar `db-backups/pre-<sha>-<ts>.db` (0600), `integrity_check=ok` (commando: [preflightrunbook](idea-219-google-proef.md#sqlite-preflightbackup)).
2. Privé `migration/config.json` (0600): `sourceSqlite` = die backup, `manifest` = `…/migration/manifest.json`, nieuwe `runId`, `targetDatabaseUrl` = migrator-DSN.
3. Tools-container **alleen op het interne netwerk** (geen egress):
   `docker run --rm --network when2watch_database -v …/migration:/private -e W2W_MIGRATION_CONFIG=/private/config.json when2watch-tools:<sha> npx tsx scripts/migration/rehearse.ts --phase=migrate`
   Vereist: `report.passed=true`, alle `differenceCounts` 0, `tableCounts` gelijk aan de bron. Anders: afbreken (§5a).

## 3. Starten achter onderhoud en dry-run

1. Start de nieuwe web-container eerst zonder proxy: `docker run -d --name w2w-r1-check --network when2watch_database --read-only --tmpfs /tmp --user 1000:1000 --env-file .env when2watch:<sha>` → `/api/health` 200 (start weigert een niet-PostgreSQL-DSN of ongemigreerd schema). Daarna `--phase=verify` opnieuw: nog steeds 0 verschillen.
2. Readback-dry-run (alleen GET naar Google, token alleen in geheugen, geen DB-writes): tools-container met egress én databasenetwerk, `DATABASE_URL` = app-DSN via `--env-file`. `docker run` koppelt één netwerk bij aanmaak, dus:
   `docker create --name w2w-readback --env-file .env when2watch-tools:<sha> npx tsx scripts/migration/readback.ts --authorized-readback && docker network connect when2watch_database w2w-readback && docker start -a w2w-readback; docker rm w2w-readback`
   Verwacht `missing=0`, `foreign=0`, `remoteChanged=0`, `pending=0`, `otherCalendar=0`; `sourceChanged` zijn TVmaze-wijzigingen sinds de laatste sync en worden bij de eerste sync verwerkt (apart verklaren, geen migratie-effect). Exitcode 2 = eerst onderzoeken.
3. `docker rm -f w2w-r1-check`.

## 4. Openen

1. `RELEASE_TAG=<sha> docker compose -p when2watch up -d web`; wijs `current` naar de release. Pak daarna `compose.yaml` van de vorige release in ([deploy/README.md](../../deploy/README.md), "Eén los `compose.yaml` per project").
2. HTTPS-health 200; JP logt in en ziet dezelfde series, Agenda, voorkeuren en Google-koppeling.
3. Cron terugzetten (zelfde regel). Eerste sync (handmatig door JP of 06:05-cron): `SyncRun` succesvol; bestaande `CalendarEventLink`-ID's en event-ID's ongewijzigd, `created` alleen voor echte nieuwe afleveringen.
4. Leg bewijs vast in `docs/evidence/idea-219-r1.md` (release, image, run-ID, tijden, verify-rapport; geen waarden).
5. Het manifest bevat tokens en clientsecret in platte tekst: verwijder `migration/manifest.json` zodra de eerste sync is geaccepteerd; de SQLite-backup blijft de herstelbron (maximaal 30 dagen bewaren).

## 5. Afbreken en herstel

**a. Vóór openen (geen nieuwe writes op PostgreSQL):** stop/verwijder `w2w-r1-check` en de nieuwe web-container. Pak eerst `compose.yaml` uit in `releases/fb7a690` ([deploy/README.md](../../deploy/README.md), "Eén los `compose.yaml` per project"); een oude release heeft geen los `compose.yaml`. Start daarna de vorige release: `cd releases/fb7a690 && RELEASE_TAG=fb7a690 docker compose -p when2watch up -d web` (de oude compose kent de db-service niet; die mag blijven draaien of worden gestopt). Cron terug. De SQLite-bron is nooit geschreven: controleer dat de sha256 gelijk is aan de definitieve backup. Mislukte doeldata privé bewaren voor diagnose.

**b. Na openen of na Google-writes:** niet automatisch terug naar de SQLite-snapshot. Web en cron stoppen, `pg_dump -Fc` maken, verschillen inventariseren en een herstelrelease kiezen die met het huidige schema werkt (DB-plan §7). Na elk herstel eerst remote readback (`readback.ts`) vóór de scheduler.

## 6. Reguliere backup (voorstel, aparte beslissing)

Dagelijks `docker exec when2watch-db-1 pg_dump -U when2watch_migrator -d when2watch -Fc` naar een map buiten het appvolume, versleuteld, maximaal 30 dagen bewaard; herstel periodiek naar een aparte database bewijzen (zoals in de repetitie). RPO bij dagelijkse dumps ≤ 24 uur.

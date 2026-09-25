# IDEA-219 R2 — gedeelde catalogus, uitgenodigde gebruikers en beperkte Google-rechten op max2

Dit document autoriseert de omschakeling **niet**. Uitvoeren alleen na een expliciete opdracht van JP voor een concrete
release-SHA en een onderhoudsmoment. Voorwaarden vooraf: R1 is geaccepteerd, CI is groen en `deploy/rehearse-r2.sh`
is op die SHA geslaagd ([bewijs](../evidence/idea-219-r2.md)). De keuze voor de overgang van de eigenaarsagenda (§6)
is gemaakt.

R2 trekt alle sessies in: iedereen logt opnieuw in. Na de omschakeling pauzeert de sync van de bestaande
eigenaarsagenda. Die agenda heeft geen bewijs van aanmaak door de app, en met de beperkte rechten weigert Google
haar. Tot de overstap in §6 komen er dus geen nieuwe afspraken bij. Voorstel onderhoudsvenster: **20 minuten**.
De repetitie van de hele pijplijn duurde enkele seconden.

## 0. Vooraf (app blijft open)

1. Release-map `releases/<sha>` via `git archive`; `chmod 0644 deploy/postgres-init.sh`. Images:
   `RELEASE_TAG=<sha> docker compose -p when2watch build web` en `docker build --target tools -t when2watch-tools:<sha> .`.
2. Privéconfig (0600, nooit printen) aanvullen in `/srv/apps/when2watch/.env`:
   - `W2W_CREDENTIAL_KEYS=r2:<openssl rand -base64 32>`: bewaar een kopie **apart** van de databasebackups.
   - `W2W_DELETION_JOURNAL=/journal/deletions.jsonl`.
   - `W2W_PRIVACY_CONTROLLER` en `W2W_PRIVACY_CONTACT`: de echte beheerdergegevens.
   Controle zonder waarden: `grep -c '^W2W_CREDENTIAL_KEYS=r2:' .env` → `1`.
3. `mkdir -m 700 /srv/apps/when2watch/journal` (eigenaar uid 1000, buiten `postgres/` en de databasebackups).
4. Tools-env `migration/.env.r2` (0600): `DATABASE_URL` = migrator-DSN, `W2W_CREDENTIAL_KEYS` (dezelfde) en
   `W2W_DELETION_JOURNAL=/journal/deletions.jsonl`.

## 1. Onderhoud en drain

1. Cron uit: bewaar `crontab -l` in `config-backups/crontab.<ts>` en verwijder alleen `# When2Watch daily`.
2. Read-only op de live DB, alles 0: `SyncRun.status='running'`, `CalendarEventLink.status IN ('prepared','updating','deleting')`,
   `CalendarCreationAttempt.status='sending'`, `GoogleConnectionAttempt.status='pending' AND "expiresAt">now()`. Anders eerst afhandelen; niets forceren.
3. `docker stop when2watch-web-1`: de bron is nu bevroren.

## 2. Backup en expand

1. `docker exec when2watch-db-1 pg_dump -U postgres -d when2watch -Fc > db-backups/pre-r2-<sha>-<ts>.dump` (0600);
   noteer `sha256sum` als `SUM`.
2. `docker compose -p when2watch --profile migrate run --rm migrate` → "All migrations have been successfully applied".

## 3. Backfill, versleutelen, journaal (tools op het interne netwerk, geen egress)

`T="docker run --rm --network when2watch_database --user 1000:1000 -v /srv/apps/when2watch/journal:/journal --env-file migration/.env.r2"`

1. `$T -e W2W_BACKFILL_RUN_ID=<nieuw uuid> -e W2W_BACKFILL_SOURCE_CHECKSUM=$SUM when2watch-tools:<sha> npx tsx scripts/migration/backfill-catalog.ts`
   → `backfilled`, `sessionsRevoked` ≥ 0. Een retry met dezelfde run-ID geeft `already-completed`.
2. `… verify-catalog.ts` (zelfde run-ID) → `passed:true`, `problems:{}`; anders afbreken (§7a).
3. `… scripts/migration/encrypt-credentials.ts` → `SEALED`. Een retry geeft alleen `alreadySealed`.
4. `… scripts/restore-privacy.ts init` → `INITIALISED`. **Bij een retry nooit opnieuw aanmaken of leegmaken**: bestaat
   het journaal al, dan geeft `check` `VALID`.

## 4. Starten achter onderhoud, dry-run en herstelbewijs

1. Controlecontainer zonder proxy:
   `docker run -d --name w2w-r2-check --network when2watch_database --read-only --tmpfs /tmp --user 1000:1000 -v /srv/apps/when2watch/journal:/journal --env-file .env when2watch:<sha>`.
   De startcontrole (`scripts/ready-r2.mjs`) weigert zonder voltooide backfill, verzegelde secrets en journaal (exit 66). Vereist: `/api/health` 200.
2. Herstelbewijs met 0 verwijderingen: `pg_dump` → `CREATE DATABASE when2watch_restore` → `pg_restore --no-owner`, dan
   `$T -e DATABASE_URL=<migrator-DSN>/when2watch_restore … restore-privacy.ts apply` → `journalled:0`, en `verify-catalog` → passed.
   Daarna `DROP DATABASE when2watch_restore`.
3. Readback-dry-run (alleen GET naar Google): `scripts/migration/readback.ts --user=<eigenaar-id>` via een tools-container
   met egress en databasenetwerk, zoals in R1 §3.2. Die container heeft `W2W_CREDENTIAL_KEYS` nodig. Alle eigen links worden teruggelezen, zonder writes.
4. `docker rm -f w2w-r2-check`.

## 5. Sentinelproef vóór openstelling (operator)

Gebruik een willekeurige sentinelwaarde en print die niet in het ticket. Stuur via de proxy:
- een verzoek met de sentinel in de body van `/api/account/delete` (fout 400/401);
- een verzoek met de sentinel als cookie- en querywaarde naar `/api/shows`;
- een ongeldige OAuth-callback met de sentinel in `code`.

Zoek daarna in de proxylogs, `docker logs` van web en de foutlogs op de sentinel: **0 treffers**. Is er wel een
treffer, of logt de proxy bodies of cookies, dan wordt niet opengesteld; eerst de logconfiguratie herstellen.

## 6. Openen en eigenaarsagenda

1. `RELEASE_TAG=<sha> docker compose -p when2watch up -d web` (met journaalvolume); wijs `current` naar de release.
2. HTTPS-health 200. JP logt opnieuw in en ziet dezelfde series, voorkeuren en `/beheer/series`.
3. **Overgang van de eigenaarsagenda** (gekozen vóór uitvoering):
   - In Instellingen verschijnt "gepauzeerd: niet door When2Watch aangemaakt".
   - Geef "Agendatoegang" (beide smalle rechten), maak een nieuwe When2Watch-agenda en stap over met bevestiging.
   - De oude afspraken blijven in de oude agenda staan; JP kan die agenda in Google Agenda zelf verbergen of verwijderen.
   - When2Watch verplaatst of verwijdert niets.
4. Eerste sync (handmatig): de nieuwe agenda krijgt de afleveringen. Controleer de readback. Bevestig een **werkelijk
   ontvangen melding** in de agenda-app (product-DoD).
5. Cron terugzetten (dezelfde regel). Die draait nu ook de retentie; `SyncRun` succesvol.
6. Bewijs vastleggen in `docs/evidence/idea-219-r2.md`: release, run-ID, tijden en rapporten, zonder waarden.
7. Daarna de twee-accountproef (uitnodiging aan een tweede account, herkenbare proefagenda) en de iPhone/iPad-proef.

## 7. Afbreken en herstel

**a. Vóór openen:** verwijder de check- en webcontainers. Herstel `pre-r2-<sha>-<ts>.dump` in een schone database
(of drop de R2-tabellen niet handmatig; herstel altijd de hele dump) en start de R1-release
(`RELEASE_TAG=8b87838 docker compose -p when2watch up -d web`). Zet de cron terug. Het journaal is dan nog leeg en mag
blijven staan.

**b. Na openen:** niet terug naar R1. R1 kent geen verwijderjournaal, dus een verwijderde gebruiker zou terugkomen.
Herstel alleen een R2-backup en draai direct daarna `restore-privacy.ts apply`, vóór app en cron. Gebruik het huidige
journaal; zonder dat journaal geen vrijgave. Daarna eerst een remote readback, dan de scheduler.

## 8. Reguliere backup

Dagelijkse `pg_dump -Fc` buiten het appvolume, maximaal 30 dagen bewaard. Het journaal en de sleutel horen in een
aparte host-backup. Een herstel in een aparte database bewijs je periodiek met `apply` en `verify-catalog`, zoals in de repetitie.

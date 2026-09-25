# When2Watch op max2

Eén Next.js-proces, één container `when2watch-web-1`, eigen PostgreSQL 17-container `when2watch-db-1` (data onder `/srv/apps/when2watch/postgres`, alleen op het interne compose-netwerk). Geen van beide heeft een hostpoort; de bestaande proxyroute blijft gelden. Releases vóór IDEA-219 R1 (t/m `fb7a690`) gebruikten SQLite onder `/srv/apps/when2watch/data`; die bron blijft na de omschakeling bewaard. Beheer via `ssh janpeter@192.168.0.158`. Alleen deze app herstarten.

## Release en herstel

1. Bouw een nieuwe release onder `/srv/apps/when2watch/releases/<commit>` uit `git archive` van de beoordeelde commit, met de private `.env`, `.env.db` en `.env.migrate` (symlinks, 0600); `chmod 0644 deploy/postgres-init.sh`. `RELEASE_TAG=<commit> docker compose -p when2watch build web`.
2. Maak vóór iedere schemawijziging een `pg_dump -Fc` (0600) en bewaar de vorige image, `current` en configuratie.
3. Migraties zijn een aparte stap met de DDL-rol: `docker compose -p when2watch --profile migrate run --rm migrate`. `scripts/start.sh` voert geen DDL uit; het weigert een niet-PostgreSQL-DSN of een ongemigreerd schema. Start daarna alleen de nieuwe webcontainer en controleer health, HTTPS en bestaande agenda-/seriekoppelingen; wijs `current` naar de bewezen release.
4. Bij mislukking vóór externe agendawrites: oude release/image terugstarten. Zet een databasebackup niet blind terug nadat Google-writes hebben plaatsgevonden; bewaar eerst de huidige database. Nieuwe mappingrecords bevatten de herstelidentiteit van die writes.

De eenmalige overstap van SQLite naar PostgreSQL volgt [het R1-cutover-runbook](../docs/runbooks/idea-219-r1-cutover.md); de repetitie is `deploy/rehearse-r1.sh`.

Secrets staan uitsluitend in `.env` (0600), nooit in een commandoargument, document of log. De container draait als UID 1000; app-, data- en PostgreSQL-mappen zijn 0700. De runtime gebruikt de rol `when2watch_app` (alleen DML); `when2watch_migrator` alleen voor migraties en import. Maak geen tweede appproces tegen dezelfde database: de gedeelde gebruikerslock is procesgebonden.

## Privacy, versleuteling en verwijderjournaal (IDEA-219 R2)

- **Sleutel.** `W2W_CREDENTIAL_KEYS=<id>:<32 bytes base64>` staat in de private `.env` (maken: `openssl rand -base64 32`). Zonder of met een verkeerde sleutel weigert de app Google-toegang; er is geen plaintextfallback. Bewaar de sleutel apart van de databasebackups: een backup zonder sleutel geeft geen toegang tot tokens. Bij sleutelrotatie komt de nieuwe sleutel vooraan en blijft de oude erachter staan tot alles opnieuw is verzegeld.
- **Omzetten bij R2-cutover.** Vóór de eerste start van R2 draait `tsx scripts/migration/encrypt-credentials.ts` eenmalig in één transactie. Het script is idempotent en toont alleen aantallen. Daarna leest de app uitsluitend verzegelde waarden.
- **Journaal.** `W2W_DELETION_JOURNAL=/journal/deletions.jsonl`. Host-map `/srv/apps/when2watch/journal` met mode 0700 en eigenaar 1000, buiten de postgres-map en buiten de databasebackups. Maak het journaal bij de cutover één keer met `tsx scripts/restore-privacy.ts init`. Daarna hoort het bij deze installatie. Maak het nooit opnieuw aan; een ontbrekend journaal blokkeert verwijderen en herstellen. Neem het journaal mee in de host-backup, apart van de database.
- **Herstel van een databasebackup.** Na het terugzetten, vóór app en cron starten: `tsx scripts/restore-privacy.ts apply`. Dit verwijdert opnieuw iedereen die na die backup zijn account heeft verwijderd. Zonder geldig journaal van deze installatie geen vrijgave.
- **Retentie.** Loopt mee in de dagelijkse cron (zoekcache, syncgeschiedenis 30 d, audit 90 d, afgehandelde uitnodigingen 7 d, verlopen sessies en koppelpogingen). Onzekere en bewezen agenda-aanmaakpogingen blijven staan. Databasebackups roteert de beheerder na maximaal 30 dagen.
- **Privacyverklaring.** `W2W_PRIVACY_CONTROLLER` en `W2W_PRIVACY_CONTACT` vul je bij de uitrol in met de echte beheerdergegevens. Zonder deze waarden toont `/privacy` dat ze nog worden ingevuld.

## Dagelijkse synchronisatie

`CRON_SECRET` is een willekeurige waarde van minimaal 32 tekens in de private `.env`. `scripts/cron-client.mjs` leest hem binnen de container en roept `POST /api/cron/sync` op localhost aan. De hostregel gebruikt dus geen secret. Zonder of met onjuiste toegang: 401; overlap: 409/busy; volledig succes: 200; gedeeltelijk/mislukt: 502. Het hostscript eindigt bij elk niet-succes met een foutcode.

Max2 gebruikt `Europe/Amsterdam`. De dagelijkse regel van gebruiker `janpeter` is:

```cron
5 6 * * * /bin/sh /srv/apps/when2watch/current/deploy/when2watch-sync.sh >> /srv/apps/when2watch/cron.log 2>&1 # When2Watch daily
```

Voeg de regel samen met de actuele crontab; bewaar een herstelkopie en controleer dat bestaande regels behouden blijven. De 06:05-run valt vóór het gewenste meldingsmoment 09:00. Logregels bevatten tijd, HTTP-status, run-ID en actietellingen. De tabel `SyncRun` bewaart hetzelfde resultaat met trigger `cron`. Een handmatig gestart script bewijst de scheduler niet.

## Gebruik en storingen

- Typ minimaal vier tekens op de startpagina en kies expliciet een match. Spaties aan het begin en einde tellen niet mee. De eerste vijf resultaten zijn direct zichtbaar. `Volg je al` voorkomt dubbel toevoegen.
- `Nu synchroniseren` gebruikt dezelfde syncfunctie als cron. Bij een fout blijft de serie staan; poging, laatste succes en fout staan bij de serie.
- Bij verlopen/ingetrokken toestemming: via Instellingen Google opnieuw koppelen. Een tijdelijke bronfout wist geen agenda-items.
- Alleen reguliere afleveringen met datum komen in de agenda. Nieuwe items beginnen zeven dagen terug; bestaande items kunnen nog over die grens gecorrigeerd worden. Er is geen Nederlandse beschikbaarheidsgarantie.
- Een eigendomsconflict wordt niet automatisch opgelost. Controleer het genoemde eigen event en de lokale mapping; verwijder geen vreemd item.

All-day meldingen in Apple Agenda en Chrome zijn door JP bevestigd op 24 september. Dit zegt niets over toekomstig tokengebruik na dag zeven. Agenda wisselen, serie verwijderen en volledige v1-backup/herstelacceptatie vallen buiten dit increment.

## Broncontracten

TVmaze: [API](https://www.tvmaze.com/api), echte fixtures met ophaaldatum in `tests/fixtures/tvmaze/source.json`; data onder CC BY-SA. Google: [extended properties](https://developers.google.com/workspace/calendar/api/guides/extended-properties) combineert herhaalde private filters met OR. De adapter haalt daarom app-kandidaten op en controleert lokaal alle eigendomsvelden, op alle responsepagina's.

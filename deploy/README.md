# When2Watch op max2

Eén Next.js-proces, één container `when2watch-web-1`, SQLite onder `/srv/apps/when2watch/data`. De app heeft geen hostpoort; de bestaande proxyroute blijft gelden. Beheer via `ssh janpeter@192.168.0.158`. Alleen deze app herstarten.

## Release en herstel

1. Bouw een nieuwe release onder `/srv/apps/when2watch/releases/<commit>` met de bestaande private `.env` (symlink); gebruik `RELEASE_TAG=<commit> docker compose -p when2watch build web`. De bron komt uit `git archive` van de beoordeelde commit.
2. Maak met SQLite's backup-API een consistente kopie onder `db-backups`, mode 0600; lees de kopie terug met `PRAGMA integrity_check`. Bewaar de vorige image, `current` en configuratie.
3. Start alleen de nieuwe webcontainer. `scripts/start.sh` past vastgelegde migraties toe. Controleer container-health, HTTPS en bestaande agenda-/seriekoppelingen; wijs `current` naar de bewezen release.
4. Bij mislukking vóór externe agendawrites: oude release/image terugstarten. De episode-migratie is alleen toevoegend, waardoor de oude app de bestaande auth-/proeftabellen kan blijven gebruiken. Zet een databasebackup niet blind terug nadat Google-writes hebben plaatsgevonden; bewaar eerst de huidige database. Nieuwe mappingrecords bevatten de herstelidentiteit van die writes.

Secrets staan uitsluitend in `.env` (0600), nooit in een commandoargument, document of log. De container draait als UID 1000; app- en datamappen zijn 0700. Maak geen tweede appproces tegen dezelfde database: de gedeelde gebruikerslock is procesgebonden.

## Dagelijkse synchronisatie

`CRON_SECRET` is een willekeurige waarde van minimaal 32 tekens in de private `.env`. `scripts/cron-client.mjs` leest hem binnen de container en roept `POST /api/cron/sync` op localhost aan. De hostregel gebruikt dus geen secret. Zonder of met onjuiste toegang: 401; overlap: 409/busy; volledig succes: 200; gedeeltelijk/mislukt: 502. Het hostscript eindigt bij elk niet-succes met een foutcode.

Max2 gebruikt `Europe/Amsterdam`. De dagelijkse regel van gebruiker `janpeter` is:

```cron
5 6 * * * /bin/sh /srv/apps/when2watch/current/deploy/when2watch-sync.sh >> /srv/apps/when2watch/cron.log 2>&1 # When2Watch daily
```

Voeg de regel samen met de actuele crontab; bewaar een herstelkopie en controleer dat bestaande regels behouden blijven. De 06:05-run valt vóór het gewenste meldingsmoment 09:00. Logregels bevatten tijd, HTTP-status, run-ID en actietellingen. De SQLite-tabel `SyncRun` bewaart hetzelfde resultaat met trigger `cron`. Een handmatig gestart script bewijst de scheduler niet.

## Gebruik en storingen

- Typ minimaal vier tekens op de startpagina en kies expliciet een match. Spaties aan het begin en einde tellen niet mee. De eerste vijf resultaten zijn direct zichtbaar. `Volg je al` voorkomt dubbel toevoegen.
- `Nu synchroniseren` gebruikt dezelfde syncfunctie als cron. Bij een fout blijft de serie staan; poging, laatste succes en fout staan bij de serie.
- Bij verlopen/ingetrokken toestemming: via Instellingen Google opnieuw koppelen. Een tijdelijke bronfout wist geen agenda-items.
- Alleen reguliere afleveringen met datum komen in de agenda. Nieuwe items beginnen zeven dagen terug; bestaande items kunnen nog over die grens gecorrigeerd worden. Er is geen Nederlandse beschikbaarheidsgarantie.
- Een eigendomsconflict wordt niet automatisch opgelost. Controleer het genoemde eigen event en de lokale mapping; verwijder geen vreemd item.

All-day meldingen in Apple Agenda en Chrome zijn door JP bevestigd op 24 september. Dit zegt niets over toekomstig tokengebruik na dag zeven. Agenda wisselen, serie verwijderen en volledige v1-backup/herstelacceptatie vallen buiten dit increment.

## Broncontracten

TVmaze: [API](https://www.tvmaze.com/api), echte fixtures met ophaaldatum in `tests/fixtures/tvmaze/source.json`; data onder CC BY-SA. Google: [extended properties](https://developers.google.com/workspace/calendar/api/guides/extended-properties) combineert herhaalde private filters met OR. De adapter haalt daarom app-kandidaten op en controleert lokaal alle eigendomsvelden, op alle responsepagina's.

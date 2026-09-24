---
title: "When2Watch — deployment via Ops-dashboard"
status: draft
date: 2026-09-24
---
# When2Watch — deployment via Ops-dashboard

## Doel en eerste resultaat

JP wil When2Watch op max2 vanuit het Ops-dashboard kunnen deployen, met CI vooraf. Het eerste bruikbare resultaat is één knop bij de bestaande max2-flows waarmee één groen gecontroleerde main-commit wordt gebouwd en uitgerold, met zichtbaar resultaat en behoud van SQLite. De eerste praktijkproef is een heruitrol van een reeds werkende commit, gevolgd door controle van bestaande series en agendakoppelingen.

Dit plan betreft de toekomstige dashboardintegratie. De handmatige uitrol van de gemergede PWA-release is op 24 september al uitgevoerd op expliciete opdracht. De CI-workflow is toegevoegd in PR #4. Dit document is nog geen goedgekeurde of gematerialiseerde sprint.

Geen Postgres-migratie, Vercel-installatie, multi-user, nieuw deployplatform, automatische productie-uitrol na een push, runnerwijziging of wijziging van andere apps. T-11 blijft in de wacht.

## Gecontroleerde bestaande werkwijze

Onderzoek: Ops-dashboard checkout 50410e600e8599ebe0c88737dec4193f61c6757e en live max2, 24 september 2026. De lokale Ops-dashboard-werkmap bevat al andere wijzigingen; die zijn niet aangepast.

- Dashboard `app/api/flows/run/route.ts` controleert de ingelogde gebruiker en de flows-capability. Het maakt een FlowRun en stuurt flow_key, dry_run en run_id naar de ingestelde ops-agent via `/agent/v1/flow`.
- De agent laadt YAML uit `/etc/ops-agent/flows`. Stappen verwijzen naar vaste command_keys uit `/etc/ops-agent/commands.yml`. Het dashboard toont uitvoer en bewaart FlowRun/FlowStep met host_slug.
- Live max2 heeft onder andere `redeploy_media_organizer.yml`: fetch, reset naar origin/main, submodules, appspecifiek deployscript en smokechecks.
- Er bestaat nog geen When2Watch-flow of command_key. De bestaande Media-Organizer-flow heeft enkele smokechecks op continue; When2Watch moet zijn eigen healthfout laten falen.
- Het appmanifest in `deploy/apps/<app>/app.yml` is operator-documentatie/template-invoer, geen automatische installer. Het manifest alleen toevoegen maakt dus nog geen werkende dashboardknop.
- When2Watch heeft al een werkende eigen inrichting: releases onder `/srv/apps/when2watch/releases`, private gedeelde `.env`, `current`, een SQLite-volume en Compose-project `when2watch`. De container heeft geen hostpoort; Caddy bereikt `when2watch-web` op `scrum4me_default`. Dit behouden, expliciet als afwijking van het algemene manifestvoorbeeld beschrijven.
- Gebruik een eigen flow; `redeploy_all` kan onbedoeld workers of andere apps vervangen.

Bronnen: bovenstaande routes, `deploy/apps/README.md`, `deploy/apps/_templates/redeploy-flow.yml.tmpl`, `deploy/ops-agent/flows/redeploy_media_organizer.yml`, de live max2-flow en whitelist, en When2Watch `deploy/README.md`.

## CI: nu toegevoegd

Bestand: `.forgejo/workflows/ci.yml` in When2Watch.

PR opened/synchronize/reopened, push naar main en handmatige start voeren achtereenvolgens uit:

1. Checkout zonder bewaarde credentials; Node 24; npm ci; Prisma-client genereren.
2. Unit- en echte SQLite/migratietests.
3. Productiebuild en daarna typecheck met gegenereerde Next-types.
4. HTTP-contractproef met tijdelijke SQLite en synthetische sessies, zonder Google-calls.
5. Productie-Docker-image bouwen.

Bestaand runnerlabel ubuntu-latest; geen runnerconfiguratie wijzigen. Forgejo Actions is voor deze repository ingeschakeld. De workflow krijgt geen productiegeheimen en doet geen deployment. Het feit dat een workflowbestand bestaat is geen groene run: de eerste echte Forgejo-run wordt afzonderlijk gecontroleerd.

De repository heeft momenteel nog `codex/when2watch-increment-1` als standaardbranch, terwijl PR's op main worden gemerged. Corrigeer dit bij de dashboardintegratie naar main, na readback van branch en actuele bescherming; de CI- en deployselectie noemt main ondertussen expliciet.

## Increment 1 — één bestaande flow met veilige appspecifieke uitvoering

### Taak 1: begrensd When2Watch-deployscript

Bestanden in When2Watch:
- Nieuw `deploy/deploy-when2watch.sh`: vaste app-/hostpaden, gedeelde lock en uitrolvolgorde.
- Nieuw `deploy/backup-when2watch.py`: SQLite backup-API, private bestandsrechten, integriteitscontrole en geschoonde vergelijking.
- Wijzig `deploy/README.md`: bediening, foutafhandeling, rollback en bewijs.
- Gerichte tests voor dit deploypad onder `tests/deploy/`; gebruik een tijdelijke projectroot en nagebootste commandorunner. De productie-interface accepteert geen willekeurige shelltekst of paden.

Contract: één vaste command_key voert één script uit. Het script haalt origin/main op en pint de volledige commit-SHA één keer. Vanaf dat moment gebruikt elke stap precies die SHA; een nieuwe main-push tijdens de build verandert de kandidaat niet. Uitvoer bevat bron-SHA, vorige release, backupnaam, fasen en eindresultaat, nooit env-inhoud of tokens.

De daadwerkelijke geïnstalleerde wrapper staat op een vaste, beheerde locatie buiten de door een deploy vervangen release, bijvoorbeeld `/opt/ops-agent/bin/deploy-when2watch`. Het uitvoerscript zelf wordt bij onboarding expliciet geïnstalleerd en niet stilzwijgend door iedere applicatierelease vervangen.

Volgorde:

1. Controleer host=max2, vaste paden, beschikbare opslag en toegang tot Docker. Neem een exclusieve When2Watch-lock. Een tweede deploy stopt direct.
2. Haal main op en pin de SHA. Vraag Forgejo naar het succesvolle CI-resultaat voor exact die main-push-SHA. Een groene PR-head geldt niet als bewijs voor een andere merge-SHA. Bij ontbrekend, lopend, mislukt of onbereikbaar bewijs: stoppen vóór backup/stop/activatie. Gebruik een server-side token met alleen noodzakelijke leesrechten; nooit het token in command_args of logs.
3. Leg de bron vast met git archive en bouw een image getagd met de volledige SHA terwijl de oude app blijft draaien. Bij buildfout blijft de bestaande app actief.
4. Bewaar vorige release/image en private configuratiebackup. Stop alleen de bestaande webcontainer zodat tussen de backupsnapshot en migratie geen appwrites plaatsvinden. Neem ook de bestaande dagelijkse cronwrapper in dezelfde lock op: busy moet expliciet worden gelogd en mag geen parallelle synchronisatie starten.
5. Maak een consistente SQLite-backup met backup-API, mode 0600, en PRAGMA integrity_check. Bij fout de oude app herstarten en de flow laten falen.
6. Start één nieuwe webcontainer. `scripts/start.sh` voert prisma migrate deploy uit; nooit reset of push op productie. Controleer container-health en publieke HTTPS-health met een begrensde wachttijd.
7. Controleer bestaande identiteiten/koppelingen en de verwachte migratie. Bij geslaagde health de current-symlink atomair omzetten en RELEASE_TAG bijwerken. Bewaar volledige bron-SHA en eindbewijs in een klein releasebestand.
8. Bij activatiefout de vorige image met het vorige releasepad herstarten, health controleren en de flow FAILED houden. De huidige trying-migratie is toevoegend: de extra kolom kan blijven staan. Voor toekomstige niet-compatibele migraties eerst een apart herstelplan. Zet een databasebackup nooit automatisch terug over mogelijke externe Google-writes.

Acceptatie: kandidaat-SHA is stabiel tijdens een veranderende main; rood/ontbrekend CI-resultaat laat productie ongemoeid; buildfout laat de oude app draaien; backupfout herstart de oude app; concurrente deploy wordt geweigerd; healthfout geeft een zichtbare mislukte flow en gecontroleerd herstel; bestaande data blijven behouden.

### Taak 2: aansluiten op de bestaande max2-flows en direct beproeven

Bestanden in Ops-dashboard:
- Nieuw `deploy/apps/when2watch/app.yml` en `README.md`: repo, main, vaste releasepaden, project/container, health-URL, SQLite en backup.
- Nieuw `deploy/ops-agent/flows/redeploy_when2watch.yml`.
- Nieuwe appspecifieke command-entry in de bestaande beheerde max2-whitelistbron, na vaststelling van de huidige bron/installatiemethode. Niet de volledige live commands.yml door een template vervangen.
- Voeg de vaste When2Watch-repopath alleen toe aan de bestaande dashboard-repolijst als zichtbaarheid daar nodig is. Geen algemene wildcard.

De flow gebruikt de ene vaste `deploy_when2watch`-command_key met on_failure: abort. Het script verzorgt zijn eigen veilige volgorde en herstel. Losse backup/activate-commando's maken het te makkelijk om bij een herstart de backup over te slaan; daarom blijven deze binnen één appspecifiek script. Geen generieke shell/compose-command met door de browser gekozen paden.

Installeer alleen deze uitbreiding op max2, na backup van de betrokken agentconfiguratie. Valideer de samengevoegde YAML en command-resolutie vóór de noodzakelijke agentreload/herstart. Behoud alle andere commands/flows. Controleer UID en schrijfrechten van de bestaande agent; verruim geen rechten generiek.

Eerste contact met het dashboard vindt in dit increment plaats:
1. Controleer dat de When2Watch-flow op de max2-instance zichtbaar is.
2. Voer dry-run uit: alle command_keys resolveerbaar, geen appmutaties.
3. Start vanuit de echte dashboard-UI een heruitrol van een reeds werkende, exact groen gecontroleerde main-commit.
4. Leg FlowRun-ID, host_slug=max2, kandidaat-SHA, backup, image, current, HTTPS-health en behoud van series/agenda-identiteiten vast.
5. JP opent Agenda en Volgen en controleert Proberen. Fysieke PWA-installatie/login is een afzonderlijke nog open productproef.

Acceptatie: één klik start uitsluitend When2Watch; voortgang/fouten zijn zichtbaar en terugleesbaar; geen melding 'geslaagd' bij een mislukte healthcheck; andere containers en proxyconfiguratie blijven ongewijzigd. Na succes is de dashboardroute de gedocumenteerde normale deployroute.

## Reviewfocus

- Main verandert na selectie: build, CI-bewijs en activatie blijven aan dezelfde SHA gebonden (taak 1).
- CI ontbreekt of betreft alleen de PR-head: geen activatie (taak 1).
- SQLite staat open of cron overlapt: één lock en stop vóór consistente backup; geen tweede appproces (taak 1).
- Nieuwe container wordt niet healthy: expliciet FAILED plus gecontroleerde oude app; geen blind DB-herstel (taak 1).
- Live whitelist bevat lokale uitbreidingen: alleen samengevoegde app-entry installeren; dry-run en dashboardbewijs op max2 (taak 2).

## Goedkeuring en vervolg

Na goedkeuring dit beperkte increment als Sprint/PBI/Stories/Tasks vastleggen volgens Scrum4Me, met zelfstandige taakplannen en pinned bronnen. Daarna geldt de materialisatie-hardstop. De huidige opdracht omvat het plan en de CI, niet de uitvoering van deze toekomstige dashboardintegratie.


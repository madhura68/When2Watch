---
title: "IDEA-216 — Eerste increment: proef met één serie"
status: active
version: "0.1"
last_updated: "2026-09-23"
---

# IDEA-216 — Eerste increment: proef met één serie

**Doel:** JP kiest één echte serie en ziet diens afleveringen in de gekozen Google-testagenda, met een daadwerkelijk ontvangen melding; dezelfde koppeling werkt na herstart en een echte cron-aanroep op max2.

**Architectuur:** één Next.js-proces in één container op max2, met Prisma/SQLite op persistente lokale opslag. Google-login en Calendar-toegang, TVmaze als enige databron, en één gedeelde syncfunctie. De proef begint met de werkelijke Google-koppeling en melding.

**Stack:** Next.js, TypeScript, Prisma, SQLite, Vitest, Docker. Ondersteunde versies en de OAuth-library worden bij bootstrap vastgelegd in het lockbestand; er bestaat nog geen repositorybaseline om over te nemen.

**Gepinde specificatie:** `SPECS/idea-216-specificatieplan`, versie 0.2, ProductDoc `cmue4klyx0003jh17wo0atbo1`, revisie 2 / `cmue51cd70015jh17qw5h9dhg`, SHA-256 `02d8f6e8a3e976ad747d556ac593951bf0005cec3dbe678a6fac72cb406efcac`. De lokale kopie is [IDEA-216-specificatieplan.md](/Users/janpetervisser/Documents/ChatGPT/When2Watch/IDEA-216-specificatieplan.md).

**Opdracht:** JP heeft expliciet gevraagd hoofdstuk 10 uit te voeren. Dit plan specificeert de uitvoeringstaken voor dat increment. De lokale Scrum4Me-flow verlangt materialisatie en een hardstop daarna; het vormt geen melding dat de proef al geslaagd is.

## Huidige preflight — werkelijk gecontroleerd

| Controle op 23 september 2026 | Uitkomst | Gevolg |
| --- | --- | --- |
| Actieve sprint/volgende story voor When2Watch | Geen | Een nieuwe sprint/PBI/story voor dit increment nodig |
| Forgejo `git ls-remote` | Succes, geen refs | Repository is leeg; er is nog geen app om alleen te starten |
| SSH naar `max2` via Tailscale | Geweigerd: `tailscale: tailnet policy does not permit you to SSH to this node` | JP heeft daarna expliciet de LAN-route toegestaan; de Tailscale-policy blijft ongewijzigd |
| Door JP toegestane LAN-route | `max2.local` resolveert naar `192.168.0.158`; `ssh janpeter@192.168.0.158` slaagt en retourneert host `max2`, gebruiker `janpeter` | Gebruik deze door JP opgegeven gebruiker en route |
| Docker en When2Watch-app | Docker is beschikbaar; geen When2Watch-container, composeproject of `/srv/apps/when2watch` aangetroffen | Bootstrap en eerste appinstallatie zijn nodig |
| Bestaande proxy | Container `scrum4me-caddy`, netwerk `scrum4me_default`; `/srv/scrum4me/caddy/Caddyfile` is gemount op `/etc/caddy/Caddyfile` | Het bestand bevat geen `when2watch.jp-visser.nl`; een app-specifieke proxyroute moet nog worden ingericht |
| Hostrechten en opslag | `janpeter` heeft Docker-toegang, mag sudo zonder wachtwoord gebruiken en kan het Caddyfile schrijven; `/srv/apps` is van root, met circa 663 GiB vrij | Appmap bij uitvoering gericht aanmaken met de juiste eigenaar; geen andere appmap aanpassen |
| Scheduler | `cron` is actief; gebruiker `janpeter` heeft nog geen crontab | Bij uitvoering de dan actuele crontab opnieuw lezen en een eigen regel toevoegen |
| HTTPS HEAD naar `https://when2watch.jp-visser.nl` | TLS-handshake faalt met `tlsv1 alert internal error` | HTTPS/proxywerking is nog geen geslaagd proefonderdeel; oorzaak is niet vastgesteld |
| DNS | In de voorafgaande controle een A-record bevestigd | Dit bewijst geen HTTPS of correcte backend |
| Google-koppeling, testagenda en melding | Niet uitgevoerd | OAuth-configuratie, client en testgegevens nodig |

De eerdere SSH-poging als lokale Mac-gebruiker `janpetervisser` werd met `Permission denied (publickey)` geweigerd. JP gaf vervolgens de juiste gebruikersnaam `janpeter`; daarmee is toegang bevestigd. De Tailscale-policy is niet aangepast. Alle bovenstaande hostcontroles waren alleen-lezen. De TLS-fout is nog geen volledige diagnose; de domeinroute en HTTPS worden bij de proef afzonderlijk gevalideerd.

### Concrete doelinrichting voor uitvoering

- Appmap: `/srv/apps/when2watch`, nog aan te maken voor `janpeter`. Composeproject `when2watch`; persistente SQLite-opslag uitsluitend voor deze app.
- De app krijgt op het bestaande externe Docker-netwerk `scrum4me_default` de unieke alias `when2watch-web`. Voor toepassing opnieuw op naamconflicten controleren. Caddy kan dan naar `when2watch-web:3000` verwijzen; een publiek gepubliceerde apppoort is niet nodig.
- Proxybestand: `/srv/scrum4me/caddy/Caddyfile`. Maak een herstelkopie en voeg alleen het domeinblok voor deze app toe. Valideer in de bestaande container met `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`; laad daarna via `caddy reload` en controleer de domeinroute. Geen Caddy-herstart voor de wijziging plannen.
- Bronoverdracht en containerbouw lopen via SSH vanaf de Mac, conform de max2-repo-instructie; geen Forgejo Actions-job krijgt hosttoegang.
- De actuele crontab van `janpeter` wordt vóór uitvoering opnieuw gelezen. Voeg alleen een herkenbare When2Watch-regel toe; de huidige afwezigheid is geen toestemming om later bestaande regels te vervangen.

## Nog benodigde invoer

JP is gevraagd naar de serie, het Google-account/de testagenda, apparaat/agenda-app en gewenste ochtendtijd. Deze waarden worden vóór een afhankelijke agenda-actie vastgelegd. De persoonlijke hoofdagenda is geen impliciete testbestemming.

SSH-toegang is bevestigd. Een bestaand Google OAuth-project/client kan worden hergebruikt als het voor deze app is bedoeld; anders is inrichting met JP nodig. Wachtwoorden, client secrets en tokens worden niet in chat, documenten, Git of logs opgenomen.

## Globale grenzen

- Host en adres: max2, `https://when2watch.jp-visser.nl`.
- Eén gebruiker met geverifieerde e-mail-allowlist; één expliciet gekozen, schrijfbare testagenda.
- Geen vreemde agenda-events wijzigen; eigen proefevents krijgen een herkenbare titel en app-/gebruiker-/afleveringsmarkering.
- All-day op de oorspronkelijke `airdate` blijft het contract. Bij een niet-werkende ochtendmelding beslist JP over het alternatief uit de specificatie.
- Eén serie is voldoende voor de eerste proef; reguliere afleveringen, geen specials.
- Geen volledige v1, agendaverhuizing, multi-user, extra databronnen of eigen notificatiedienst in dit increment.
- Buiten dit increment vallende v1-acceptatie wordt niet als voltooid gerapporteerd.
- Geen wijziging van Tailscale-policy, runnerconfiguratie of andere producten als bijvangst. Een benodigde afwijking wordt apart voorgelegd.
- Een eerste runtime op max2 gebruikt de bestaande toegestane deployroute. De bronrepo kan via Forgejo worden voorbereid; een merge is geen stilzwijgend onderdeel van deze proef.
- Uitvoering gebruikt een geïsoleerde checkout van de actuele productrepository. Omdat origin nu leeg is, is een worktree vanaf een bestaande commit nog niet mogelijk; de bootstrap legt eerst de initiële bronboom in een geïsoleerde clone vast. De documentwerkmap is geen bestaande appcheckout.

## Volgorde en taakafhankelijkheden

1. Google-login, gekozen testagenda en de echte reminderproef op max2.
2. Eén gekozen serie met herhaalbare, herstelbare agendasynchronisatie.
3. Herstart, tokenvernieuwing, scheduler en bewijsoverdracht.

Elke taak bewaart geschoonde uitvoer in `docs/praktijkproef.md`. Een negatieve reminderuitkomst is nuttig bewijs, maar voldoet niet aan de story-eis van een ontvangen passende melding. De afhankelijke reminderkeuze blijft dan open; een mock mag dat niet vervangen.

## Taak 1 — Beproef Google-koppeling en melding op max2

**Afhankelijkheden:** SSH-toegang is bevestigd; JP's proefgegevens en een bruikbare Google OAuth-client staan nog open. Zolang die ontbreken: onafhankelijke voorbereiding kan worden uitgevoerd zodra de uitvoerfase is gestart; geen account of agenda kiezen namens JP.

**Bestanden:** projectmanifest/lockbestand, `.gitignore`, `.env.example` zonder secretwaarden, `Dockerfile`, `compose.yaml`, `prisma/schema.prisma`, `src/server/auth.ts`, `src/server/google-calendar.ts`, `src/app/settings/page.tsx`, auth-routebestanden conform de gekozen library, `tests/auth.test.ts`, `tests/calendar-probe.test.ts`, `docs/praktijkproef.md`.

**Interfaces:** een geverifieerde serveridentiteit; serverzijdige Calendar-toegang; een bewaarde `calendarId`; een expliciet vastgelegde en bewezen reminderinstelling. Latere taken gebruiken dezelfde identiteit, tokenopslag en Calendar-adapter, niet een tweede koppeling.

### Stappen

- [ ] Lees de actuele repo en instructies; bevestig de lege baseline opnieuw voordat een initiële commit wordt gemaakt. Leg de productbinding vast voor When2Watch.
- [ ] Herbevestig de gecontroleerde container-/proxy-/opslaginrichting op max2 via `ssh janpeter@192.168.0.158`, zonder secrets af te drukken. Gebruik de concrete doelinrichting hierboven; leg het gekozen persistente volume en de wijzigings-/rollbackstappen vast vóór mutaties.
- [ ] Bootstrap alleen de minimale webserver, opgeslagen Google-koppeling en instellingen/proefweergave. Selecteer een onderhouden OAuth/OIDC-library, controleer diens actuele officiële documentatie en pin de gebruikte versies. Leg het concrete HTTPS-callbackpad vast vóór Google-registratie.
- [ ] Test toegelaten versus ander account, ontbrekende agenda-toestemming en behoud van een bestaande refresh-token wanneer de provider geen nieuwe geeft. Gebruik de gebruikelijke librarybescherming voor login en mutaties; alle Calendar-acties vereisen de toegelaten serveridentiteit.
- [ ] Bouw de container en plaats de minimale proef op max2 via de gecontroleerde deployroute. Gebruik alleen de voor deze app bedoelde secrets en een persistent volume. Valideer eventuele proxyconfiguratie vóór toepassen; behoud een herstelbare vorige configuratie.
- [ ] Laat JP de Google-toestemming geven en de testagenda kiezen. Lees de keuze terug. Controleer HTTPS, callback, agenda-schrijfbevoegdheid en de opslag na een herstart.
- [ ] Maak één herkenbaar all-day proefevent met de onderzochte reminderinstelling. Bewaar het geschoonde request en de API-readback. Laat JP ontvangst in de werkelijke agenda-app bevestigen met datum/tijd. Ruim uitsluitend het eigen proefevent op.
- [ ] Werkt de gewenste all-day ochtendmelding niet: noteer de waargenomen beperking en laat JP een alternatief kiezen. Geen ongedocumenteerde negatieve reminderwaarde gebruiken en geen positieve uitkomst verzinnen.

### Acceptance en verificatie

- `npm run typecheck`, `npm test -- tests/auth.test.ts tests/calendar-probe.test.ts` en `npm run build` slagen; deze scripts worden bij bootstrap ingericht.
- Een niet-toegelaten account kan geen data of Calendar-acties uitvoeren.
- De daadwerkelijke app op max2 is via het vastgelegde HTTPS-adres bereikbaar en de callback slaagt.
- Gekozen agenda en geschoonde event-readback zijn vastgelegd. Een daadwerkelijk ontvangen passende melding is afzonderlijk bevestigd; alleen API-succes volstaat niet.

## Taak 2 — Synchroniseer één gekozen serie zonder duplicaten

**Afhankelijkheden:** de Google-koppeling, testagenda en reminderkeuze uit taak 1; JP's seriekeuze. Deze taak introduceert geen nieuwe OAuth-toegang of andere agenda.

**Bestanden:** `src/server/tvmaze.ts`, `src/server/google-calendar.ts`, `src/server/sync.ts`, `prisma/schema.prisma`, `src/app/page.tsx`, een serveractie/route voor toevoegen volgens de projectconventie, `tests/tvmaze.test.ts`, `tests/sync.test.ts`, geschoonde bronfixtures en `docs/praktijkproef.md`.

**Interfaces:** de bronadapter levert een gerangschikte zoeklijst en een uitkomst “volledige snapshot” of “fout”. De syncfunctie gebruikt opgeslagen Calendar-event-ID's, de serveridentiteit en de gekozen agenda; zij levert actietellingen en foutstatus. De cronroute in taak 3 gebruikt precies deze functie.

### Stappen

- [ ] Haal echte zoekresultaten en afleveringen van JP's serie op. Bewaar geschoonde responses als parserfixtures, inclusief bron en ophaaldatum.
- [ ] Maak minimale zoekinvoer met de eerste vijf matches, overige resultaten op aanvraag, expliciete keuze, leesbare onderscheidende metadata, een aparte zoekfout en bescherming tegen oude zoekresponses. Een reeds gevolgde serie wordt niet opnieuw toegevoegd.
- [ ] Sla serie en afleveringen op met TVmaze-ID's. Valideer datums en lijstaanwezigheid; een ongeldige of ontbrekende snapshot wordt geen lege lijst.
- [ ] Implementeer het beheerde datumvenster uit de specificatie en dezelfde uitsluiting voor alle mutatietriggers. Een directe toevoegactie blijft zichtbaar bezig totdat hij geslaagd is of een expliciete fout teruggeeft.
- [ ] Bewaar een geldig Google-event-ID en create-intentie vóór de externe write. Een onzekere retry gebruikt hetzelfde ID, leest het event terug en controleert eigendom. Bevestig de lokale toestand pas na externe bevestiging.
- [ ] Gebruik voor een ontbrekende lokale mapping uitsluitend de exacte eigendoms-/afleveringsmarkering; meerdere matches worden een conflict. Werk het eigen bestaande event bij bij een datumverandering. Bronfouten muteren voor die serie niets.
- [ ] Toon met een echte agenda-readback één event per bekende aflevering. Herhaal ongewijzigde invoer en toon nul Calendar-writes. Test een datumcorrectie en een onderbreking na een geslaagde Google-create met gecontroleerde proefsituaties op uitsluitend eigen testevents.

### Acceptance en verificatie

- `npm test -- tests/tvmaze.test.ts tests/sync.test.ts`, `npm run typecheck` en `npm run build` slagen.
- Tests tegen een echte SQLite-testdatabase dekken dubbele toevoeging, ontbrekende lijst, ongeldige datum, onbekende datum, verloren lokale bevestiging na create, oude/nieuwe datums over de venstergrens en overlappende synctrigger.
- De echte serie is via matches gekozen, de brondata is herkenbaar en de testagenda bevat de bedoelde events zonder duplicaten.
- Gesimuleerde datumwijziging en onderbreking zijn als simulatie gelabeld. Ze gelden niet als werkelijk door TVmaze aangekondigde wijzigingen.

## Taak 3 — Bewijs herstart, tokenvernieuwing en cronrun op max2

**Afhankelijkheden:** geslaagde taken 1 en 2 en dezelfde benoemde testagenda, account en serie. Dit is afronding van de proef, geen uitrol van de volledige v1.

**Bestanden:** `src/app/api/cron/sync/route.ts`, `tests/cron.test.ts`, `deploy/when2watch-sync.sh`, `deploy/README.md`, `docs/praktijkproef.md`; de gecontroleerde When2Watch-crontabregel en appconfiguratie op max2.

**Interfaces:** `POST /api/cron/sync` gebruikt de gedeelde syncfunctie; secret uit de hostomgeving; `401` zonder geldige secret, `409/busy` bij overlap, `200` bij volledig succes en `502` met samenvatting bij gedeeltelijke of gehele mislukking.

### Stappen

- [ ] Test de route zonder en met onjuiste secret: geen bron- of Calendar-acties. Test succes, gedeeltelijke fout en overlap met een interactieve sync.
- [ ] Maak het hostscript dat de route aanroept zonder secrets in argumentweergave of logs te lekken, en niet-succes ook voor de scheduler als niet-succes teruggeeft. Gebruik de bestaande hostvoorziening voor secretopslag.
- [ ] Herstart alleen de proefapp. Lees serie, agendakeuze en eventkoppelingen terug. Forceer via de normale tokenclient een echte tokenvernieuwing; geen nieuwe interactieve login en geen tokens in bewijsuitvoer.
- [ ] Richt de dagelijkse regel voor When2Watch in op max2 en bewijs één werkelijk door de scheduler gestarte run. Het tijdstip volgt het met JP vastgelegde meldingsscenario. Bestaande crontabregels blijven behouden.
- [ ] Controleer daarna opnieuw agenda-inhoud en actietellingen; leg container/image-identiteit, runmoment en geschoonde resultaten vast. Noteer het nog niet geleverde bewijs voor tokengebruik ná dag zeven afzonderlijk.
- [ ] Geef JP de gebruiks-/herstelstappen en vermeld exact welke v1-criteria buiten dit increment blijven. Product-DoD wordt niet op grond van uitsluitend lokale tests geclaimd.

### Acceptance en verificatie

- `npm test -- tests/cron.test.ts`, de volledige bestaande testsuite, `npm run typecheck` en `npm run build` slagen.
- Dezelfde gegevens blijven beschikbaar na herstart; echte tokenvernieuwing lukt zonder herkoppelen.
- Een echte scheduler-aanroep op max2 is aantoonbaar; een handmatige curl telt daar niet voor.
- Het bewijsbestand onderscheidt uitgevoerd, gesimuleerd, nog open en mislukt. Dag-zevenbewijs blijft open totdat het echt is waargenomen.

## Reviewfocus

1. Verkeerd Google-account of verkeerde agenda: taak 1 moet toegang weigeren en selectie teruglezen.
2. API-event zonder ontvangen melding: taak 1 vereist cliëntbewijs; tests kunnen dat niet vervangen.
3. Bronfout als lege lijst: taak 2 bewaart bestaande events en toont een fout.
4. Onderbreking of overlap levert duplicaten: taak 2 toetst opslag vóór write en gedeelde uitsluiting.
5. Lokaal succes wordt als max2-succes gepresenteerd: taak 3 vereist herstart- en schedulerbewijs op de host.

## Overdracht en procesgrens

Materialiseer één nieuwe sprint, één PBI, één story en bovenstaande drie taken. Bewaar dit plan als PLANS-document en pin die revisie op de PBI. Elke Task krijgt de globale context en zijn eigen volledige uitvoeringstekst. De userinstructie verlangt opslaan in `Task.implementation_plan`; er wordt geen werk op een niet-geclaimde job verzonnen om een jobgebonden verifytool te kunnen gebruiken.

De actuele [Scrum4Me-workflow](scrum4me-doc://product/cmohrysyj0000rd17clnjy4tc/runbooks/plan-to-pbi-flow) zegt: “Na `create_task` (de laatste): **stop**.” Dat sluit aan op JP's AGENTS-instructie: “Na materialisatie blijft de bestaande hardstop gelden.” De uitvoeringstaken worden daarom eerst als concrete items opgeleverd; de nog ontbrekende proefinvoer en Google-configuratie zijn daarnaast echte externe afhankelijkheden.

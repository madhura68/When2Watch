# When2Watch — praktijkproef ST-001.1

Status op 23 september 2026: in uitvoering. De onderstaande lokale tests zijn uitgevoerd; echte OAuth, agendarechten en meldingsontvangst zijn nog niet bewezen.

## Vastgelegde proef

- Slow Horses, TVmaze 45039.
- Alleen JP's geverifieerde, geconfigureerde Google-account.
- Alleen de expliciet opgegeven agenda When2Watch; geen terugval op `primary`.
- Europe/Amsterdam, gewenste melding om 09:00 op de datum van het all-day item.
- Afzonderlijke ontvangstbevestiging nodig voor Apple Agenda op Mac en Google Agenda in Chrome.
- Het proefitem is herkenbaar als proef, gebruikt `reminders.useDefault: true` en bevat geen negatieve reminderwaarde. Deze instelling bewijst op zichzelf geen 09:00-melding.

## Uitgevoerd lokaal

`npm test`: 16 tests geslaagd met echte tijdelijke SQLite-databases en de productiemigratie. Google-HTTP en tokenvernieuwing zijn in deze tests gesimuleerd. Getest: account-allowlist, geverifieerde e-mail, beide scopes, privésessie, refresh-tokenbehoud, DB-heropening, tokenvernieuwing/intrekking, gekozen agenda/writerrol, all-day datums, onderbroken insert/herhaling, eigendom bij opruimen en CSRF-origincontrole.

`npm run test:http`: 21 controles geslaagd tegen een echte productiebuild van Next.js met een eigen tijdelijke SQLite-database en synthetische sessies. Inclusief publieke/privépagina, werkelijk NextAuth-sessiepad, geen tokens in HTML/JSON, weigering van alle drie Calendar-mutaties zonder/toegang met ander account en met onjuiste Origin, invoervalidatie en logout-CSRF. Geen echte Google-aanvragen in deze HTTP-test.

Onafhankelijke review van de initiële commit reproduceerde twee P2-herstelproblemen. Beide zijn met eerst falende regressietests hersteld: een bestaande onzekere aanvraag kan de volgende ochtend worden teruggelezen; create/retry/delete worden per gebruiker geserialiseerd binnen het afgesproken ene Node-proces. Een gedeeld `globalThis`-slot dekt afzonderlijke Next-routebundles en verdwijnt zodra er geen wachtende mutaties meer zijn. Geen multi-process/replica-ondersteuning in dit increment.

`npm run typecheck` en `npm run build`: geslaagd. `npm audit`: geen bekende kwetsbaarheden in de geïnstalleerde set.

Afhankelijkheden: Next 16.3.6, React 19.3.0, NextAuth 4.24.15, Prisma/client 6.19.3. Prisma 7.10.0 trok extra kwetsbare CLI-afhankelijkheden mee. De gekozen 6-lijn met ingebouwde SQLite-engine vermijdt die MySQL-afhankelijkheid. De resterende `@prisma/config`-afhankelijkheid `deepmerge-ts` is gericht op 8.0.2 gepind; de gebruikte `deepmerge`-API blijft beschikbaar. Migratie, clientgeneratie, typecheck en build zijn ermee getest.

Op de Mac exporteert de omgeving `RUST_LOG=warn`. Prisma's SQLite-bestaancontrole gaf daardoor een lege schema-enginefout. Een geïsoleerde vergelijking bewees dat `RUST_LOG=info` de initialisatie laat slagen. Alleen het testharnas en het migratiecommando stellen deze waarde in; er is geen globale omgeving gewijzigd.

## max2: wijziging en herstel

De initiële container is daadwerkelijk op max2 gebouwd en gestart met Node 24.21.0. Healthcontrole en homepage geven HTTP 200. De eigen migratie is toegepast; runtime is UID/GID 1000, rootfs read-only, env/database modus 0600, datamap 0700. Dit bewijst het containerstartpad na `npm prune`, inclusief laden van Next-configuratie, maar nog geen Google-token na een herstart.

Doel: `/srv/apps/when2watch`. UID/GID 1000, één Next.js-proces, containerproject `when2watch`, geen gepubliceerde apppoort. Extern netwerk `scrum4me_default`, alias `when2watch-web`.

Runtimegeheimen staan uitsluitend in `/srv/apps/when2watch/.env` met modus 0600. De persistente SQLite-map `/srv/apps/when2watch/data` krijgt modus 0700; het startscript gebruikt umask 077. De container draait zonder root, met alleen `/data` en `/tmp` schrijfbaar.

Voor iedere eerste proxywijziging:

1. Bevestig dat er geen bestaand When2Watch-domeinblok, container of netwerkalias is.
2. Bouw en start uitsluitend de When2Watch-container. Controleer de healthroute in de container voordat de proxy wordt aangepast.
3. Leg de SHA-256 van `/srv/scrum4me/caddy/Caddyfile` vast en maak een herstelkopie. Controleer de hash opnieuw voordat het nieuwe blok wordt toegevoegd, zodat gelijktijdige wijzigingen niet worden overschreven.
4. Voeg alleen dit blok toe: `when2watch.jp-visser.nl { reverse_proxy when2watch-web:3000 }`.
5. De Caddyfile is als bestand gemount. Werk de inhoud in-place bij; vervang niet het host-inode onder de bestaande bind-mount. Valideer met `docker exec scrum4me-caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`. Bij falen direct de eigen wijziging herstellen.
6. Pas toe met `caddy reload`, geen containerrestart. Bewijs echte HTTPS, publieke health/loginpagina en weigering van privéacties zonder sessie.

Herstel: stop alleen `docker compose -p when2watch down` vanuit de betreffende release. Verwijder het eigen domeinblok of herstel de Caddy-herstelkopie uitsluitend als er sindsdien geen andere wijzigingen zijn; valideer en reload. Laat `.env`, SQLite en bewijs behouden. Voor een volgende release blijft de vorige image-tag beschikbaar. Geen Tailscale-, runner-, andere app- of cronwijzigingen binnen deze taak.

## Google-koppeling en bewijs (nog open)

Google OAuth-clienttype: Web application. Redirect-URI exact `https://when2watch.jp-visser.nl/api/auth/callback/google`. Calendar API moet actief zijn. Scopes: `openid email profile`, `calendar.calendarlist.readonly`, `calendar.events` (volledige scope-URLs in de bron).

JP levert alleen het pad naar het private clientbestand; geen clientsecret in chat/Git/logs. Na installatie geeft JP Google-consent met zijn gekozen account. Daarna bevestigt hij in de app de vastgelegde agenda. De app leest naam, tijdzone, ID en schrijfrecht terug en bewaart die.

Maak één all-day proefitem voor een toekomstige datum. Bewaar het verzoek en de geschoonde API-readback vanuit het proefscherm. Controleer vóór 09:00 de cliëntinstellingen, de gekoppelde agenda, Focus en Chrome-meldingsrechten; Google Agenda moet in Chrome openstaan.

| Bewijs | Status |
|---|---|
| Echte Google-consent/callback | Open |
| Gekozen agenda/schrijfbevoegdheid | Open |
| Echte API-readback proefitem | Open |
| Apple Agenda: ontvangen datum/tijd | Open |
| Google Agenda in Chrome: ontvangen datum/tijd | Open |
| Blijvende Google-koppeling na containerherstart | Open |
| Eigen proefitem opgeruimd | Open |
| Gebruik na dag zeven | Later te observeren |

Alleen API-succes sluit de meldingsproef niet af. Als all-day om 09:00 niet werkt: noteer de echte beperking en laat JP het alternatief kiezen. Taken ST-001.2 (echte afleveringen) en ST-001.3 (dagelijkse synchronisatie) beginnen pas na het vereiste bewijs van taak 1.

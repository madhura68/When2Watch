# When2Watch — praktijkproef ST-001.1

Status op 23 september 2026: de minimale proefapp draait op max2 en is bereikbaar via https://when2watch.jp-visser.nl. De lokale tests en publieke HTTPS-controles zijn uitgevoerd; echte OAuth, agendarechten en meldingsontvangst zijn nog niet bewezen. ST-001.1 blijft in uitvoering.

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

## Uitgevoerde deployment

De container is daadwerkelijk op max2 gebouwd en gestart met Node 24.21.0. Actieve appcommit: `4a50e76ea9e077216c03d4da6cd7d4b680fa32ad`; image `when2watch:4a50e76`, container `when2watch-web-1`, health `healthy`. De eigen migratie is toegepast; runtime is UID/GID 1000, rootfs read-only, env/database modus 0600, datamap 0700. Dit bewijst het containerstartpad na `npm prune`, inclusief laden van Next-configuratie, maar nog geen Google-token na een herstart.

Doel: `/srv/apps/when2watch`; `current` verwijst naar `releases/4a50e76`. De gedeelde `.env` bevat dezelfde release-tag. Eén Next.js-proces, containerproject `when2watch`, geen gepubliceerde apppoort. Extern netwerk `scrum4me_default`, alias `when2watch-web`.

Runtimegeheimen staan uitsluitend in `/srv/apps/when2watch/.env` met modus 0600. De persistente SQLite-map `/srv/apps/when2watch/data` krijgt modus 0700; het startscript gebruikt umask 077. De container draait zonder root, met alleen `/data` en `/tmp` schrijfbaar.

### Werkelijke HTTPS-route

De aanname dat max2 rechtstreeks de publieke ingress was, bleek onjuist: de publieke DNS wijst naar `217.103.235.127`, waarvan poort 443 op de bestaande Caddy van `192.168.0.154` uitkomt. De eerste ACME-poging op max2 faalde daardoor. De oudere netwerkinventaris noemde Tailscale-upstreams; de actuele Caddy-configuratie gebruikt LAN-upstreams. Die bestaande route is gevolgd.

Publieke browser → HTTPS op `192.168.0.154` → geverifieerde HTTPS op max2 `192.168.0.158` → `when2watch-web:3000` op het interne Docker-netwerk. Beide bestaande proxy's hebben alleen een When2Watch-blok gekregen; overige domeinblokken zijn behouden.

- Publieke ingress: `deploy/Caddyfile.edge`, regulier Let's Encrypt-certificaat voor When2Watch.
- max2: `deploy/Caddyfile.max2`, Caddy `tls internal`, uitsluitend verkeer vanaf `192.168.0.154` toegestaan voor dit domein.
- De publieke ingress controleert de max2-certificaatidentiteit met `tls_server_name` en een expliciet vertrouwd publiek CA-certificaat in `/data/when2watch-root.crt`. Er is geen TLS-verificatie uitgezet en geen globale truststore gewijzigd.
- Alleen het publieke CA-certificaat is gekopieerd; de private CA-sleutel blijft op max2. SHA-256 van het DER-certificaat: `3c026aab5ae40c354e53dd642aebbb4aa4f15951b855b07e927ce7da6396eb64`.

Beide hosts gebruiken `/srv/scrum4me/caddy/Caddyfile`, als bestand gemount op `/etc/caddy/Caddyfile` in `scrum4me-caddy`. Elke wijziging is vooraf met een hash gecontroleerd, in-place geschreven, via de mount teruggelezen, gevalideerd met `caddy validate` en toegepast met `caddy reload`. Er zijn geen proxycontainers herstart.

### Live bewijs op 23 september 2026

| Controle | Waargenomen resultaat |
|---|---|
| Publieke TLS-handshake | TLS 1.3, Let's Encrypt YE2, vervaldatum 22 december 2026 |
| `/api/health` | HTTP 200, exact `{"status":"ok"}` |
| Homepage | HTTP 200; Google-configuratie nog niet gereed; ook visueel gecontroleerd in Chrome |
| `/settings` zonder login | HTTP 307 naar `/` |
| `POST /api/probe` zonder login | HTTP 401 |
| `DELETE /api/probe` zonder login | HTTP 401 |
| `POST /api/calendar/verify` zonder login | HTTP 401 |
| Cachebeleid van deze responses | `private, no-store` |
| Ingress naar max2 met CA- en hostnaamcontrole | HTTPS-health HTTP 200 |
| Rechtstreeks vanaf Mac naar max2 met dezelfde CA-controle | HTTP 403 |
| Eigen SQLite-tabellen User, Account en Probe | Elk 0 rijen; nog geen echte koppeling/proef aangemaakt |

### Herstel en volgende release

Op max2 staat de oorspronkelijke herstelkopie van vóór alle When2Watch-proxywijzigingen in `/srv/apps/when2watch/proxy-backups/Caddyfile.20260923T161922Z.before`. Oorspronkelijke SHA-256: `1d69ae0f72cade6a1280316ffcb7ea2ffefe0d2ca373a8227e3bd52d9b1f63df`; uiteindelijke SHA-256: `274e474ad0b188e91310751a7e9f5896d7189b9b011502c197305008b5ba2d2a`.

Op de publieke ingress staat de herstelkopie in `/home/janpeter/.local/state/when2watch/proxy-backups/Caddyfile.20260923T163811Z.before`. Oorspronkelijke SHA-256: `6ea9cd11084d359a8430b34253366934fbc0d89bf67832e435236a671756daf1`; uiteindelijke SHA-256: `3adfb49ba2fb3bf38069ffbc3ae236cb0317562f128b0ca3a59fc94d4d7abda6`.

Herstel: stop uitsluitend When2Watch met `docker compose -p when2watch down` vanuit de actuele release. Verwijder het eigen domeinblok op beide hosts of herstel een volledige kopie uitsluitend als de actuele hash nog gelijk is aan de hierboven vastgelegde eindhash. Werk weer in-place, valideer en reload. Laat `.env`, SQLite en bewijs behouden. Bij een app-rollback blijft de vorige image-tag `dfc39bb` beschikbaar; zet release-tag en `current` coherent terug. Geen Tailscale-, runner-, andere app- of cronwijzigingen zijn uitgevoerd.

Een bestaande restart-loop van drie runnercontainers op max2 is als `ISS-11` geregistreerd. Die containers zijn voor deze taak niet aangepast.

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

# When2Watch — praktijkproef ST-001.1

Status op 24 september 2026: JP bevestigt ontvangst in zowel Apple Agenda als Google Agenda in Chrome. Het eigen proefitem is via When2Watch opgeruimd; Google bevestigt status cancelled. De meldingproef is geslaagd en de all-day aanpak blijft behouden. Exacte ontvangsttijden zijn niet afzonderlijk opgegeven. De normale appactie vernieuwde ook het verlopen Google-token zonder nieuwe login. De uitvoering gaat verder met de echte afleveringen van Slow Horses.

## Vastgelegde proef

- Slow Horses, TVmaze 45039.
- Alleen JP's geverifieerde, geconfigureerde Google-account.
- Alleen de expliciet opgegeven agenda When2Watch; geen terugval op `primary`.
- Europe/Amsterdam, gewenste melding om 09:00 op de datum van het all-day item.
- Afzonderlijke ontvangstbevestiging nodig voor Apple Agenda op Mac en Google Agenda in Chrome.
- Het proefitem is herkenbaar als proef, gebruikt `reminders.useDefault: true` en bevat geen negatieve reminderwaarde. Deze instelling bewijst op zichzelf geen 09:00-melding.

## Uitgevoerd lokaal

`npm test`: 17 tests geslaagd met echte tijdelijke SQLite-databases en de productiemigraties. Google-HTTP en tokenvernieuwing zijn in deze tests gesimuleerd. Getest: account-allowlist, geverifieerde e-mail, beide scopes, privésessie, refresh-tokenbehoud, DB-heropening, tokenvernieuwing/intrekking, gekozen agenda/writerrol, all-day datums, onderbroken insert/herhaling, eigendom bij opruimen en CSRF-origincontrole. De toegevoegde regressietest gebruikt de echte PrismaAdapter om Google's optionele `refresh_token_expires_in` op te slaan; deze test faalde vóór de schemafix.

`npm run test:http`: 21 controles geslaagd tegen een echte productiebuild van Next.js met een eigen tijdelijke SQLite-database en synthetische sessies. Inclusief publieke/privépagina, werkelijk NextAuth-sessiepad, geen tokens in HTML/JSON, weigering van alle drie Calendar-mutaties zonder/toegang met ander account en met onjuiste Origin, invoervalidatie en logout-CSRF. Geen echte Google-aanvragen in deze HTTP-test.

Onafhankelijke review van de initiële commit reproduceerde twee P2-herstelproblemen. Beide zijn met eerst falende regressietests hersteld: een bestaande onzekere aanvraag kan de volgende ochtend worden teruggelezen; create/retry/delete worden per gebruiker geserialiseerd binnen het afgesproken ene Node-proces. Een gedeeld `globalThis`-slot dekt afzonderlijke Next-routebundles en verdwijnt zodra er geen wachtende mutaties meer zijn. Geen multi-process/replica-ondersteuning in dit increment.

`npm run typecheck` en `npm run build`: geslaagd. `npm audit`: geen bekende kwetsbaarheden in de geïnstalleerde set.

Afhankelijkheden: Next 16.3.6, React 19.3.0, NextAuth 4.24.15, Prisma/client 6.19.3. Prisma 7.10.0 trok extra kwetsbare CLI-afhankelijkheden mee. De gekozen 6-lijn met ingebouwde SQLite-engine vermijdt die MySQL-afhankelijkheid. De resterende `@prisma/config`-afhankelijkheid `deepmerge-ts` is gericht op 8.0.2 gepind; de gebruikte `deepmerge`-API blijft beschikbaar. Migratie, clientgeneratie, typecheck en build zijn ermee getest.

Op de Mac exporteert de omgeving `RUST_LOG=warn`. Prisma's SQLite-bestaancontrole gaf daardoor een lege schema-enginefout. Een geïsoleerde vergelijking bewees dat `RUST_LOG=info` de initialisatie laat slagen. Alleen het testharnas en het migratiecommando stellen deze waarde in; er is geen globale omgeving gewijzigd.

## Uitgevoerde deployment

De container is daadwerkelijk op max2 gebouwd en gestart met Node 24.21.0. Actieve appcommit: `961fc09330236e86c20d449f2d42ee9b836c1436`; image `when2watch:961fc09`, container `when2watch-web-1`, health `healthy`. De eigen migraties zijn toegepast; runtime is UID/GID 1000, rootfs read-only, env/database modus 0600, datamap 0700. De app is na de Google-koppeling opnieuw gestart om 18:36:02 UTC. Daarna bleef dezelfde browsersessie ingelogd, waren agenda en proefitem bewaard en slaagde een nieuwe echte Google-agendacontrole. Dit bewijst opgeslagen toegang na herstart; het is nog geen bewijs van echte refresh-tokenvernieuwing.

Doel: `/srv/apps/when2watch`; `current` verwijst naar `releases/961fc09`. De gedeelde `.env` bevat dezelfde release-tag. Eén Next.js-proces, containerproject `when2watch`, geen gepubliceerde apppoort. Extern netwerk `scrum4me_default`, alias `when2watch-web`.

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
| Homepage | HTTP 200; Google-configuratie geïnstalleerd; echte login in Chrome geslaagd |
| `/settings` zonder login | HTTP 307 naar `/` |
| `POST /api/probe` zonder login | HTTP 401 |
| `DELETE /api/probe` zonder login | HTTP 401 |
| `POST /api/calendar/verify` zonder login | HTTP 401 |
| Cachebeleid van deze responses | `private, no-store` |
| Ingress naar max2 met CA- en hostnaamcontrole | HTTPS-health HTTP 200 |
| Rechtstreeks vanaf Mac naar max2 met dezelfde CA-controle | HTTP 403 |
| Eigen SQLite-tabellen User, Account en Probe | Eén toegelaten gebruiker, één Google-koppeling, één eigen proefitem |

### Herstel en volgende release

Op max2 staat de oorspronkelijke herstelkopie van vóór alle When2Watch-proxywijzigingen in `/srv/apps/when2watch/proxy-backups/Caddyfile.20260923T161922Z.before`. Oorspronkelijke SHA-256: `1d69ae0f72cade6a1280316ffcb7ea2ffefe0d2ca373a8227e3bd52d9b1f63df`; uiteindelijke SHA-256: `274e474ad0b188e91310751a7e9f5896d7189b9b011502c197305008b5ba2d2a`.

Op de publieke ingress staat de herstelkopie in `/home/janpeter/.local/state/when2watch/proxy-backups/Caddyfile.20260923T163811Z.before`. Oorspronkelijke SHA-256: `6ea9cd11084d359a8430b34253366934fbc0d89bf67832e435236a671756daf1`; uiteindelijke SHA-256: `3adfb49ba2fb3bf38069ffbc3ae236cb0317562f128b0ca3a59fc94d4d7abda6`.

Herstel: stop uitsluitend When2Watch met `docker compose -p when2watch down` vanuit de actuele release. Verwijder het eigen domeinblok op beide hosts of herstel een volledige kopie uitsluitend als de actuele hash nog gelijk is aan de hierboven vastgelegde eindhash. Werk weer in-place, valideer en reload. Laat `.env`, SQLite en bewijs behouden. Eerdere appreleases blijven beschikbaar; zet release-tag en `current` coherent terug. Releases vóór `961fc09` missen de OAuth-schemafix en zijn daarom geen werkende loginoplossing. De extra optionele databasekolom hoeft bij een app-rollback niet verwijderd te worden. Geen Tailscale-, runner-, andere app- of cronwijzigingen zijn uitgevoerd.

Een bestaande restart-loop van drie runnercontainers op max2 is als `ISS-11` geregistreerd. Die containers zijn voor deze taak niet aangepast.

## Google-koppeling en bewijs

Google OAuth-clienttype: Web application. Redirect-URI exact `https://when2watch.jp-visser.nl/api/auth/callback/google`. Project: `when2watch-509517`; Google Cloud toont Calendar API `Enabled`. Scopes: `openid email profile`, `calendar.calendarlist.readonly`, `calendar.events` (volledige scope-URLs in de bron).

JP heeft het private clientbestand op 23 september aangeleverd. Type, verplichte velden en exacte redirect zijn gecontroleerd zonder credentialwaarden af te drukken. Het lokale bestand en de server-`.env` hebben modus 0600. Alleen Client ID en Client secret zijn via SSH-stdin naar de bestaande max2-configuratie overgebracht; geheimen blijven buiten chat, Git en bewijs.

De clientconfiguratie is eerst met image `4a50e76` geactiveerd. `/api/auth/providers` toonde Google met de juiste callback. De drie Calendar-mutaties bleven zonder sessie HTTP 401 geven; de geteste publieke responses bevatten geen clientsecret. Privéconfig-backup: `/srv/apps/when2watch/config-backups/.env.20260923T181443Z.before-google`.

De eerste login gaf `403 access_denied`: External / Testing had nog geen testgebruiker. JP heeft zichzelf vervolgens als tester toegevoegd. Google toonde bij de daaropvolgende aanmelding de vijf al verleende rechten. De callback liep daarna vast op het opslaan van Google's optionele veld `refresh_token_expires_in`. Een tijdelijke diagnose legde uitsluitend veldnamen en typen vast, nooit waarden. De echte PrismaAdapter-regressietest reproduceerde `Unknown argument refresh_token_expires_in`.

Commit `961fc09` voegt een optionele integerkolom en een additieve migratie toe en verwijdert de tijdelijke diagnose. Vóór herstel is uitsluitend de app gestopt en de eigen SQLite-database privé gekopieerd naar `/srv/apps/when2watch/db-backups/when2watch.20260923T182950Z.before-oauth-repair.db`. De ene onvolledig aangemaakte gebruiker is pas verwijderd nadat het exacte account en alle lege relatie-tabellen waren gecontroleerd. Er is geen authcontrole omzeild of automatische accountkoppeling aangezet. Op de nieuwe release slaagt de echte OAuth-callback.

De opgeslagen Google-koppeling bevat een access-token, refresh-token en beide Calendar-scopes. Bewijs bevat alleen aanwezigheidsbooleans. De Google Calendar API bevestigt de opgegeven agenda-ID, naam `When2Watch`, tijdzone `Europe/Amsterdam` en toegangsrol `owner`. Na containerherstart slaagde `Agenda opnieuw controleren` zonder nieuwe login.

### Werkelijk proefitem en verschillen tussen clients

Op 23 september is via When2Watch één all-day item aangemaakt voor **24 september 2026**:

- Titel: `When2Watch — meldingsproef Slow Horses`.
- Probe-ID: `6277ae74-32f3-4d4b-ab6d-51eb803ee881`.
- Google event-ID: `pbf32054e863a4d64a2480246e77fb163`.
- Start `2026-09-24`, exclusieve einddatum `2026-09-25`; status `confirmed`.
- Geschoond werkelijk request/readback: `docs/evidence/2026-09-23-google-proef.json`.

**Google Agenda in Chrome:** vóór de insert is de all-day standaard voor When2Watch op dezelfde dag om 09:00 gezet; Google bevestigde dat de meldingsinstellingen waren opgeslagen. Desondanks is de CalendarList-readback `defaultReminders: []`. Het eventrequest bevat `reminders.useDefault: true`, maar de echte event-readback bevat `useDefault: false` zonder overrides. Het item is zichtbaar in Chrome; de bewerkingspagina heeft een lege lijst Meldingen. Die pagina is zonder wijzigingen verlaten. Dit bewijst een beperking van deze geteste route, niet dat elke mogelijke all-day oplossing onmogelijk is. Op 23 september was ontvangst nog onbewezen; op 24 september bevestigt JP dat de Chrome-melding toch is ontvangen. De eerdere API/UI-observatie voorspelde de werkelijke ontvangst dus niet correct.

**Apple Agenda op Mac:** When2Watch is aangevinkt en het echte proefitem is zichtbaar. JP heeft uitdrukkelijk gekozen voor de accountbrede Google-standaard op de Mac: dezelfde dag om 09:00, ook voor andere hele-dagafspraken van dat Google-account. Bij de controle op 23 september stond deze voorkeur al ingesteld; het bestaande proefitem toonde `Alert on day of event at 09:00 (default)`. Er is geen afzonderlijke handmatige eventmelding toegevoegd.

**Ontvangst op 24 september:** JP meldt in reactie op de vraag naar de Apple Agenda-melding: “melding is binnen gekomen. dit werkt”. Dit is werkelijk gebruikersbewijs van ontvangst, geen simulatie of afleiding uit een API-response. De ingestelde tijd was 09:00 Europe/Amsterdam; een exact waargenomen tijdstip is niet gegeven en wordt niet ingevuld. Op dat moment stond de afzonderlijke Chrome-bevestiging nog open; die volgde in de volgende reactie.

**Ook Chrome ontvangen:** JP bevestigt op 24 september: “Chrome heb ik ook binnen, we kunnen verder”. Daarmee zijn beide clients praktisch beproefd. Het all-day model met de ingestelde standaardmeldingen blijft behouden; een tijdgebonden alternatief is niet nodig. Exacte ontvangsttijden blijven niet afzonderlijk gemeten.

**Opruiming en tokenvernieuwing:** de app verwijderde uitsluitend proefitem `pbf32054e863a4d64a2480246e77fb163`. Readback op 24 september om 07:09:01 UTC: lokale status deleted, Google HTTP 200/status cancelled. De normale appactie vernieuwde het reeds verlopen toegangstoken: expires_at ging van 1790191848 naar 1790237300 zonder nieuwe login; needsReauth bleef false. Tokenwaarden blijven buiten bewijs.

De MCP-planverificatie kon niet draaien omdat deze nieuwe repo geen origin/main heeft. De tool probeerde git diff origin/main...HEAD. Er is geen fictieve branch aangemaakt. De taakcriteria zijn handmatig tegen tests, live OAuth/agenda/herstartbewijs, beide gebruikersbevestigingen en de cleanup-readback gecontroleerd.

| Bewijs | Status |
|---|---|
| Clientconfig geïnstalleerd, callback geregistreerd, Calendar API actief | Bewezen op 23 september 2026 |
| Google-testgebruiker toegelaten | JP bevestigd; nieuwe Google-login geslaagd |
| Echte Google-consent/callback | Geslaagd met bestaande toestemming, release `961fc09` |
| Gekozen agenda/schrijfbevoegdheid | Exacte agenda, Europe/Amsterdam, owner via echte API |
| Echte API-readback proefitem | Vastgelegd; `useDefault: false`, geen overrides |
| Apple Agenda: instelling op het proefitem | Dezelfde dag om 09:00 (standaard) |
| Google Agenda in Chrome: instelling op het proefitem | Geen melding, ondanks all-day agendastandaard 09:00 |
| Apple Agenda: ontvangen datum/tijd | Ontvangst bevestigd door JP op 24 september; exacte tijd niet opgegeven |
| Google Agenda in Chrome: ontvangen datum/tijd | Ontvangst bevestigd door JP op 24 september; exacte tijd niet opgegeven |
| Blijvende Google-koppeling na containerherstart | Bewezen met dezelfde sessie en nieuwe Google-agendacontrole |
| Echte refresh-tokenvernieuwing | Normale appactie vernieuwde verlopen token op 24 september zonder nieuwe login; taak 3 herhaalt dit na serie-opslag |
| Eigen proefitem opgeruimd | App meldt verwijderd; Google bevestigt cancelled op 24 september |
| Gebruik na dag zeven | Later te observeren |

Alleen API-succes sluit de meldingsproef niet af. Als all-day om 09:00 niet werkt: noteer de echte beperking en laat JP het alternatief kiezen. Taken ST-001.2 (echte afleveringen) en ST-001.3 (dagelijkse synchronisatie) beginnen pas na het vereiste bewijs van taak 1.

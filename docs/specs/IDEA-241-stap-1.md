---
title: "IDEA-241 — Specificatie stap 1: Engels, afspraakmodel, landing, privacy en proefevent"
status: draft
version: "0.2"
date: "2026-10-08"
idea: IDEA-241
source_commit: 1554c6a
last_updated: 2026-10-08
---

# IDEA-241 — Specificatie stap 1

**Product:** When2Watch (`cmud1npa000rykh7rlhlhojd3`). **Idee:** IDEA-241 (`cmuy9t8sp009ho07rcdqym802`). **Bron:** [grills/idea-241-verkenning](../grills/IDEA-241-verkenning.md) revisie 3, besluiten 1 t/m 14 van 8 oktober 2026, plus JP's besluit van 8 oktober over de twee afwijkingen in §2. **Codebasis:** `origin/main` op `1554c6a` (IDEA-219 R2 in productie sinds 26 september 2026). Dit is een ontwerp ter beoordeling, geen uitvoeringsplan en geen uitvoeringsopdracht.

Versie 0.2 verwerkt JP's akkoord op de twee afwijkingen uit versie 0.1 en voegt het Review record toe.

## 1. Doel en eerste bruikbare resultaat

JP wil When2Watch als officieel product bij Google registreren en een gratis, Engelstalige app aanbieden waarmee genodigden zonder testgebruikerslijst hun Google-agenda koppelen. Stap 1 levert daarvoor de voorwaarden: een volledig Engelstalige app, een Engels afspraakmodel met locatieveld en keuze voor een vast tijdstip, een openbare landingpagina, een Engels privacybeleid en de omschakeling van het OAuth-consentscherm naar Production.

**Eerste bruikbare resultaat:** één `[W2W TEST]`-proefevent met locatie en vast tijdstip in JP's eigen app-agenda, met een op de iPhone vastgelegde melding, gevolgd door een eerste genodigde die via het Google-waarschuwingsscherm zijn agenda koppelt zonder op een testgebruikerslijst te staan.

**Niet-doelen van stap 1:** TMDB/JustWatch-aanbieders en de regiokeuze (stap 3), de nieuwe navigatie met Search en Running/Ended (stap 4), de `/welcome`-reeks (stap 5), het indienen van de Google-verificatie (stap 2, wordt hier wel voorbereid), Vercel/Neon, VAPID.

**Voorwaarde (stap 0):** JP's eigen binding is sinds de R2-omschakeling `LEGACY_UNVERIFIED` met gepauzeerde sync. Vóór stap 1 wordt uitgerold moet JP opnieuw inloggen, een `APP_CREATED`-agenda aanmaken, een eerste sync draaien en een melding ontvangen hebben. Zonder dat bewijs is de Production-switch (§8) niet toegestaan.

## 2. Besluiten op de grill (JP, 8 oktober 2026)

JP heeft op 8 oktober 2026 beide onderstaande afwijkingen van de grill goedgekeurd; ze gelden als besluit voor deze specificatie.

| Besluit | Invulling | Reden |
| --- | --- | --- |
| 6 (bevriezen vóór vandaag) | **Het bestaande syncvenster van 7 dagen blijft ongewijzigd.** De sync maakt, wijzigt en verwijdert alleen afspraken van afleveringen met een datum vanaf de lokale datum min 7 dagen (`src/server/sync.ts:131-133`, `:209-212`, `:233`). Oudere afspraken worden nu al niet aangeraakt. Er komt geen aparte "vanaf vandaag"-regel; besluit 6 wordt gelezen als "buiten het venster wordt niets herschreven". | De grill ging uit van "alle gedateerde afleveringen worden geschreven"; dat klopte niet (R2-omschakeling: 28 links op 834 afleveringen). Het venster begrenst het PATCH-volume al tot hoogstens één week verleden plus toekomst, is getest (`tests/sync.test.ts:180-187`) en vangt datumverschuivingen binnen een week op. Een extra regel voegt complexiteit toe zonder faalpad. |
| 10/11 (TMDB-vermelding) | De TMDB-notice en de JustWatch-vermelding op landingpagina en privacypagina komen pas in stap 3, wanneer die data werkelijk wordt gebruikt. Stap 1 vermeldt alleen TVmaze. | Een bronvermelding voor een bron die nog niet wordt gebruikt is onjuist in een privacybeleid. De pagina's krijgen in stap 1 wel een vaste plek (bronnenblok) waar stap 3 de regels toevoegt. |

Aanvullingen binnen de besluiten:

| Besluit | Aanvulling | Reden |
| --- | --- | --- |
| 6 (link naar seriepagina) | De link in de beschrijving wijst naar `/following#show-<tvmazeId>`. De rij op Following krijgt dat anker nu al. | Een seriepagina bestaat niet; het anker is stabiel over stap 4 heen, zodat de beschrijving later niet opnieuw hoeft te worden gepatcht. |
| 9 (navigatie) | Stap 1 vertaalt alleen de bestaande navigatie: Agenda · Following · Settings, plus Users · Stats voor de admin. Search en Running/Ended volgen in stap 4. | Scope van stap 1. |
| 12 (regio) | Geen landkolom in stap 1. | Niet nodig zonder aanbieders; toevoegen in stap 3 is één expand-migratie. |

## 3. Engelse omschakeling (besluit 10)

### 3.1 Omvang

Alle gebruikersgerichte tekst wordt Engels, in één release, zonder i18n-laag. De inventaris op `1554c6a`: ongeveer 325 UI-strings in 20 bestanden onder `src/app/`, 119 `AppError`-meldingen in 27 bestanden onder `src/server/` en `src/app/api/`, de 500-fallback in `src/server/errors.ts:14`, de syncfouttekst `sync.ts:17`, de catalogusfallback `catalog.ts:7`, en de labels in `src/lib/series-list.ts:4-6`.

Taal- en opmaakregels:

| Onderdeel | Nu | Wordt |
| --- | --- | --- |
| `src/app/layout.tsx:15` | `lang="nl"`, footer "Persoonlijke serieagenda" | `lang="en"`, footer "When2Watch · Your series, in your calendar · Privacy" |
| `src/app/layout.tsx:5`, `manifest.ts:5-6` | description "Je series, in je agenda.", `lang: "nl"` | "Your series, in your calendar.", `lang: "en"` |
| Datums (`agenda-panel.tsx:4`, `series-panel.tsx:11-12`, `beheer/series/page.tsx:22`) | `nl-NL` | `en-GB`, 24-uurs (`hourCycle: "h23"`), tijdzone van de gebruiker; adminpagina `Europe/Amsterdam` blijft |
| Sortering (`agenda.ts:14`, `series-list.ts:11`) | `localeCompare(…, "nl")` | `localeCompare(…, "en")` |
| `overview.ts:26`, `sync.ts:22` | `localeCompare` zonder locale | ongewijzigd (sleutelvergelijking) |
| Verwijderbevestiging (`privacy.ts:9`, `privacy-panel.tsx:26`) | `"VERWIJDEREN"` | `"DELETE"`; tests en smoke volgen |
| Seriestatuslabels (`series-list.ts:4-6`) | Lopend / Vervolg nog onzeker / Beëindigd / Status onbekend | Running / Renewal undecided / Ended / Status unknown |
| Navigatielabels (`navigation.tsx:6-7`) | Hoofdnavigatie; Agenda / Volgen / Instellingen / Beheer / Statistiek | `aria-label="Main navigation"`; Agenda / Following / Settings / Users / Stats |
| DOM-ankers | `#voorkeuren`, `#agenda-keuze` | `#preferences`, `#calendar`; `#google` en `#privacy` blijven |
| Knoppen Volgen/Proberen (`series-panel.tsx:94-95, 106, 115`) | Volgen, Proberen | Follow, Try; label "Trying" |

Wire-waarden (`trying`, `following`, TVmaze-statussen, foutcodes zoals `SYNC_BUSY`) veranderen niet. Alleen de tekst in `AppError`-meldingen wijzigt; codes en statussen blijven gelijk.

### 3.2 Routes en redirects

| Oud | Nieuw | Redirect |
| --- | --- | --- |
| `/volgen` | `/following` | `next.config.ts` `redirects()`, `permanent: false` |
| `/uitnodiging` | `/invitation` | idem; browsers behouden het `#token=`-fragment bij een redirect, dus al verstuurde links blijven 72 uur werken |
| `/beheer/gebruikers` | `/admin/users` | idem |
| `/beheer/series` | `/admin/series` | idem |

Aan te passen verwijzingen: `navigation.tsx:3,7`, `agenda-panel.tsx:17-18`, `invitation-entry.tsx:12,21`, `invitations.ts:30` (uitgegeven link wordt `/invitation#token=…`), `admin-users-panel.tsx:33-35`, en de paginamappen zelf. De redirects worden in de spec van stap 4 of na 30 dagen verwijderd; dat staat in de uitrolnotitie.

### 3.3 Google-afspraaktekst

Zie §4. De tekst van afspraken die buiten het syncvenster vallen blijft Nederlands (besluit 6, §2).

### 3.4 Kleine correcties in dezelfde bestanden

- `admin-users-panel.tsx:15` leest `data.error?.message`, terwijl `errorResponse` (`errors.ts:10`) `error` als string teruggeeft; daardoor ziet de admin altijd de fallback. Wordt `data.error`.
- De `?error=`-melding op `/` (`page.tsx:33`) noemt "de eigenaar van deze installatie"; wordt neutraal: "Sign-in failed. Use the Google account you were invited with, then try again."

### 3.5 Buiten scope van de vertaling

`README.md`, `AGENTS.md`, `deploy/README.md`, `docs/**` en de `scripts/prove-*.ts` blijven Nederlands; dat zijn beheerdersdocumenten van JP. `public/icons/when2watch-scherm*.svg` hebben een Nederlandse `<title>` maar worden nergens gebruikt; ongewijzigd.

## 4. Afspraakmodel (besluiten 6 en 7)

### 4.1 Velden

`CalendarEvent` (`src/server/google-calendar.ts:7-18`) krijgt `location?: string` en `timeZone?: string` op `start` en `end`. `safeEvent` (`:153-159`) neemt `location` mee in de proefreadback. `calendarEventHash` (`sync.ts:18-23`) hasht daarnaast `location ?? ""`, `start.timeZone ?? null` en `end.timeZone ?? null`; zonder dat zou een wijziging in locatie of tijdzone geen PATCH veroorzaken.

### 4.2 Opbouw

`episodeEvent` (`sync.ts:26-32`) krijgt als invoer de serie (`title`, `tvmazeId`, `platform`, `country`, `runtimeMinutes`), de aflevering, de gebruikersvoorkeuren (`eventMode`, `eventTime`, `timeZone`), de app-origin en een lijst regionale aanbieders met landnaam (in stap 1 altijd leeg).

| Veld | Inhoud |
| --- | --- |
| `summary` | `{title} · S{ss}E{ee} · {episodeTitle}`; zonder seizoen/nummer `{title} · {episodeTitle}`; zonder afleveringstitel vervalt dat deel |
| `location` | `{Country}: {provider}, {provider}` wanneer de lijst niet leeg is; anders wordt het veld **weggelaten** (stap 1: altijd weggelaten) |
| `description` | Regel 1: `Originally on {platform} ({country}).`, of `Original broadcaster not known.` als `platform` ontbreekt (land weglaten als onbekend). Regel 2: `Original release date according to TVmaze.` Regel 3: `Episode: {episode.sourceUrl}`. Regel 4: `When2Watch: {origin}/following#show-{tvmazeId}`. Regel 5: `Source: TVmaze (CC BY-SA).` Regel 6 (alleen met locatie, dus pas stap 3): `Watch availability: JustWatch via TMDB.` |
| `start`/`end` bij All-day | ongewijzigd: `{ date: airdate }` / `{ date: airdate + 1 }` |
| `start`/`end` bij Fixed time | `{ dateTime: "{airdate}T{HH:MM}:00", timeZone }` en einde = start plus `runtimeMinutes`, anders 60 minuten, als wandkloktijd in dezelfde zone; een DST-overgang in dat uur wordt aanvaard zoals Google hem interpreteert |
| `transparency` | `transparent` |
| `reminders` | `{ useDefault: true }` |
| `extendedProperties.private` | ongewijzigde markers |

Google accepteert `dateTime` zonder offset wanneer `timeZone` is gezet. Reminders volgen de agenda-standaard; Google Agenda heeft aparte standaardherinneringen voor hele-dag- en tijdgebonden afspraken, en de gebruiker stelt beide zelf in.

### 4.3 Bestaande koppelingen na uitrol

`confirmedDesiredHash` (`sync.ts:250`) wijkt na uitrol af voor iedere gekoppelde aflevering in het venster, dus de eerstvolgende sync per gebruiker (handmatig of cron 06:05) stuurt één PATCH per afspraak in het venster. Daarbuiten gebeurt niets. `overview.ts:31` toont die items tot de bevestiging als niet-gekoppeld; dat is het bestaande gedrag bij een tekstwijziging (`tests/sync.test.ts:137-145`). Er worden geen nieuwe event-ID's aangemaakt en geen duplicaten (A4).

### 4.4 Voorkeur

`UserPreferences` (`prisma/schema.prisma:58-63`) krijgt `eventMode` (enum `ALL_DAY` | `FIXED_TIME`, standaard `ALL_DAY`) en `eventTime` (`String?`, `HH:MM`, verplicht bij `FIXED_TIME`, anders `null`). Expand-only migratie; bestaande rijen blijven All-day.

`savePreferences` (`preferences.ts:19-31`) accepteert de twee nieuwe sleutels; `eventTime` matcht `^([01]\d|2[0-3]):[0-5]\d$`; `FIXED_TIME` zonder tijd is `INVALID_INPUT`. `currentSettings` (`services.ts:24-27`) geeft de voorkeuren door aan de sync. Het voorkeurenpaneel toont "Event style" als keuzerondjes All-day / Fixed time met een tijdveld (standaard 20:00) en de hulptekst "Applies to upcoming episodes at the next sync. Reminders follow your Google Calendar settings." Opslaan start geen sync; de bestaande knop Sync now op Following of de dagelijkse run past het toe (binnen het venster van §2).

## 5. Proefevent (besluit 14, eerste praktijkbewijs)

`calendar-probe.ts:46-54` bouwt het proefitem voortaan met dezelfde builder als §4.2, met vaste fictieve invoer:

| Veld | Inhoud |
| --- | --- |
| `summary` | `[W2W TEST] Example Show · S01E01 · Example episode` |
| `location` | `Netherlands: Example service A, Example service B` (altijd gevuld, ook in stap 1, om de zichtbaarheid van het veld te beproeven) |
| `description` | `Notification test only — not a real episode.` gevolgd door `Originally on Example broadcaster.`, de uitleg dat de datum geen echte release is, `When2Watch: {origin}/following` en `Source: TVmaze (CC BY-SA).` |
| Vorm | de actuele voorkeur van de gebruiker (All-day of Fixed time met de ingestelde tijd, duur 60 minuten) |
| Markers | ongewijzigd `kind: "probe"` |

`POST /api/probe` houdt `{ date }` als invoer; de vorm volgt de voorkeur, zodat de proef precies toont wat echte afspraken zullen doen. De controle op `calendar-probe.ts:76` vergelijkt `start`/`end` met de opgeslagen `requestJson` in plaats van `dateTime` te verbieden. Het proefpaneel in Settings toont per proef de gebruikte vorm en de teruggelezen locatie. Opruimen (`removeLocked`) blijft gelijk.

**Proefprocedure** (JP, na uitrol van stap 1, met voorkeur Fixed time 20:00):

1. Settings: agenda bevestigen (`APP_CREATED`), voorkeur op Fixed time 20:00 zetten.
2. Eén proefitem voor morgen aanmaken; readback controleren op titel, locatie, `dateTime` en `timeZone`.
3. Op de iPhone in de gebruikte agenda-app(s) (Apple Agenda en/of Google Agenda) de afspraak openen: titel, locatie, beschrijving en link vastleggen.
4. De melding afwachten die de agenda-app voor tijdgebonden afspraken geeft; vastleggen: app, feitelijke ontvangsttijd, zichtbare titel, of de **locatie** zichtbaar is, afkapping.
5. Voorkeur terug op All-day, tweede proefitem, zelfde waarneming voor de hele-dagvorm.
6. Beide proefitems opruimen via het paneel en de uitkomst controleren.

Bewijs komt in `docs/evidence/idea-241-stap-1.md` (schermbeschrijving, geen tokens). Of de locatie in de melding zichtbaar is, is een open vraag uit de grill; het antwoord bepaalt of de aanbieders in stap 3 alleen in de afspraak of ook in de melding terechtkomen.

## 6. Landingpagina (besluit 11)

De onaangemelde tak van `src/app/page.tsx:22-38` wordt vervangen door een Engelse landingpagina met bestaande klassen (`hero`, `card`, `steps-summary`, `notice`):

1. Header met merk en tag "Your series, in your calendar".
2. Hero: "A new episode. A timely reminder." met intro: When2Watch puts the original release date of every episode you follow into a Google Calendar of its own, so your phone reminds you the way you already set it up.
3. Drie stappen: Follow a series · It lands in your Google Calendar · See where to watch (de derde stap verwijst vooruit naar stap 3; tekst "Where to watch is coming soon" tot stap 3 live is).
4. Kaart "Access is by invitation for now": "When2Watch is free and currently invite-only. Have an invitation? Open the link you received." plus de knop Sign in with Google voor bestaande accounts, en de bestaande `oauthReady()`-melding in het Engels. Geen wachtlijst, geen formulier.
5. Bronnenblok: "Episode data: TVmaze (CC BY-SA)" met link; vaste plek voor de TMDB/JustWatch-regels van stap 3.
6. Footer (layout): Privacy en contact (`W2W_PRIVACY_CONTACT`, alleen tonen als gezet).

Metadata: `/` (onaangemeld) en `/privacy` krijgen `robots: index, follow`; alle ingelogde pagina's houden `noindex` uit de layout. Alleen `/`, `/privacy`, `/invitation`, `/manifest.webmanifest`, iconen en `/api/health` zijn zonder sessie bereikbaar; dat is nu al zo en wordt in de smoke-test vastgehouden.

De ingelogde tak van `/` (Agenda) verandert alleen van taal.

## 7. Privacybeleid (besluit 10)

`src/app/privacy/page.tsx` wordt in het Engels herschreven, zelfde structuur, met de eisen van Google voor een privacybeleid bij sensitive scopes: welke Google-gegevens de app opvraagt, waarvoor, hoe ze worden opgeslagen en met wie ze worden gedeeld.

| Sectie | Inhoud |
| --- | --- |
| Purpose | Original release dates of followed series as events in a calendar created by When2Watch in your Google account; access by invitation only. |
| Operator and contact | `W2W_PRIVACY_CONTROLLER` · `W2W_PRIVACY_CONTACT`, fallback "The operator's details are filled in when this installation is set up." |
| Google data we use | Name and e-mail for sign-in; with your separate consent, read access to your calendar list and full access only to calendars When2Watch created (`calendar.calendarlist.readonly`, `calendar.app.created`); tokens stored encrypted on the server; When2Watch never reads or changes other calendars; no Google data is shared with third parties. |
| Other data | Followed/tried series, preferences (time zone, agenda range, event style), the events When2Watch placed in its calendar. Series data from TVmaze, shared between users; admin sees follower counts, not who. |
| Retention | Bestaande termijnen uit `retention.ts:7`, zoekcache 1 uur/10 minuten, back-ups 30 dagen. |
| Your rights | Export en verwijdering via Settings (`/settings#privacy`), bevestiging met DELETE; agenda-items blijven in Google; een verwijderd account keert na een back-upherstel niet terug. |
| Hosting | Eigen server van de operator; de operator kan technisch bij de database. |
| Google API Services User Data Policy | Zin dat het gebruik van Google-gegevens voldoet aan de Google API Services User Data Policy inclusief de Limited Use-eisen (vereist voor verificatie). |

Stap 3 voegt TMDB/JustWatch en de landvoorkeur toe. De pagina blijft zonder sessie bereikbaar en wordt in het consentscherm als privacy-URL ingevuld (§8).

## 8. OAuth-consent naar Production (besluit 2, stap 1 van de verificatieroute)

Dit is beheerderswerk van JP in de Google Cloud Console (project `when2watch-509517`), vastgelegd in een nieuwe runbook `docs/runbooks/idea-241-production-consent.md`. Volgorde:

1. **Voorwaarden:** stap 0 bewezen; stap 1 uitgerold op max2; `/` en `/privacy` Engels en publiek bereikbaar.
2. **Scopes op het consentscherm** gelijk aan de code: `openid`, `email`, `profile`, `calendar.calendarlist.readonly`, `calendar.app.created`. `calendar.events` (nog genoemd in `docs/praktijkproef.md:128`) verwijderen als het er staat. Een verschil tussen gedeclareerde en gevraagde scopes geeft ook ná verificatie het waarschuwingsscherm.
3. **Branding:** app name "When2Watch", support e-mail, homepage `https://when2watch.jp-visser.nl`, privacy `https://when2watch.jp-visser.nl/privacy`, authorized domain `jp-visser.nl`. Logo pas uploaden bij de verificatie (stap 2): zonder verificatie toont Google alleen het domein.
4. **Audience → Publish app.** Status wordt In production; de testgebruikerslijst is niet meer bepalend. Google toont bij sensitive scopes de melding dat verificatie nodig is; publiceren kan toch.
5. **Controle met een niet-testaccount** (tweede Google-account van JP of de eerste genodigde): uitnodiging accepteren, identiteitslogin zonder waarschuwing, agendatoestemming mét "Google hasn't verified this app" → Advanced → Go to When2Watch, agenda aanmaken, eerste sync. Vastleggen in `docs/evidence/idea-241-stap-1.md`.
6. **Uitnodigingstekst** voor JP's mail bevat een vaste alinea die het waarschuwingsscherm aankondigt en uitlegt hoe door te klikken.

Randvoorwaarden uit de Google-documentatie: de onverifieerde-app-grens is "100 new users in total" over de hele levensduur van het project en kan niet worden gereset; verificatie heft hem op. Het 7-dagen-tokenverval geldt alleen in Testing. Verificatie zelf (brand plus sensitive scope: demo-video, scope-motivatie, Search Console) is stap 2 en valt buiten deze spec; de homepage- en privacy-eisen worden hier al vervuld.

## 9. Gegevensmodel en migratie

| Wijziging | Soort |
| --- | --- |
| `UserPreferences.eventMode` enum `EventMode { ALL_DAY, FIXED_TIME }` default `ALL_DAY` | expand |
| `UserPreferences.eventTime String?` | expand |
| `Probe.requestJson` bevat voortaan `location` en eventueel `dateTime`/`timeZone` | geen schemawijziging |
| `CalendarEventLink.desiredJson` idem | geen schemawijziging |

Geen contract- of destroy-fase. Uitrol volgens `deploy/README.md` (release bouwen, `pg_dump`, migratie als aparte stap, nieuwe web-container, health, `current` omzetten). Rollback: vorige release starten; de nieuwe kolommen zijn onschadelijk voor de oude code.

## 10. Acceptatie

| ID | Waarneembare acceptatie | Bewijs |
| --- | --- | --- |
| A1 | Geen Nederlandse tekst meer in `src/`: een grep op een vaste woordenlijst (agenda, serie, instellingen, volgen, proberen, melding, opnieuw, bevestig, verwijder, uitnodiging, beheer) over `src/` geeft nul treffers buiten identifiers; `lang="en"`, manifest `en`, datums `en-GB` 24-uurs | grep in CI-stap of test; smoke-assert op `lang="en"` en `aria-label="Main navigation"` |
| A2 | `/following`, `/invitation`, `/admin/users`, `/admin/series` werken; oude paden geven 307 naar het nieuwe pad; `/invitation#token=…` uit een oude `/uitnodiging`-link werkt in Safari op iPhone en in desktop-Chrome | smoke-test (nieuwe en oude paden); handmatige fragmentproef |
| A3 | `episodeEvent` levert de Engelse titel en beschrijving uit §4.2; All-day ongewijzigd van vorm; Fixed time geeft `dateTime` + `timeZone` en einde op runtime of 60 min; de hash verandert bij locatie- en tijdzonewijziging | unit-tests op builder en hash |
| A4 | Na uitrol stuurt de eerste sync per gebruiker alleen PATCHes voor afspraken in het venster (lokale datum − 7 dagen en later), nul inserts, nul deletes, geen duplicaten; afspraken daarbuiten blijven Nederlands en ongewijzigd | `tests/sync.test.ts`-variant met bestaande links; productie-syncresultaat van JP (`updated` ≤ aantal afleveringen in venster, `created` = 0) |
| A5 | Voorkeur: ongeldige tijd of `FIXED_TIME` zonder tijd geeft 400; wisselen naar Fixed time 20:00 herschrijft bij de volgende sync alle afspraken in het venster naar tijdgebonden; terugwisselen herstelt All-day; de hele-dag-/tijdgebonden-wissel verandert geen event-ID's | `tests/preferences.test.ts`, syncstest met voorkeurswissel |
| A6 | Proefitem volgt de voorkeur, bevat de TEST-titel en de voorbeeldlocatie; readback bevat `location`; een gewijzigd of verwijderd item geeft `EVENT_CHANGED`; opruimen verwijdert alleen het eigen proefitem | `tests/calendar-probe.test.ts` uitgebreid |
| A7 | Praktijkbewijs op JP's iPhone voor beide vormen: afspraak zichtbaar met titel, locatie, beschrijving; melding ontvangen en vastgelegd met tijd, app en of de locatie zichtbaar is | `docs/evidence/idea-241-stap-1.md` |
| A8 | Onaangemeld `/` toont de landingpagina uit §6 zonder privégegevens; `?error=` toont de neutrale melding; Sign in werkt; `/privacy` is Engels, publiek en gelinkt vanuit footer en consentscherm | smoke-test; handmatige controle |
| A9 | Consentscherm staat op In production met exact de vijf scopes; een niet-testaccount doorloopt het waarschuwingsscherm en koppelt een agenda; identiteitslogin toont geen waarschuwing | runbook §8 uitgevoerd; evidence |
| A10 | `npm test`, `npm run typecheck`, `npm run build`, `npm run test:http` en beide Docker-builds slagen in CI | CI-run op de PR |
| A11 | Geen tokens, secrets of uitnodigingstokens in logs, evidence of docs | bestaande smoke-controle; review |

## 11. Tests en controles die wijzigen

- Negen Dutch-assertions: `tests/series-list.test.ts:26-29`, `tests/credentials.test.ts:20-21`, `tests/shared-sync.test.ts:89`, `tests/sync.test.ts:130`, `tests/invitations.test.ts:53`.
- `"VERWIJDEREN"` → `"DELETE"` in `tests/privacy.test.ts` (9 aanroepen) en `scripts/smoke-http.mjs:136-139`.
- Smoke: paden `/volgen`, `/uitnodiging`, `/beheer/*` (regels 99-100, 155-168, 229-233), `aria-label` (231), linktekst "Lees verder op TVmaze" (224); nieuwe asserts voor redirects, `lang="en"`, landingpagina-inhoud en afwezigheid van privégegevens.
- `tests/simulated-calendar.ts` valideert geen `location`/`dateTime`; de nieuwe builder-tests controleren de verstuurde body rechtstreeks. Een expliciete assert dat de simulator `dateTime` + `timeZone` accepteert zonder `date` voorkomt stille regressie.
- Nieuwe tests: builder (All-day, Fixed time, runtime null, ontbrekende platform/afleveringstitel), hash (locatie, tijdzone), preferences-validatie, probe met beide vormen, redirects in smoke.

## 12. Bestanden

| Gebied | Bestanden |
| --- | --- |
| Afspraakmodel | `src/server/google-calendar.ts`, `src/server/sync.ts`, `src/server/services.ts`, `src/server/calendar-probe.ts`, `src/app/settings/trial-panel.tsx` |
| Voorkeur | `prisma/schema.prisma` + migratie, `src/server/preferences.ts`, `src/app/api/settings/preferences/route.ts`, `src/app/settings/preferences-panel.tsx` |
| Engels | alle bestanden uit de inventaris in §3.1; `src/lib/series-list.ts`; `src/server/errors.ts`; `src/server/privacy.ts` (DELETE) |
| Routes | `next.config.ts`; mappen `src/app/volgen` → `following`, `uitnodiging` → `invitation`, `beheer/*` → `admin/*`; `navigation.tsx`; `invitations.ts`; `invitation-entry.tsx`; `agenda-panel.tsx`; `admin-users-panel.tsx` |
| Landing en privacy | `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/manifest.ts`, `src/app/privacy/page.tsx` |
| Beheer en bewijs | `docs/runbooks/idea-241-production-consent.md` (nieuw), `docs/evidence/idea-241-stap-1.md` (nieuw), `deploy/README.md` (redirect-opruimnotitie), `README.md` (routes) |

## 13. Risico's

- **Google-notificatie toont de locatie niet.** Dan blijft de afspraak zelf de plek voor aanbieders; de melding toont titel en tijd. Geen ontwerpwijziging nodig, wel vastleggen (open vraag grill).
- **PATCH-golf na uitrol.** Begrensd door het venster; bij 25 series van JP hoogstens enkele tientallen PATCHes. Bij meer gebruikers loopt de cron ze sequentieel per gebruiker af zoals nu.
- **Oude `/uitnodiging`-links.** Afgedekt door de redirect plus fragmentbehoud; 72 uur geldigheid beperkt de blootstelling.
- **Consentscherm-scopes wijken af van de code.** Vóór publiceren controleren (§8 stap 2); anders blijft het waarschuwingsscherm ook na verificatie.
- **Grens van 100 nieuwe gebruikers.** Levenslang per project; de admin-gebruikerslijst is de teller. Bij nadering vóór verificatie: wachten met uitnodigen.

## 14. Onderbouwing

Codebasis `origin/main` `1554c6a`, gelezen op 8 oktober 2026 in een losse checkout: `src/server/sync.ts`, `google-calendar.ts`, `calendar-probe.ts`, `preferences.ts`, `services.ts`, `auth.ts`, `google-connection.ts`, `privacy.ts`, `errors.ts`, `src/app/page.tsx`, `layout.tsx`, `privacy/page.tsx`, `navigation.tsx`, `uitnodiging/*`, `next.config.ts`, `tests/*`, `scripts/smoke-http.mjs`, `deploy/README.md`, `docs/praktijkproef.md`. Google: [Calendar-scopes](https://developers.google.com/workspace/calendar/api/auth), [Events-velden](https://developers.google.com/workspace/calendar/api/v3/reference/events), [verificatie](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification), [app-audience en publicatiestatus](https://support.google.com/cloud/answer/15549945), [onverifieerde apps](https://support.google.com/cloud/answer/7454865). Scrum4Me: `grills/idea-241-verkenning` rev. 3, `specs/idea-219-specificatie`, tijdlijn IDEA-241 (besluiten 1-14 en het besluit van 8 oktober over §2).

## Review record

Review-loop volgens `~/.claude/skills/review-loop` (fase spec, maximaal 10 rondes, twee dispatch-jobs: codex en claude). In opdracht van JP, 8 oktober 2026.

| Ronde | Status |
| --- | --- |
| 1 | gestart 8 oktober 2026; details volgen hieronder zodra de jobs zijn ingediend |

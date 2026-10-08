---
title: "IDEA-241 — Specificatie stap 1: Engels, afspraakmodel, landing, privacy en proefevent"
status: draft
version: "0.5"
date: "2026-10-08"
idea: IDEA-241
source_commit: 1554c6a
last_updated: 2026-10-08
---

# IDEA-241 — Specificatie stap 1

**Product:** When2Watch (`cmud1npa000rykh7rlhlhojd3`). **Idee:** IDEA-241 (`cmuy9t8sp009ho07rcdqym802`). **Bron:** [grills/idea-241-verkenning](../grills/IDEA-241-verkenning.md) revisie 3, besluiten 1 t/m 14 van 8 oktober 2026, plus JP's besluit van 8 oktober over de twee afwijkingen in §2. **Codebasis:** `origin/main` op `1554c6a` (IDEA-219 R2 in productie sinds 26 september 2026). Dit is een ontwerp ter beoordeling, geen uitvoeringsplan en geen uitvoeringsopdracht.

Versie 0.2 verwerkt JP's akkoord op de twee afwijkingen uit versie 0.1 en voegt het Review record toe. Versie 0.3 verwerkt ronde 1 van de review-loop (codex en claude, beide NO-GO): canonieke vergelijking van tijdgebonden afspraken, expliciete PATCH-contracten bij vormwissel, datumadministratie voor tijdgebonden items, dezelfde builder-invoer in het overzicht, een correcte beschrijving van de syncregel, en de aangescherpte voorwaarden voor publicatie. Versie 0.4 verwerkt ronde 2 (codex NO-GO met één MAJOR, claude GO met negen MINOR): expliciete offsets en een DST-beleid voor tijdgebonden afspraken, één gedeelde instellingenlader, de proefcontrole op inhoud, builder-consumenten buiten `src/`, en tekstcorrecties. Versie 0.5 verwerkt ronde 3 (codex NO-GO met één MAJOR, claude GO met acht MINOR): datum-only waarden blijven in UTC opgemaakt, tijdzone-validatie op IANA-namen, DST-gatregel en canonieke vorm aangescherpt, privacytekst over de agendalijst, factory-invoer en overzichtsaanroepen benoemd, en `readback.ts` wordt aangepast in plaats van verwijderd.

## 1. Doel en eerste bruikbare resultaat

JP wil When2Watch als officieel product bij Google registreren en een gratis, Engelstalige app aanbieden waarmee genodigden zonder testgebruikerslijst hun Google-agenda koppelen. Stap 1 levert daarvoor de voorwaarden: een volledig Engelstalige app, een Engels afspraakmodel met locatieveld en keuze voor een vast tijdstip, een openbare landingpagina, een Engels privacybeleid en de omschakeling van het OAuth-consentscherm naar Production.

**Eerste bruikbare resultaat:** één `[W2W TEST]`-proefevent met locatie en vast tijdstip in JP's eigen app-agenda, met een op de iPhone vastgelegde melding, gevolgd door een eerste genodigde die via het Google-waarschuwingsscherm zijn agenda koppelt zonder op een testgebruikerslijst te staan.

**Niet-doelen van stap 1:** TMDB/JustWatch-aanbieders en de regiokeuze (stap 3), de nieuwe navigatie met Search en Running/Ended (stap 4), de `/welcome`-reeks (stap 5), het indienen van de Google-verificatie (stap 2, wordt hier wel voorbereid), Vercel/Neon, VAPID.

**Voorwaarde (stap 0):** JP's eigen binding is sinds de R2-omschakeling `LEGACY_UNVERIFIED` met gepauzeerde sync. Vóór stap 1 wordt uitgerold moet JP opnieuw inloggen, een `APP_CREATED`-agenda aanmaken, een eerste sync draaien en een melding ontvangen hebben. Zonder dat bewijs is de Production-switch (§8) niet toegestaan.

## 2. Besluiten op de grill (JP, 8 oktober 2026)

JP heeft op 8 oktober 2026 beide onderstaande afwijkingen van de grill goedgekeurd; ze gelden als besluit voor deze specificatie.

| Besluit | Invulling | Reden |
| --- | --- | --- |
| 6 (bevriezen vóór vandaag) | **De bestaande syncregel met het venster van 7 dagen blijft ongewijzigd.** Per aflevering komt reconciliatie alleen in aanmerking als één van deze signalen binnen het venster (lokale datum min 7 dagen en later) valt: de huidige afleveringsdatum, de datum vóór de catalogusverversing, de opgeslagen `lastDate` van de koppeling, de datum van een gevonden eigen agenda-item, of een nog openstaande koppelstatus (`src/server/sync.ts:131-133`, `:209-212`). Een afspraak wordt alleen nieuw aangemaakt als de afleveringsdatum zelf in het venster ligt, behalve bij herstel van een openstaande koppeling (`prepared`/`updating`/`deleting`, `:24`, `:233`); een bestaand item kan wel naar een datum vóór het venster worden gecorrigeerd (`tests/sync.test.ts:137-145`). Dezelfde regel geldt voor de vormwissel uit besluit 7 ("wisselen herschrijft alleen afspraken vanaf vandaag"): ook die volgt het venster, onder dezelfde goedkeuring van JP. Buiten die regel wordt per aflevering niets aangeraakt. Ontvolgen is een aparte route en verwijdert alle eigen items van de serie zonder datumfilter (`sync.ts:84-92`, `:112-124`); dat is bestaand R2-gedrag en wijkt af van de grill-tekst "eerdere afspraken blijven staan". Dat punt is geen stap-1-werk en staat als open vraag in §15. Er komt geen aparte "vanaf vandaag"-regel. | De grill ging uit van "alle gedateerde afleveringen worden geschreven"; dat klopte niet (R2-omschakeling: 28 links op 834 afleveringen). Het venster begrenst het PATCH-volume al tot hoogstens één week verleden plus toekomst, is getest (`tests/sync.test.ts:180-187`) en vangt datumverschuivingen binnen een week op. Een extra regel voegt complexiteit toe zonder faalpad. |
| 10/11 (TMDB-vermelding) | De TMDB-notice en de JustWatch-vermelding op landingpagina en privacypagina komen pas in stap 3, wanneer die data werkelijk wordt gebruikt. Stap 1 vermeldt alleen TVmaze. | Een bronvermelding voor een bron die nog niet wordt gebruikt is onjuist in een privacybeleid. De pagina's krijgen in stap 1 wel een vaste plek (bronnenblok) waar stap 3 de regels toevoegt. |

Aanvullingen binnen de besluiten:

| Besluit | Aanvulling | Reden |
| --- | --- | --- |
| 6 (link naar seriepagina) | De link in de beschrijving wijst naar `/following#show-<tvmazeId>`. De rij op Following krijgt dat anker nu al. | Een seriepagina bestaat niet; het anker is stabiel over stap 4 heen, zodat de beschrijving later niet opnieuw hoeft te worden gepatcht. |
| 9 (navigatie) | Stap 1 vertaalt alleen de bestaande navigatie: Agenda · Following · Settings, plus Users · Stats voor de admin. Search en Running/Ended volgen in stap 4. | Scope van stap 1. |
| 12 (regio) | Geen landkolom in stap 1. | Niet nodig zonder aanbieders; toevoegen in stap 3 is één expand-migratie. |

## 3. Engelse omschakeling (besluit 10)

### 3.1 Omvang

Alle gebruikersgerichte tekst wordt Engels, in één release, zonder i18n-laag. De inventaris op `1554c6a`: ongeveer 325 UI-strings in 20 bestanden onder `src/app/`, 113 `AppError`-aanroepen in 28 bestanden onder `src/server/` en `src/app/api/` plus de foutcodekaart in `google-calendar.ts:38-45`, de 500-fallback in `src/server/errors.ts:14`, de syncfouttekst `sync.ts:17`, de catalogusfallback `catalog.ts:7`, en de labels in `src/lib/series-list.ts:4-6`.

Taal- en opmaakregels:

| Onderdeel | Nu | Wordt |
| --- | --- | --- |
| `src/app/layout.tsx:15` | `lang="nl"`, footer "Persoonlijke serieagenda" | `lang="en"`, footer "When2Watch · Your series, in your calendar · Privacy" |
| `src/app/layout.tsx:5`, `manifest.ts:5-6` | description "Je series, in je agenda.", `lang: "nl"` | "Your series, in your calendar.", `lang: "en"` |
| Datum-only waarden: afleveringsdatums en dagkoppen (`agenda-panel.tsx:4`, `series-panel.tsx:12`) | `nl-NL`, opgemaakt in UTC uit de synthetische middagwaarde `{date}T12:00:00Z` | alleen de locale wordt `en-GB`; de UTC-opmaak van de synthetische waarde **blijft**, want een kalenderdatum in de gebruikerszone opmaken verschuift hem (voor `Pacific/Auckland` wordt 9 oktober 10 oktober) |
| Tijdstippen: laatste poging/succes (`series-panel.tsx:11`), adminpagina (`beheer/series/page.tsx:22`) | `nl-NL` | `en-GB`, 24-uurs (`hourCycle: "h23"`), tijdzone van de gebruiker; adminpagina `Europe/Amsterdam` blijft |
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

Aan te passen verwijzingen: `navigation.tsx:3,7`, `agenda-panel.tsx:17-18` (`/volgen`) en `:14` (`#voorkeuren` → `#preferences`, gedefinieerd in `preferences-panel.tsx:21`), `invitation-entry.tsx:12` (`replaceState` naar `/invitation`; de `callbackUrl` op `:21` blijft `/settings`), `invitations.ts:30` (uitgegeven link wordt `/invitation#token=…`), `calendar-panel.tsx:38` (`#agenda-keuze` → `#calendar`), en de paginamappen zelf. `admin-users-panel.tsx` toont de link uit de API en wijzigt alleen van taal. De redirects worden in de spec van stap 4 of na 30 dagen verwijderd; dat staat in de uitrolnotitie.

### 3.3 Google-afspraaktekst

Zie §4. De tekst van afspraken die buiten het syncvenster vallen blijft Nederlands (besluit 6, §2).

### 3.4 Kleine correcties in dezelfde bestanden

- `admin-users-panel.tsx:15` leest `data.error?.message`, terwijl `errorResponse` (`errors.ts:10`) `error` als string teruggeeft; daardoor ziet de admin altijd de fallback. Wordt `data.error`.
- De `?error=`-melding op `/` (`page.tsx:33`) noemt "de eigenaar van deze installatie"; wordt neutraal: "Sign-in failed. Use the Google account you were invited with, then try again."

### 3.5 Buiten scope van de vertaling

`README.md`, `AGENTS.md`, `deploy/README.md`, `docs/**` en de `scripts/prove-*.ts` blijven Nederlands; dat zijn beheerdersdocumenten van JP. `public/icons/when2watch-scherm*.svg` hebben een Nederlandse `<title>` maar worden nergens gebruikt; ongewijzigd.

## 4. Afspraakmodel (besluiten 6 en 7)

### 4.1 Velden

`CalendarEvent` (`src/server/google-calendar.ts:7-18`) krijgt `location?: string | null` en `timeZone?: string | null` op `start` en `end`; `date` en `dateTime` worden `string | null` zodat een PATCH een veld expliciet kan wissen. `safeEvent` (`:153-159`) neemt `location` mee in de proefreadback.

**Tijdstip met expliciete offset.** Een offsetloze wandkloktijd is niet altijd één tijdstip: op de dag van de herfstovergang bestaat 02:30 in `Europe/Amsterdam` twee keer, op de dag van de lenteovergang helemaal niet. Google kiest dan zelf een interpretatie en die hoeft niet gelijk te zijn aan die van de app. Daarom lost de app de wandkloktijd zelf op tot één tijdstip, met vast beleid: bij een overlap de eerste voorkomende (de zomertijd-offset), bij een gat schuift de wandkloktijd op met de lengte van het gat (02:30 op 29 maart 2026 wordt 03:30 `+02:00`). Het begin wordt als RFC 3339 mét de zo bepaalde offset verstuurd (`2026-10-25T02:30:00+02:00`) samen met `timeZone`; het einde is dat tijdstip plus de duur in minuten (`runtimeMinutes`, anders 60), eveneens met offset. Google ontvangt daarmee hetzelfde tijdstip als de app hasht.

**Canonieke vergelijking.** Google geeft `dateTime` in antwoorden als RFC 3339 met offset terug, standaard in de tijdzone van de agenda, die kan afwijken van de `timeZone` van de afspraak; een letterlijke stringvergelijking is dus onbetrouwbaar. `calendarEventHash` (`sync.ts:18-23`) wordt daarom gedefinieerd over een canonieke vorm `canonicalEvent(event)`: `date` ongewijzigd; `dateTime` omgezet naar het tijdstip in UTC (ISO-string) met daarnaast de `timeZone`; `location ?? ""`; `null`-waarden gelden als afwezig; `timeZone` hoort alleen samen met `dateTime` bij de canonieke vorm en wordt bij een `date`-afspraak genegeerd, zodat een eventueel door Google meegegeven `timeZone` op een hele-dagafspraak de terugwissel niet breekt. Overeenkomst betekent: gelijk tijdstip én gelijke `timeZone`; gelijk tijdstip met een andere `timeZone` is ongelijk. Deze hash wordt gebruikt bij de bevestiging na schrijven (`sync.ts:199`), de ongewijzigd-controle (`:250`), de adoptie van openstaande koppelingen (`:251`) en de proefcontrole (§5). `confirmedRemoteHash` blijft de hash van de canonieke readback, zoals nu bij de door Google aangevulde reminders (`:197-198`).

**Tijdzone-identifier.** De voorkeur `timeZone` wordt bij opslaan genormaliseerd met `Intl.DateTimeFormat(undefined, { timeZone }).resolvedOptions().timeZone`, zodat hoofdletterverschillen (`europe/amsterdam`) niet tot een ongelijke `timeZone` in de hash leiden; aliassen zoals `Asia/Calcutta` blijven zoals ingevoerd en worden consequent zo gebruikt. Omdat `timeZone` met Fixed time naar Google gaat, dat een IANA-naam vereist, weigert `savePreferences` waarden die geen IANA-naam zijn, zoals offsetvormen (`+02:00`, `-05:00`) en `UTC±…`; `Intl` accepteert die nu wel (`preferences.ts:9-12`, vrij tekstveld in `preferences-panel.tsx:28`).

**Datumadministratie.** Een helper `eventDate(event)` levert de lokale datum van een afspraak: `start.date`, anders de kalenderdatum van het tijdstip `start.dateTime` berekend met `Intl` in de `timeZone` van de afspraak (niet met `slice(0,10)`, want de readback staat in de agendazone). `lastDate` wordt bij bevestiging gezet op de afleveringsdatum van de gewenste afspraak (voor beide vormen; nu `desired.start.date` op `:203`, dat bij tijdgebonden items leeg zou blijven), bij adoptie van een gevonden item op `eventDate(event)` (`:218`), en de venstercontrole op gevonden items gebruikt `eventDate` (`:212`). Zonder dit zouden tijdgebonden items na een datumverschuiving buiten het venster kunnen blijven staan terwijl TVmaze de datum intrekt.

### 4.2 Opbouw

`episodeEvent` (`sync.ts:26-32`) krijgt als invoer de serie (`title`, `tvmazeId`, `platform`, `country`, `runtimeMinutes`), de aflevering, de gebruikersvoorkeuren (`eventMode`, `eventTime`, `timeZone`), de app-origin en een lijst regionale aanbieders met landnaam (in stap 1 altijd leeg).

| Veld | Inhoud |
| --- | --- |
| `summary` | `{title} · S{ss}E{ee} · {episodeTitle}`; zonder seizoen/nummer `{title} · {episodeTitle}`; zonder afleveringstitel vervalt dat deel |
| `location` | `{Country}: {provider}, {provider}` wanneer de lijst niet leeg is; anders wordt het veld **weggelaten** (stap 1: altijd weggelaten) |
| `description` | Regel 1: `Originally on {platform} ({country}).`, of `Original broadcaster not known.` als `platform` ontbreekt (land weglaten als onbekend). Regel 2: `Original release date according to TVmaze.` Regel 3: `Episode: {episode.sourceUrl}`. Regel 4: `When2Watch: {origin}/following#show-{tvmazeId}`. Regel 5: `Source: TVmaze (CC BY-SA).` Regel 6 (alleen met locatie, dus pas stap 3): `Watch availability: JustWatch via TMDB.` |
| `start`/`end` bij All-day | ongewijzigd: `{ date: airdate }` / `{ date: airdate + 1 }` |
| `start`/`end` bij Fixed time | `{ dateTime: "{airdate}T{HH:MM}:00{±hh:mm}", timeZone }` met de offset die de app volgens §4.1 bepaalt; einde = begintijdstip plus `runtimeMinutes`, anders 60 minuten, met de offset van dat tijdstip |
| `transparency` | `transparent` |
| `reminders` | `{ useDefault: true }` |
| `extendedProperties.private` | ongewijzigde markers |

Google accepteert `dateTime` met offset naast `timeZone`. Reminders volgen de agenda-standaard; Google Agenda heeft aparte standaardherinneringen voor hele-dag- en tijdgebonden afspraken, en de gebruiker stelt beide zelf in.

**Schrijfcontract.** `events.patch` voegt geneste velden samen met wat Google al heeft opgeslagen; alleen een expliciete `null` wist een veld. Een vormwissel via PATCH moet daarom de andere vorm expliciet wissen: bij Fixed time `start: { date: null, dateTime, timeZone }` (idem `end`), bij All-day `start: { date, dateTime: null, timeZone: null }`. De PATCH-body (`google-calendar.ts:140-144`) bevat daarom in `start` en `end` altijd de drie sleutels `date`, `dateTime` en `timeZone`, met `null` voor de ongebruikte vorm; `location` wordt bij een lege aanbiederslijst als `null` meegestuurd zodat een eerder gezette locatie verdwijnt (relevant vanaf stap 3). Een insert-body laat `null`-velden weg. De canonieke hash negeert `null`-velden, zodat de gewenste afspraak en de readback gelijk blijven.

### 4.3 Bestaande koppelingen na uitrol

`confirmedDesiredHash` (`sync.ts:250`) wijkt na uitrol af voor iedere gekoppelde aflevering die volgens de regel in §2 in aanmerking komt, dus de eerstvolgende sync per gebruiker (handmatig of cron 06:05) stuurt voor die afspraken één PATCH met de Engelse tekst. Afspraken buiten de regel blijven Nederlands en ongewijzigd. Daarnaast doet dezelfde run het gewone reconciliatiewerk dat toevallig samenvalt: een aflevering die nieuw in het venster komt wordt aangemaakt, een ingetrokken datum verwijderd. De vertaal-PATCHes zijn dus geen garantie op "nul inserts en nul deletes"; A4 toetst dat op een vaste, volledig bevestigde set koppelingen zonder bronwijziging, en de productierun rapporteert `updated` apart van `created`/`deleted` met uitleg. Er worden geen nieuwe event-ID's aangemaakt voor bestaande koppelingen en geen duplicaten. `overview.ts:31` toont die items tot de bevestiging als niet-gekoppeld (zie §4.5).

Het `?`-teken in `string | null` voor `date`/`dateTime` verandert niets aan bestaande `desiredJson`-rijen; die blijven leesbaar.

### 4.4 Voorkeur

`UserPreferences` (`prisma/schema.prisma:58-63`) krijgt `eventMode` (enum `ALL_DAY` | `FIXED_TIME`, standaard `ALL_DAY`) en `eventTime` (`String?`, `HH:MM`, verplicht bij `FIXED_TIME`; bij `ALL_DAY` nullable en bewaard als onthouden standaard). Expand-only migratie; bestaande rijen blijven All-day.

`savePreferences` (`preferences.ts:19-31`) accepteert de twee nieuwe sleutels en valideert op de samengevoegde toestand (opgeslagen waarden plus patch), omdat het paneel en de smoke-test deelpatches sturen (`smoke-http.mjs:111`): `eventTime` matcht `^([01]\d|2[0-3]):[0-5]\d$`; de samengevoegde toestand `FIXED_TIME` zonder `eventTime` is `INVALID_INPUT`; `eventTime` mag ook bij `ALL_DAY` worden gezet en blijft bij terugwisselen naar `ALL_DAY` bewaard als onthouden standaard; `timeZone` wordt genormaliseerd en op IANA-naam gecontroleerd zoals in §4.1 (`+02:00` geeft `INVALID_INPUT`, A5). `currentSettings` (`services.ts:24-27`) geeft de voorkeuren door aan de sync. Het voorkeurenpaneel toont "Event style" als keuzerondjes All-day / Fixed time met een tijdveld (standaard 20:00) en de hulptekst "Applies to upcoming episodes at the next sync. Reminders follow your Google Calendar settings." Opslaan start geen sync; de bestaande knop Sync now op Following of de dagelijkse run past het toe (binnen de regel van §2).

De eigen-gegevensexport (`privacy.ts:19`) neemt `eventMode` en `eventTime` op naast `agendaMonths` en `timeZone`; de bestaande exporttest (`tests/privacy.test.ts:65`) wordt daarop uitgebreid.

### 4.5 Overzicht en Agenda

`overview.ts:31` berekent zelf de gewenste afspraak (`episodeEvent(userId,s,e,l.eventId)`) om `linked` te bepalen; Agenda gebruikt dezelfde vlag. Omdat de builder nu voorkeuren, origin en aanbieders nodig heeft, komt er één gedeelde factory `desiredEpisodeEvent(settings, show, episode, eventId)`. De `settings` komen uit één nieuwe, geëxporteerde lader `loadSyncSettings(userId, db)` in een neutrale module (bijvoorbeeld `src/server/sync-settings.ts`): actieve binding (`calendarId`), genormaliseerde `timeZone`, `eventMode`, `eventTime`. De huidige `currentSettings` (`services.ts:23-27`) is niet geëxporteerd, documenteert "alleen binnen het mutatielock" en gebruikt de globale `database()`; die wordt door de lader vervangen. De app-origin komt niet uit de lader maar wordt op de servicegrens meegegeven (uit `config().origin` in `services.ts`; tests geven een vaste origin mee, zodat `NEXTAUTH_URL` in Vitest niet nodig is). De `settings` van de factory zijn de laderuitvoer plus `{ userId, origin }`: `userId` voor de markers (`sync.ts:16,31`), `origin` voor regel 4 van de beschrijving. Sync, proef en overzicht gebruiken dezelfde lader met de geïnjecteerde `db` en dezelfde origin, nooit standaardwaarden; het overzicht leest buiten het lock omdat het alleen toont. De overzichtsaanroepen die de origin meegeven zijn `src/app/api/shows/route.ts`, de Following-pagina (nu `src/app/volgen/page.tsx`) en `agendaOverview` in `src/server/agenda.ts` (aangeroepen vanuit `src/app/page.tsx`). Test: na een geslaagde Fixed-time-sync is `linked` waar; na een voorkeurswissel onwaar tot de volgende bevestigde sync; daarna weer waar.

## 5. Proefevent (besluit 14, eerste praktijkbewijs)

`calendar-probe.ts:46-54` bouwt het proefitem voortaan met de factory van §4.2 voor `summary`, `location`, `start` en `end` (vaste fictieve invoer hieronder), en vervangt `description` en `extendedProperties.private` door de proefwaarden:

| Veld | Inhoud |
| --- | --- |
| `summary` | `[W2W TEST] Example Show · S01E01 · Example episode` |
| `location` | `Netherlands: Example service A, Example service B` (altijd gevuld, ook in stap 1, om de zichtbaarheid van het veld te beproeven) |
| `description` | `Notification test only — not a real episode.` gevolgd door `Originally on Example broadcaster.`, de uitleg dat de datum geen echte release is, `When2Watch: {origin}/following` en `Source: TVmaze (CC BY-SA).` |
| Vorm | de actuele voorkeur van de gebruiker (All-day of Fixed time met de ingestelde tijd, duur 60 minuten) |
| Markers | ongewijzigd `kind: "probe"` |

`POST /api/probe` houdt `{ date }` als invoer; de vorm volgt de voorkeur, zodat de proef precies toont wat echte afspraken zullen doen. De controle op `calendar-probe.ts:75-76` houdt de eigendomscontrole en vergelijkt daarnaast de canonieke vorm (§4.1) van `start`, `end`, `summary`, `location` en `description` van de readback met de opgeslagen `requestJson`, in plaats van alleen datums te vergelijken en `dateTime` te verbieden; reminders blijven buiten de vergelijking zoals nu. Het proefpaneel in Settings toont per proef de gebruikte vorm en de teruggelezen locatie. Opruimen (`removeLocked`) blijft gelijk. Proeven zijn uniek per gebruiker en datum (`Probe @@unique([userId, date])`, upsert zonder update op `:56-59`): een tweede proef vereist een andere datum. De proef schrijft alleen via insert; de PATCH-vormwissel (§4.2) wordt bewezen via echte afspraken onder A5.

**Proefprocedure** (JP, na uitrol van stap 1, met voorkeur Fixed time 20:00):

1. Settings: agenda bevestigen (`APP_CREATED`); is de Google-toegang verlopen (grants uit de Testing-fase vervallen na 7 dagen, `google-tokens.ts:42-43` → opnieuw verbinden), eerst opnieuw verbinden. Voorkeur op Fixed time 20:00 zetten.
2. Eén proefitem voor morgen aanmaken; readback controleren op titel, locatie, `dateTime` (met offset) en `timeZone`.
3. Op de iPhone in de gebruikte agenda-app(s) (Apple Agenda en/of Google Agenda) de afspraak openen: titel, locatie, beschrijving en link vastleggen.
4. De melding afwachten die de agenda-app voor tijdgebonden afspraken geeft; vastleggen: app, feitelijke ontvangsttijd, zichtbare titel, of de **locatie** zichtbaar is, afkapping.
5. Voorkeur terug op All-day, tweede proefitem op een **andere** datum (overmorgen), zelfde waarneming voor de hele-dagvorm.
6. Daarna, op echte afspraken: voorkeur op Fixed time, Sync now, syncresultaat en de readback van één afspraak vastleggen (`dateTime` met offset, `date` afwezig); terug naar All-day, Sync now, idem (`date` aanwezig, `dateTime` afwezig). Dit is het bewijs voor het schrijfcontract van §4.2.
7. Beide proefitems opruimen via het paneel en de uitkomst controleren.

Bewijs komt in `docs/evidence/idea-241-stap-1.md` (schermbeschrijving, geen tokens). Of de locatie in de melding zichtbaar is, is een open vraag uit de grill; het antwoord bepaalt of de aanbieders in stap 3 alleen in de afspraak of ook in de melding terechtkomen.

## 6. Landingpagina (besluit 11)

De onaangemelde tak van `src/app/page.tsx:22-38` wordt vervangen door een Engelse landingpagina met bestaande klassen (`hero`, `card`, `steps-summary`, `notice`):

1. Header met merk en tag "Your series, in your calendar".
2. Hero: "A new episode. A timely reminder." met intro: When2Watch puts the original release date of every episode you follow into a Google Calendar of its own, so your phone reminds you the way you already set it up.
3. Drie stappen: Follow a series · It lands in your Google Calendar · See where to watch (de derde stap verwijst vooruit naar stap 3; tekst "Where to watch is coming soon" tot stap 3 live is).
4. Kaart "Access is by invitation for now": "When2Watch is free and currently invite-only. Have an invitation? Open the link you received." plus de knop Sign in with Google voor bestaande accounts, en de bestaande `oauthReady()`-melding in het Engels. Geen wachtlijst, geen formulier.
5. Bronnenblok: "Episode data: TVmaze (CC BY-SA)" met link; vaste plek voor de TMDB/JustWatch-regels van stap 3.
6. Footer (layout): Privacy en contact (`W2W_PRIVACY_CONTACT`, alleen tonen als gezet).

Metadata: `/` (onaangemeld) en `/privacy` krijgen `robots: index, follow`; alle ingelogde pagina's houden `noindex` uit de layout. Zonder sessie bereikbare **pagina's** zijn alleen `/`, `/privacy` en `/invitation`; daarnaast de statische bestanden (`/manifest.webmanifest`, `/icons/*`, `/images/*`) en de API-uitzonderingen `/api/health`, `/api/auth/*`, `POST /api/invitations/exchange` (same-origin en rate-limited) en `/api/cron/sync` (bearer-secret). Dat is nu al zo en wordt zo in de smoke-test vastgehouden.

De ingelogde tak van `/` (Agenda) verandert alleen van taal.

## 7. Privacybeleid (besluit 10)

`src/app/privacy/page.tsx` wordt in het Engels herschreven, zelfde structuur, met de eisen van Google voor een privacybeleid bij sensitive scopes: welke Google-gegevens de app opvraagt, waarvoor, hoe ze worden opgeslagen en met wie ze worden gedeeld.

| Sectie | Inhoud |
| --- | --- |
| Purpose | Original release dates of followed series as events in a calendar created by When2Watch in your Google account; access by invitation only. |
| Operator and contact | `W2W_PRIVACY_CONTROLLER` · `W2W_PRIVACY_CONTACT`, fallback "The operator's details are filled in when this installation is set up." |
| Google data we use | Name and e-mail for sign-in; with your separate consent, read access to your calendar list (`calendar.calendarlist.readonly`), used to confirm the connection (`google-connection.ts:124`), to check for a name clash (`calendar-settings.ts:48,131`) and to read the name, time zone, access level and default reminders of the When2Watch calendar, which are stored (`calendar-bindings.ts:22-24`); other calendar-list entries are not stored; full access only to calendars When2Watch created (`calendar.app.created`); tokens stored encrypted on the server; When2Watch never reads or changes events in any other calendar; no Google data is shared with third parties. |
| Other data | Followed/tried series, preferences (time zone, agenda range, event style), the events When2Watch placed in its calendar. Series data from TVmaze, shared between users; admin sees follower counts, not who. |
| Retention | Bestaande termijnen uit `retention.ts:7`, zoekcache 1 uur/10 minuten, back-ups 30 dagen. |
| Your rights | Export en verwijdering via Settings (`/settings#privacy`), bevestiging met DELETE; agenda-items blijven in Google; een verwijderd account keert na een back-upherstel niet terug. |
| Hosting | Eigen server van de operator; de operator kan technisch bij de database. |
| Google API Services User Data Policy | Zin dat het gebruik van Google-gegevens voldoet aan de Google API Services User Data Policy inclusief de Limited Use-eisen (vereist voor verificatie). |

Stap 3 voegt TMDB/JustWatch en de landvoorkeur toe. De pagina blijft zonder sessie bereikbaar en wordt in het consentscherm als privacy-URL ingevuld (§8).

## 8. OAuth-consent naar Production (besluit 2, stap 1 van de verificatieroute)

Dit is beheerderswerk van JP in de Google Cloud Console (project `when2watch-509517`), vastgelegd in een nieuwe runbook `docs/runbooks/idea-241-production-consent.md`. Volgorde:

1. **Voorwaarden:** stap 0 bewezen; stap 1 uitgerold op max2; `/` en `/privacy` Engels en publiek bereikbaar met `W2W_PRIVACY_CONTROLLER` en `W2W_PRIVACY_CONTACT` gezet en zichtbaar; **het praktijkbewijs van §5 vastgelegd** (Fixed-time-proefitem met readback, ontvangen iPhone-melding, en de vormwissel op echte afspraken uit §5 stap 6). Zonder dat bewijs geen publicatie en geen eerste genodigde.
2. **Scopes op het consentscherm** gelijk aan de code: `openid`, `email`, `profile`, `calendar.calendarlist.readonly`, `calendar.app.created`. `calendar.events` (nog genoemd in `docs/praktijkproef.md:128`) verwijderen als het er staat. Een verschil tussen gedeclareerde en gevraagde scopes geeft ook ná verificatie het waarschuwingsscherm.
3. **Branding:** app name "When2Watch", support e-mail, homepage `https://when2watch.jp-visser.nl`, privacy `https://when2watch.jp-visser.nl/privacy`, authorized domain `jp-visser.nl`. Logo pas uploaden bij de verificatie (stap 2): zonder verificatie toont Google alleen het domein.
4. **Audience → Publish app.** Status wordt In production; de testgebruikerslijst is niet meer bepalend. Google toont bij sensitive scopes de melding dat verificatie nodig is; publiceren kan toch.
5. **JP verbindt zijn agenda opnieuw** na publicatie: de grant uit de Testing-fase vervalt na 7 dagen; een nieuwe grant onder Production niet.
6. **Controle met een niet-testaccount** (tweede Google-account van JP of de eerste genodigde): uitnodiging accepteren, identiteitslogin zonder waarschuwing, agendatoestemming mét "Google hasn't verified this app" → Advanced → Go to When2Watch, agenda aanmaken, eerste sync. Vastleggen in `docs/evidence/idea-241-stap-1.md`.
7. **Uitnodigingstekst** voor JP's mail bevat een vaste alinea die het waarschuwingsscherm aankondigt en uitlegt hoe door te klikken; die wordt vóór de eerste consentpoging verstuurd.
8. **Uitnodigingsbudget.** Google telt "100 new users in total" over de levensduur van het project en biedt daarvoor geen teller. De lokale gebruikerslijst is géén maat: verwijderde accounts verdwijnen eruit (`privacy.ts:100`) en een agenda-accountwissel autoriseert een extra Google-account zonder nieuwe gebruiker (`google-connection.ts:129`). De runbook houdt daarom een handmatig budget bij: iedere uitgegeven uitnodiging en iedere accountwissel telt als één; boven de 50 vóór verificatie wordt niet meer uitgenodigd.

Randvoorwaarden uit de Google-documentatie: de onverifieerde-app-grens is "100 new users in total" over de hele levensduur van het project en kan niet worden gereset; verificatie heft hem op. Het 7-dagen-tokenverval geldt voor grants die in Testing zijn verleend; de app vangt een verlopen grant op met `needsReauth` en een herverbindknop. Verificatie zelf (brand plus sensitive scope: demo-video, scope-motivatie, Search Console) is stap 2 en valt buiten deze spec; de homepage- en privacy-eisen worden hier al vervuld.

## 9. Gegevensmodel en migratie

| Wijziging | Soort |
| --- | --- |
| `UserPreferences.eventMode` enum `EventMode { ALL_DAY, FIXED_TIME }` default `ALL_DAY` | expand |
| `UserPreferences.eventTime String?` | expand |
| `Probe.requestJson` bevat voortaan `location` en eventueel `dateTime`/`timeZone` | geen schemawijziging |
| `CalendarEventLink.desiredJson` idem | geen schemawijziging |

Geen contract- of destroy-fase. Uitrol volgens `deploy/README.md` (release bouwen, `pg_dump`, migratie als aparte stap, nieuwe web-container, health, `current` omzetten). Rollback: vorige release starten; de nieuwe kolommen zijn onschadelijk voor de oude code. Let op: de oude builder schrijft alleen `{date}` en de oude proefcontrole weigert `dateTime`; een rollback is daarom alleen schoon zolang niemand Fixed time heeft gekozen, of nadat iedereen is teruggezet en gesynchroniseerd. Daarna geldt forward-fix.

## 10. Acceptatie

| ID | Waarneembare acceptatie | Bewijs |
| --- | --- | --- |
| A1 | Geen Nederlandse tekst meer in `src/`: een hoofdletterongevoelige woordgrens-grep over gebruikersgerichte tekst (JSX-tekst, labels, placeholders, `aria-*`, `AppError`-meldingen en andere berichtstrings; niet over importpaden, `className`/`id`/`htmlFor`-tokens, wire-waarden of andere technische literals) op de lijst (`instellingen`, `volgen`, `proberen`, `melding`, `opnieuw`, `bevestig`, `verwijder`, `uitnodiging`, `beheer`, `gegevens`, `probeer`, `niet`, `geen`, `je`, `jouw`, `het`, `een`, `kies`, `aflevering`, `serie`, `klaar`) geeft nul treffers; `agenda` staat niet op de lijst omdat het ook de Engelse productterm is (navigatielabel, "agenda range"); daarnaast een handmatige doorloop van alle pagina's (ingelogd, admin, onaangemeld, uitnodiging, privacy) vastgelegd in de evidence; `lang="en"`, manifest `en`, datums `en-GB` 24-uurs | grep-script in de testsuite (regressiecontrole, geen volledig bewijs); handmatige doorloop; smoke-assert op `lang="en"` en `aria-label="Main navigation"` |
| A2 | `/following`, `/invitation`, `/admin/users`, `/admin/series` werken; oude paden geven 307 naar het nieuwe pad; `/invitation#token=…` uit een oude `/uitnodiging`-link werkt in Safari op iPhone en in desktop-Chrome | smoke-test (nieuwe en oude paden); handmatige fragmentproef |
| A3 | De factory levert de Engelse titel en beschrijving uit §4.2; All-day ongewijzigd van vorm; Fixed time geeft `dateTime` + `timeZone` en einde op runtime of 60 min; de canonieke hash verandert bij locatie- en tijdzonewijziging, is gelijk voor `2026-10-09T20:00:00+02:00` + `Europe/Amsterdam` en `2026-10-09T18:00:00Z` + `Europe/Amsterdam`, en ongelijk bij gelijk tijdstip met een andere `timeZone`; 02:30 op 25 oktober 2026 wordt `+02:00`, 02:30 op 29 maart 2026 wordt 03:30 `+02:00` | unit-tests op factory en hash, inclusief een test die faalt bij letterlijke vergelijking en een DST-dagtest voor begin en einde |
| A4 | Op een vaste, volledig bevestigde set bestaande koppelingen zonder bron- of identiteitswijziging stuurt de eerste sync na uitrol uitsluitend PATCHes voor de afspraken die volgens §2 in aanmerking komen, op dezelfde event-ID's, nul inserts en nul deletes; afspraken daarbuiten blijven Nederlands en ongewijzigd. In productie rapporteert JP's eerste run `updated`, `created` en `deleted` per serie; `created`/`deleted` ≠ 0 wordt verklaard uit gewone reconciliatie (nieuw in venster, ingetrokken datum) | `tests/sync.test.ts`-variant met bestaande links; productie-syncresultaat in de evidence |
| A5 | Voorkeur: ongeldige tijd of `FIXED_TIME` zonder tijd geeft 400; wisselen naar Fixed time 20:00 herschrijft bij de volgende sync de in aanmerking komende afspraken naar tijdgebonden met expliciete `date: null`; terugwisselen herstelt All-day met `dateTime: null, timeZone: null`; event-ID's blijven gelijk; de simulator past Google-merge-semantiek toe (genest samenvoegen, `null` wist) en geeft `dateTime` met offset terug, en een tweede sync doet nul schrijfacties; op max2 bevestigd met de readback uit §5 stap 6 | `tests/preferences.test.ts`; syncstest met voorkeurswissel die faalt zonder de `null`-velden; evidence |
| A6 | Proefitem volgt de voorkeur, bevat de TEST-titel en de voorbeeldlocatie; readback bevat `location` en bij Fixed time `dateTime` met offset, en wordt canoniek vergeleken; een gewijzigd of verwijderd item geeft `EVENT_CHANGED`; opruimen verwijdert alleen het eigen proefitem | `tests/calendar-probe.test.ts` uitgebreid, simulator geeft offset terug |
| A7 | Praktijkbewijs op JP's iPhone voor beide vormen: afspraak zichtbaar met titel, locatie, beschrijving; melding ontvangen en vastgelegd met tijd, app en of de locatie zichtbaar is | `docs/evidence/idea-241-stap-1.md` |
| A8 | Onaangemeld `/` toont de landingpagina uit §6 zonder privégegevens; `?error=` toont de neutrale melding; Sign in werkt; `/privacy` is Engels, publiek, gelinkt vanuit footer en consentscherm, en toont beheerder en contact (geen placeholder) | smoke-test (met `W2W_PRIVACY_CONTROLLER`/`W2W_PRIVACY_CONTACT` in de smoke-omgeving, `smoke-http.mjs:24-31`); handmatige controle |
| A9 | Consentscherm staat op In production met exact de vijf scopes, pas nadat het §5-bewijs is vastgelegd; JP heeft opnieuw verbonden; een niet-testaccount doorloopt het waarschuwingsscherm en koppelt een agenda; identiteitslogin toont geen waarschuwing | runbook §8 uitgevoerd; evidence |
| A10 | `npm test`, `npm run typecheck`, `npm run build`, `npm run test:http` en beide Docker-builds slagen in CI | CI-run op de PR |
| A11 | Geen tokens, secrets of uitnodigingstokens in logs, evidence of docs | bestaande smoke-controle; review |
| A12 | `overview`/Agenda tonen `linked` waar na een geslaagde Fixed-time-sync, onwaar na een voorkeurswissel tot de volgende bevestigde sync; de export bevat `eventMode` en `eventTime`; `lastDate` is na bevestiging van een tijdgebonden afspraak de afleveringsdatum en een ingetrokken datum verwijdert ook een eerder verschoven tijdgebonden item | tests op overzicht, export en datumadministratie |

## 11. Tests en controles die wijzigen

- Elf Dutch-assertions: `tests/series-list.test.ts:26-29`, `tests/credentials.test.ts:20-21`, `tests/shared-sync.test.ts:89`, `tests/sync.test.ts:129-130,143` (titelformaat en beschrijving), `tests/invitations.test.ts:53`.
- `"VERWIJDEREN"` → `"DELETE"` in `tests/privacy.test.ts` (9 aanroepen) en `scripts/smoke-http.mjs:136-139`.
- Smoke: paden `/volgen`, `/uitnodiging`, `/beheer/*` (regels 99-100, 155-168, 216, 221, 229-233), `aria-label` (231), linktekst "Lees verder op TVmaze" (224); nieuwe asserts voor redirects, `lang="en"`, landingpagina-inhoud, beheerder/contact op `/privacy` en afwezigheid van privégegevens.
- Beide simulatoren (`tests/simulated-calendar.ts:26,36`, `tests/calendar-probe.test.ts:37`) geven nu de body letterlijk terug. Ze worden aangepast naar Google-gedrag: `dateTime` in de readback mét offset (berekend uit `timeZone`), PATCH als geneste samenvoeging waarbij `null` een veld wist, en een insert die `null`-velden negeert. Daarmee falen letterlijke vergelijkingen en ontbrekende `null`-velden in de tests zoals ze in productie zouden falen.
- Nieuwe tests: factory (All-day, Fixed time, runtime null, ontbrekende platform/afleveringstitel), canonieke hash (offset, locatie, tijdzone, negatief geval), DST-dag (overlap en gat, begin en einde), schrijfcontract bij vormwissel, datumadministratie (`lastDate`, `eventDate` met een agendazone die afwijkt van de afspraakzone, ingetrokken datum na verschuiving), overzicht `linked`, export, preferences-validatie op samengevoegde toestand, probe met beide vormen, offset-readback en een alleen-locatie-mutatie, redirects in smoke.
- Consumenten van builder, hash en instellingen buiten `src/` (`tsconfig.json` typecheckt `**/*.ts`): `scripts/migration/readback.ts:13,48,50` wordt op de factory en de lader aangepast en blijft bestaan, want de herstelrunbooks (`docs/runbooks/idea-219-r2-cutover.md:58,100`, `idea-219-r1-cutover.md:37,53`) schrijven een remote readback voor na een databaseherstel vóór de scheduler weer start; `tests/migration/readback.test.ts` volgt mee. `scripts/prove-calendar-recovery.ts:74` en iedere `SyncService`-, `CalendarProbeService`- en `overview`-constructie in `tests/` (te vinden met grep; onder meer `sync.test.ts:39`, `shared-sync`, `cron`, `banners`, `limited-calendar`, `idea219-acceptance`, `agenda`, `user-isolation`, `calendar-probe`) krijgen de volledige instellingen plus een vaste origin.
- Opmaaktest: een gerenderde afleveringsdatum blijft dezelfde kalenderdatum met de voorkeur `Pacific/Auckland` (§3.1).

## 12. Bestanden

| Gebied | Bestanden |
| --- | --- |
| Afspraakmodel | `src/server/google-calendar.ts`, `src/server/sync.ts`, `src/server/sync-settings.ts` (nieuw), `src/server/services.ts`, `src/server/overview.ts`, `src/server/agenda.ts`, `src/server/calendar-probe.ts`, `src/app/settings/trial-panel.tsx`, `tests/simulated-calendar.ts`, `tests/calendar-probe.test.ts` (simulator), `scripts/prove-calendar-recovery.ts`, `scripts/migration/readback.ts`, `tests/migration/readback.test.ts`, `src/app/api/shows/route.ts`, `src/app/page.tsx` |
| Voorkeur | `prisma/schema.prisma` + migratie, `src/server/preferences.ts`, `src/app/api/settings/preferences/route.ts`, `src/app/settings/preferences-panel.tsx`, `src/server/privacy.ts` (export), `tests/privacy.test.ts` |
| Engels | alle bestanden uit de inventaris in §3.1; `src/lib/series-list.ts`; `src/server/errors.ts`; `src/server/privacy.ts` (DELETE) |
| Routes | `next.config.ts`; mappen `src/app/volgen` → `following`, `uitnodiging` → `invitation`, `beheer/*` → `admin/*`; `navigation.tsx`; `invitations.ts`; `invitation-entry.tsx`; `agenda-panel.tsx`; `admin-users-panel.tsx` |
| Landing en privacy | `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/manifest.ts`, `src/app/privacy/page.tsx` |
| Beheer en bewijs | `docs/runbooks/idea-241-production-consent.md` (nieuw), `docs/evidence/idea-241-stap-1.md` (nieuw), `deploy/README.md` (redirect-opruimnotitie), `README.md` (routes) |

## 13. Risico's

- **Google-notificatie toont de locatie niet.** Dan blijft de afspraak zelf de plek voor aanbieders; de melding toont titel en tijd. Geen ontwerpwijziging nodig, wel vastleggen (open vraag grill).
- **PATCH-golf na uitrol.** Begrensd door het venster; bij 25 series van JP hoogstens enkele tientallen PATCHes. Bij meer gebruikers loopt de cron ze sequentieel per gebruiker af zoals nu.
- **Oude `/uitnodiging`-links.** Afgedekt door de redirect plus fragmentbehoud; 72 uur geldigheid beperkt de blootstelling.
- **Consentscherm-scopes wijken af van de code.** Vóór publiceren controleren (§8 stap 2); anders blijft het waarschuwingsscherm ook na verificatie.
- **Grens van 100 nieuwe gebruikers.** Levenslang per project en zonder teller aan Google-zijde; het handmatige budget uit §8 stap 8 is de bewaking. Bij 50 vóór verificatie: wachten met uitnodigen.
- **Rollback na Fixed time.** Alleen schoon zolang niemand Fixed time gebruikt (§9); daarna forward-fix.

## 14. Onderbouwing

Codebasis `origin/main` `1554c6a`, gelezen op 8 oktober 2026 in een losse checkout: `src/server/sync.ts`, `google-calendar.ts`, `calendar-probe.ts`, `preferences.ts`, `services.ts`, `auth.ts`, `google-connection.ts`, `privacy.ts`, `errors.ts`, `src/app/page.tsx`, `layout.tsx`, `privacy/page.tsx`, `navigation.tsx`, `uitnodiging/*`, `next.config.ts`, `tests/*`, `scripts/smoke-http.mjs`, `deploy/README.md`, `docs/praktijkproef.md`. Google: [Calendar-scopes](https://developers.google.com/workspace/calendar/api/auth), [Events-velden](https://developers.google.com/workspace/calendar/api/v3/reference/events), [verificatie](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification), [app-audience en publicatiestatus](https://support.google.com/cloud/answer/15549945), [onverifieerde apps](https://support.google.com/cloud/answer/7454865). Scrum4Me: `grills/idea-241-verkenning` rev. 3, `specs/idea-219-specificatie`, tijdlijn IDEA-241 (besluiten 1-14 en het besluit van 8 oktober over §2). Verwijzingen naar de tijdlijn, de review-loop-skill en eerdere dispatch-jobs in dit document zijn vastgelegde context, geen in de review onafhankelijk geverifieerd bewijs.

## 15. Open punten voor JP (geen stap-1-werk)

- Ontvolgen verwijdert nu alle eigen agenda-items van de serie, ook uit het verleden (`sync.ts:84-92`, `:112-124`), terwijl de grill zegt "eerdere afspraken blijven als agendahistorie staan". Keuze: R2-gedrag houden (grill aanpassen) of in stap 4 alleen items vanaf vandaag verwijderen.

## Review record

Review-loop volgens `~/.claude/skills/review-loop` (fase spec, maximaal 10 rondes, twee dispatch-jobs: codex en claude). In opdracht van JP, 8 oktober 2026.

### Ronde 1 — 8 oktober 2026, document v0.2 op commit `c4733dc0c6601ef9c2d4307dfa4165cc2bcf5490`

Pins: `docs/specs/IDEA-241-stap-1.md` (sha256 `7e952a2e…8923f`), `docs/grills/IDEA-241-verkenning.md` rev. 3 (`7634dfee…5620`), `AGENTS.md` (`7bfbc5b0…4ba9`); `repository.base_sha` = dezelfde commit.

| Slot | Request | root_message | Job | Idempotency | Verdict |
| --- | --- | --- | --- | --- | --- |
| codex (`runtime: CODEX`) | `410c9e25-695c-43ef-88ab-2eb6f04c5e53` | `d35eaa7b-5fdc-4b37-8264-74af7491626f` | via dispatch | `1ac22d46-c982-4db6-9908-cd4945d20e00` | **NO-GO** — 2 BLOCKER, 4 MAJOR, 2 MINOR |
| claude (`runtime: CLAUDE`) | `852a10db-ca27-454f-9595-da7bfe16f371` | `ebd8f3f8-dc06-42a5-b2af-4ebbb9cca201` | `b9b0af55-d9e8-4367-9515-6d0e2449f81a` | `5282c4e6-963a-4451-a52d-f3f48cca7b58` | **NO-GO** — 1 BLOCKER, 1 MAJOR, 9 MINOR |

Triage (alle bevindingen tegen de tree gecontroleerd; geen afwijzingen):

| # | Bevinding (bron) | Controle | Remedie in v0.3 |
| --- | --- | --- | --- |
| 1 | BLOCKER (beiden): readback van `dateTime` komt mét offset terug; letterlijke hash/vergelijking faalt in `confirm` (`sync.ts:199`), `:251` en de proefcontrole | bevestigd (`sync.ts:18-23`, `:199`, `calendar-probe.ts:76`; simulatoren echoën de body) | canonieke vergelijking op tijdstip + `timeZone` (§4.1); simulatoren geven offset terug (§11); A3/A6 |
| 2 | BLOCKER (codex) / MINOR (claude): `lastDate` en venstercontrole lezen `start.date`, leeg voor tijdgebonden items (`sync.ts:203,212,218`) | bevestigd | `eventDate`-helper, `lastDate` = afleveringsdatum (§4.1); A12 |
| 3 | MAJOR (claude): PATCH voegt geneste velden samen; vormwissel convergeert niet zonder expliciete `null` | aanvaard op basis van Google-patch-semantiek; simulator verbergt het (`simulated-calendar.ts:36`) | schrijfcontract met `null`-velden (§4.2); simulator met merge-semantiek (§11); rollback gekwalificeerd (§9); A5 |
| 4 | MAJOR (codex) / MINOR (claude): `overview.ts:31` bouwt de gewenste afspraak zelf en mist de nieuwe invoer | bevestigd | gedeelde factory met `currentSettings` (§4.5); `overview.ts`/`agenda.ts` in §12; A12 |
| 5 | MAJOR (codex): venster beschreven als hard filter; `oldDate`/`lastDate`/kandidaat/pending laten correctie buiten het venster toe (`tests/sync.test.ts:137-145`) | bevestigd | §2-rij en §4.3 herschreven met de volledige regel; A4 op vaste set, productie met uitleg |
| 6 | MAJOR (codex): §8 publiceert zonder het §5-bewijs | bevestigd (grill bouwvolgorde stap 1) | §5-bewijs als voorwaarde in §8 stap 1; A9 |
| 7 | MAJOR (codex): admin-gebruikerslijst is geen levenslange teller (`privacy.ts:100`, `google-connection.ts:129`) | bevestigd | SCHRAP; handmatig budget in runbook (§8 stap 8, §13) |
| 8 | MINOR (beiden): twee proeven op dezelfde datum geven één proef (`Probe @@unique([userId,date])`) | bevestigd | andere datum in §5 stap 5 |
| 9 | MINOR (codex): export mist nieuwe voorkeuren (`privacy.ts:19`) | bevestigd | §4.4, §12, A12 |
| 10 | MINOR (claude): "oudere afspraken nooit aangeraakt" klopt niet voor ontvolgen (`sync.ts:84-92`) | bevestigd | §2-rij gekwalificeerd; open punt §15 |
| 11 | MINOR (claude): §11 mist `sync.test.ts:129,143`, smoke 216/221; `AppError`-telling 113/28 | bevestigd | §3.1, §11 |
| 12 | MINOR (claude): A1-grep slecht gedefinieerd (`Agenda`, `serie`/`series`) | bevestigd | A1 herschreven |
| 13 | MINOR (claude): grants uit Testing vervallen na 7 dagen; herverbinden ontbreekt | bevestigd (`google-tokens.ts:42-43`) | §5 stap 1, §8 stap 5 |
| 14 | MINOR (claude): lijst "zonder sessie bereikbaar" onvolledig (`/api/auth/*`, exchange, cron, images) | bevestigd | §6 |
| 15 | MINOR (claude): beheerder/contact moeten gezet zijn vóór publicatie | bevestigd (`privacy/page.tsx:8,15`) | §8 stap 1, A8 |

Scope-delta ronde 1: geen werk toegevoegd buiten de besluiten; toegevoegd binnen stap 1 zijn de canonieke vergelijking, het PATCH-contract, de datumhelper, de gedeelde factory en de export-uitbreiding (alle noodzakelijk om Fixed time werkend te krijgen); het praktijkbewijs is uitgebreid met de vormwissel op echte afspraken en is nu een harde voorwaarde vóór publicatie. Eerste bruikbare resultaat ongewijzigd.

### Ronde 2 — 8 oktober 2026, document v0.3 op commit `22ad8ccc3020bd6a84c6e4f71cd289cf00b5e2b4`

Pins: spec v0.3 (sha256 `6962f85c…c8fd`), grill rev. 3, `AGENTS.md`; `repository.base_sha` = dezelfde commit.

| Slot | Request | root_message | Idempotency | Verdict |
| --- | --- | --- | --- | --- |
| codex (`runtime: CODEX`) | `e2f064ed-cc14-400e-8738-1718d382f477` | `a9414685-9007-45cc-8b72-ac5821daba11` | `6dc09c9b-0dac-4276-a55e-cccbb387a9cd` | **NO-GO** — 0 BLOCKER, 1 MAJOR, 4 MINOR; fixes 1 en 5 gedeeltelijk, 2/3/4/6/7/8 gehouden |
| claude (`runtime: CLAUDE`) | `667d6088-c191-445b-aa3c-bda7f8a5bf31` | `7bcae560-c61b-4c00-86e8-32e93076617f` | `22dbdee6-85e1-44cc-bfa2-42368feb486e` | **GO** — 0 BLOCKER, 0 MAJOR, 9 MINOR; alle acht fixes gehouden |

Triage (alle bevindingen tegen de tree gecontroleerd; geen afwijzingen):

| # | Bevinding (bron) | Controle | Remedie in v0.4 |
| --- | --- | --- | --- |
| 1 | MAJOR (codex) / MINOR (claude M3): offsetloze tijd is bij DST-overlap of -gat geen uniek tijdstip; Google's keuze kan afwijken van die van de app | bevestigd (Node kiest 02:30 op 25-10-2026 → 00:30Z; Google ongedefinieerd) | app lost op met vast beleid en stuurt offset mee; einde = tijdstip + minuten; zone-ID genormaliseerd; `eventDate` via `Intl` in de afspraakzone; simulator in afwijkende agendazone; DST-dagtest (§4.1, §4.2, §4.4, A3, §11) |
| 2 | MINOR (codex): proefcontrole vergelijkt alleen datums, niet titel/locatie/beschrijving | bevestigd (`calendar-probe.ts:75-76`) | inhoud canoniek vergelijken, alleen-locatie-mutatie als test (§5, §11) |
| 3 | MINOR (codex): privacytekst "never reads other calendars" versus `allCalendars` voor naamcontrole | bevestigd (`google-calendar.ts:90`, `calendar-settings.ts:48,131`) | tekst §7 |
| 4 | MINOR (codex, claude M9): aanmaakregel mist herstel van openstaande koppeling | bevestigd (`sync.ts:24`, `:233`) | §2 |
| 5 | MINOR (codex): procesverwijzingen zijn geen onafhankelijk bewijs | aanvaard | label in §14 |
| 6 | MINOR (claude M1): builder-/hash-/instellingenconsumenten buiten `src/` ontbreken; typecheck faalt | bevestigd (`scripts/migration/readback.ts:13,48,50`, `scripts/prove-calendar-recovery.ts:74`, `tests/migration/readback.test.ts`, kale configs in tests) | §11, §12; `readback.ts` + test verwijderd (R2-omschakeling afgerond) |
| 7 | MINOR (claude M2): `currentSettings` is privé, lock-only en aan `database()` gebonden; origin vereist `NEXTAUTH_URL` | bevestigd (`services.ts:23-27`) | `loadSyncSettings(userId, db)` in neutrale module, origin op de servicegrens (§4.5) |
| 8 | MINOR (claude M4): proef "met dezelfde builder" maar afwijkende beschrijving/markers | bevestigd | §5: factory voor summary/location/start/end, eigen description/markers |
| 9 | MINOR (claude M5): A1-woordenlijst mist veel Nederlands | bevestigd (`admin-users-panel.tsx:35-36`, `agenda-panel.tsx:14`) | lijst uitgebreid, handmatige doorloop, `agenda` erbij (A1) |
| 10 | MINOR (claude M6): "vanaf vandaag" in besluit 7 niet expliciet onder het venster gebracht | bevestigd (grill besluit 7) | §2 |
| 11 | MINOR (claude M7): deelpatch-semantiek voorkeuren ongedefinieerd | bevestigd (`smoke-http.mjs:111`) | §4.4: validatie op samengevoegde toestand, `eventTime` blijft bewaard |
| 12 | MINOR (claude M8): A3-voorbeeld mist `timeZone` | bevestigd | A3 herschreven met negatief geval |
| 13 | MINOR (claude M9): stapvolgorde §5, "alle vier de sleutels", §3.2-verwijzingen, smoke-omgevingsvariabelen, volgorde A12 | bevestigd (`agenda-panel.tsx:14`, `invitation-entry.tsx:21`, `smoke-http.mjs:24-31`) | §5, §4.2, §3.2, A8, §10 |

Scope-delta ronde 2: geen nieuw productwerk; binnen stap 1 toegevoegd: offsetbepaling met DST-beleid, zone-normalisatie, één instellingenlader, inhoudscontrole van de proef; verwijderd: `scripts/migration/readback.ts` met test (afgeronde R2-omschakeling; in ronde 3 teruggedraaid naar aanpassen). Eerste bruikbare resultaat en praktijkbewijs ongewijzigd.

### Ronde 3 — 8 oktober 2026, document v0.4 op commit `7232265a44d37aaef21cd5183dd1673a6e66cd46`

Pins: spec v0.4 (sha256 `6b3e8f90…c82d`), grill rev. 3, `AGENTS.md`; `repository.base_sha` = dezelfde commit.

| Slot | Request | root_message | Idempotency | Verdict |
| --- | --- | --- | --- | --- |
| codex (`runtime: CODEX`) | `f16027d0-3c43-4b97-be1d-3f7e5d56625b` | `9e6f36c4-f144-4b12-bd7d-9bd9b828a51c` | `7d80969f-27f2-454d-8bdb-eef33c9ec719` | **NO-GO** — 0 BLOCKER, 1 MAJOR, 3 MINOR; fixes 1, 8 en 9 gedeeltelijk, de overige acht gehouden |
| claude (`runtime: CLAUDE`) | `6216ce34-c4c7-44df-abcd-39e313e06259` | `1f645df5-2605-4b6e-8716-d205cf49d812` | `5d6eea0b-bd5a-4c89-bf2d-6dfa55dc0cd1` | **GO** — 0 BLOCKER, 0 MAJOR, 8 MINOR; fixes 3, 6 en 9 gedeeltelijk, de overige gehouden |

Triage (alle bevindingen tegen de tree gecontroleerd; geen afwijzingen):

| # | Bevinding (bron) | Controle | Remedie in v0.5 |
| --- | --- | --- | --- |
| 1 | MAJOR (codex): datum-only helpers (`agenda-panel.tsx:4`, `series-panel.tsx:12`) maken een synthetische UTC-middag op; in de gebruikerszone opmaken verschuift de datum | bevestigd (Node: 9 oktober → 10 oktober in `Pacific/Auckland`; `smoke-http.mjs:111` slaat Auckland op) | §3.1 gesplitst in datum-only (UTC blijft, alleen locale) en tijdstippen (gebruikerszone); Auckland-opmaaktest in §11 |
| 2 | MINOR (codex, claude m4): gatregel "eerstvolgende bestaande tijdstip" spreekt het A3-voorbeeld tegen | bevestigd | §4.1: opschuiven met de lengte van het gat |
| 3 | MINOR (codex): `eventTime` "anders `null`" versus bewaard onder `ALL_DAY` | bevestigd | §4.4 velddefinitie |
| 4 | MINOR (codex): A1-scan raakt technische strings (`@/server/agenda`, `agenda-period`, `agenda-months`) | bevestigd (`agenda-panel.tsx:1,12`, `preferences-panel.tsx:24-25`) | A1 beperkt tot gebruikersgerichte tekst |
| 5 | MINOR (claude m1): privacytekst "alleen voor naamcontrole" onderschat agendalijstgebruik (verbindingscontrole, opgeslagen metadata) | bevestigd (`google-connection.ts:124`, `calendar-bindings.ts:22-24`) | §7 herschreven |
| 6 | MINOR (claude m2): `timeZone` op hele-dagafspraken in de canonieke vorm ongedefinieerd | aanvaard | §4.1: alleen samen met `dateTime` |
| 7 | MINOR (claude m3): `Intl` accepteert `+02:00`; aliassen worden niet genormaliseerd | bevestigd (Node 24: `+02:00` → `+02:00`, `Asia/Calcutta` ongewijzigd) | §4.1, §4.4: IANA-controle, tekst gecorrigeerd, A5-geval |
| 8 | MINOR (claude m5): `agenda` en `even` zijn ook Engels | bevestigd ("agenda range" in §7) | A1: beide van de lijst |
| 9 | MINOR (claude m6): opsomming testconstructies onvolledig | bevestigd | §11: grep-omschrijving |
| 10 | MINOR (claude m7): verwijderen van `readback.ts` laat herstelrunbooks zonder gereedschap | bevestigd (`idea-219-r2-cutover.md:58,100`, `idea-219-r1-cutover.md:37,53`, `ci.yml:59`) | `readback.ts` aanpassen in plaats van verwijderen (§11, §12) |
| 11 | MINOR (claude m8): factory-invoer mist `userId`/`origin`; overzichtsaanroepplekken niet benoemd | bevestigd (`sync.ts:16,31`; aanroepen in shows-route, Following-pagina, `agenda.ts`) | §4.5, §12 |

Beoordeling vóór ronde 4 (schaal): drie rondes hebben geen productwerk toegevoegd; alle toevoegingen zijn correctheidsdetails van de Fixed-time-vorm (offset, DST, zone, PATCH-contract) en tekstprecisie. Het kleinere alternatief is Fixed time naar een latere stap verplaatsen, waarmee §4.1–§4.2 grotendeels vervallen. Dat is niet gekozen omdat besluit 7 en de bouwvolgorde (besluit 14) de tijdgebonden proef juist in stap 1 leggen en de openstaande bevindingen van ronde 3 op bewoordingsniveau zitten. JP kan hier anders over beslissen; dat is een scopebesluit, geen reviewuitkomst.

Scope-delta ronde 3: geen nieuw productwerk; `readback.ts` blijft (aangepast) in plaats van verwijderd; datumopmaak behoudt het bestaande datumcontract; tijdzone-invoer wordt strenger (IANA-naam). Eerste bruikbare resultaat en praktijkbewijs ongewijzigd.

---
title: "IDEA-217 — uitvoeringsplan PWA en seriebeheer"
status: active
---
# IDEA-217 — uitvoeringsplan PWA en seriebeheer

**Status:** goedgekeurd door JP op 24 september 2026. Gematerialiseerd als S-2026-09-24-4 / PBI-5 / ST-007–ST-009 / T-13–T-16. Zie [materialisatieverslag](IDEA-217-materialisatie.md). Uitvoering nog niet gestart.
**Doel:** When2Watch vanaf het telefoonbeginscherm openen en series overzichtelijker beheren.
**Eerste bruikbare resultaat:** op de bestaande max2-installatie met het gekozen icoon starten, Agenda zien en succesvol inloggen op een echte iPhone/iPad.
**Basis:** Next.js App Router, React, Prisma/SQLite; één eigenaar per installatie. Onderzochte schone checkout: `799d88a70cc7326ca0fba18874698a9ff0bfef50`.
**Ontwerp:** `IDEA-217-verkenning-en-voorstel.md`, met het goedgekeurde pakket `IDEA-217-icoon-05/` in dezelfde map als dit document.
**Uitvoering:** taak voor taak met executing-plans; eerst onderstaande taken materialiseren na planakkoord. Daarna de afgesproken hardstop.

## 1. Grenzen en keuzes

- Agenda blijft de landingspagina. Menu: Agenda, Volgen, Instellingen.
- Online PWA. Geen offline gegevenscache, service worker, eigen pushdienst of native app nodig voor dit increment. Meldingen blijven via Google-/Apple-agenda lopen.
- Icoon 05 ‘Scherm’, bestaande kleuren. Gebruik de goedgekeurde bronnen en PNG's zonder nieuw ontwerp.
- Bestaande authenticatie, eigenaarcontrole, origincontrole en `private, no-store` blijven behouden.
- ‘Proberen’ is een persoonlijke voorkeur naast de TVmaze-bronstatus. Beide soorten gevolgde series synchroniseren op dezelfde manier.
- Hele-dagafspraken, eventidentiteiten, koppelingen, cron en de grens van vier zoektekens blijven behouden.
- Geen hosting- of databasemigratie. T-11 blijft in de wacht. De enige schemawijziging is een aanvullend veld voor Proberen.
- Geen account-/agendaverhuisfunctie. Geen nieuwe TVmaze-accountkoppeling.
- Uitrol en echte Google-wijzigingen volgen de geldende productieautorisatie; planakkoord alleen is geen deploymentopdracht.

## 2. Volgorde en voorgestelde taken

De labels P1–P4 hieronder zijn planlabels, nog geen Scrum4Me-taaknummers.

| Taak | Resultaat | Afhankelijkheid |
| --- | --- | --- |
| P1 | PWA met icoon en echte iPhone/iPad-proef | goedgekeurd plan en uitvoering; productieproef na uitrolautorisatie |
| P2 | Ruimer, responsief Volgen-overzicht | P1 lokaal gereed; eerste toestelproef niet uitstellen tot P4 |
| P3 | Proberen opslaan, toevoegen en wijzigen | P2 |
| P4 | Filters, sortering en integrale praktijkproef | P3 |

P1 is het eerste increment. Een mislukte toestelproef wordt eerst gericht onderzocht; geen nieuw cache- of authenticatiesubsysteem toevoegen zonder aangetoond probleem en scopebesluit. Onafhankelijk lokaal werk aan P2 kan doorgaan terwijl JP de toestelproef uitvoert.

## 3. P1 — PWA en goedgekeurd icoon

### Bestanden en interfaces

Nieuw:
- `src/app/manifest.ts`: getypeerd `MetadataRoute.Manifest`.
- `public/icons/`: SVG-bronnen, gewone PNG's 192/512, maskable PNG's 192/512, Apple-touch 180 en favicon 16/32 uit het goedgekeurde pakket.
- `docs/runbooks/IDEA-217-pwa-praktijkproef.md`: korte installatie-instructie en bewijs per proefstap.

Wijzigen:
- `src/app/layout.tsx`: iconen, Apple-webappmetadata, themakleur via de Next.js viewport-export; bestaande titel, taal en robotsinstellingen behouden.
- `scripts/smoke-http.mjs`: controle van werkelijk geserveerd manifest, iconen en metadata naast bestaande auth-/privacychecks.

Manifestcontract:
- `id: "/"`, `start_url: "/"`, `scope: "/"`.
- `name` en `short_name: "When2Watch"`, `lang: "nl"`, `display: "standalone"`.
- `theme_color: "#176b60"`, `background_color: "#f4f7f3"`.
- Gewone 192/512-iconen met purpose `any`; aparte 192/512-iconen met purpose `maskable`. Alle paden relatief aan de eigen origin.
- Apple-touch gebruikt het ondoorzichtige vierkante bestand van 180 pixels. Afgeronde previewbeelden worden niet gebruikt als appasset.
- Manifest en iconen bevatten geen gebruikersgegevens en zijn zonder login bereikbaar; privéroutes houden hun bestaande beveiliging.

Next.js ondersteunt een manifest via de App Router. Voor deze online versie gebruiken we manifest en HTTPS; we nemen de push- en service-workeronderdelen van de handleiding niet over. [Next.js PWA-handleiding](https://nextjs.org/docs/app/guides/progressive-web-apps).

### Werk en verificatie

- [ ] Maak bij uitvoering een eigen worktree vanaf de actuele remote hoofdbranch; vergelijk met de onderzochte SHA en pas alleen aantoonbaar verouderde verwijzingen aan.
- [ ] Kopieer goedgekeurde iconen, voeg manifest en metadata toe.
- [ ] Controleer de gebouwde app via HTTP: manifeststatus/MIME, alle icon-URL's, afmetingen, Apple-touch-link, relatieve scope en startpagina. Manifest en iconen mogen geen loginredirect opleveren.
- [ ] Voer `npm test`, `npm run typecheck`, `npm run build` en `npm run test:http` uit. Gebruik de bestaande geïsoleerde HTTP-proef; geen productiegegevens in tests.
- [ ] Bereid een herkenbare release en installatie-instructie voor. P1 vereist geen SQLite-migratie.
- [ ] Na geautoriseerde uitrol: voer onderstaande proef met JP uit op iPhone/iPad. Leg toestel, OS-versie, release-SHA, tijdstip en resultaat vast; geen cookies of tokens opnemen.

### Echte toestelproef, vóór afronding P1

1. Open het HTTPS-adres in Safari en voeg toe aan het beginscherm. Schakel ‘Open als webapp’ in indien die optie verschijnt. [Apple-installatiestappen](https://support.apple.com/nl-nl/guide/iphone/iphea86e5236/ios).
2. Beoordeel naam, scherpte en uitsnede van icoon 05.
3. Open via het icoon: zelfstandig venster, werkende Agenda of de bestaande login-/instelroute als de sessie ontbreekt.
4. Log vanuit de geïnstalleerde app in bij Google; controleer daadwerkelijke terugkeer naar bruikbare When2Watch. Neem niet aan dat de Safari-sessie gedeeld wordt.
5. Open Volgen en Instellingen; sluit en heropen de app. De juiste eigenaar, series en agenda blijven beschikbaar.
6. Log uit en heropen: privé-inhoud wordt niet opnieuw door de server vrijgegeven zonder geldige sessie. Test ook navigatie terug.
7. Zet netwerk tijdelijk uit: er mag geen valse bevestiging van een wijziging zijn. Na herstel moet een nieuwe aanvraag werken. Offline beschikbaarheid wordt niet beloofd.
8. Bij de eerstvolgende release van P2: bestaande installatie heropenen en aantonen dat de nieuwe UI verschijnt zonder opnieuw installeren. Dit vervolgbewijs hoort bij P2.

**Acceptatie:** stappen 1–6 slagen op minstens één echte iPhone/iPad; stap 7 toont eerlijk foutgedrag. Desktopcontrole alleen telt niet als toestelbewijs. Eventuele iPad-specifieke afwijkingen worden apart genoteerd; één iPhone-test bewijst niet alle iPads.

## 4. P2 — Meer ruimte op Volgen

**Bestanden:** `src/app/layout.tsx`, `src/app/volgen/page.tsx`, `src/app/series-panel.tsx`, `src/app/globals.css`.

Maak de breedte routegebonden: Volgen krijgt op brede schermen circa 90% beschikbare viewportbreedte; Agenda en Instellingen behouden hun passende breedte. Gebruik een expliciete pagina-wrapper en bijbehorende CSS; vermijd globale verbreding van alle formulieren.

Op brede schermen staan de serieheader met poster/titel/status links en details/komende afleveringen rechts. Op smalle schermen stapelen deze blokken. Behoud de bestaande uitklapbare seriedetails, gesloten spoilers, posterfallback en TVmaze-vermelding. Lange synopsisregels blijven begrensd. Geen nieuwe UI-library.

**Verificatie:** visueel op 390, 768, 1440 en 1920 pixels; lange titel, lange synopsis, ontbrekende poster, geen komende aflevering en foutmelding. Controleer horizontale overloop, zichtbare focus, toetsenbordbediening en voldoende ruimte voor knoppen. Op breed scherm daadwerkelijk meer seriesinformatie zichtbaar. Controleer daarnaast Agenda en Instellingen op regressie. Toon bij de eerste P2-uitrol de bijgewerkte UI vanuit de eerder geïnstalleerde PWA.

## 5. P3 — Persoonlijke keuze Proberen

**Bestanden:** `prisma/schema.prisma`, een nieuwe toevoegende Prisma-migratie, `src/server/sync.ts`, `src/server/overview.ts`, `src/app/api/shows/route.ts`, `src/app/series-panel.tsx`, `tests/sync.test.ts`, `tests/http-guards.test.ts` en `scripts/smoke-http.mjs`. Voeg een gerichte testfile voor serievoorkeuren toe als de bestaande tests daarmee onoverzichtelijk worden.

### Gegevens- en API-contract

- `TrackedShow.trying Boolean @default(false)`. Bestaande rijen krijgen false, bestaande sleutels en episode-/agendakoppelingen blijven intact.
- `Overview.shows[]` krijgt `trying: boolean`.
- POST `/api/shows`: `{showId: string, trying?: boolean}`. Ontbrekend trying betekent false uitsluitend bij een nieuwe serie. Ongeldig type: 400 vóór providerverkeer.
- Lees de JSON-body eenmaal; de bestaande helper `stringField` consumeert de body en kan dus niet tweemaal voor hetzelfde request gebruikt worden.
- Breid `SyncService.add(userId, tvmazeId, trying = false)` en de interne toevoeging uit. Schrijf trying uitsluitend in de create-tak van de upsert. Herhaald toevoegen en een vertraagde retry mogen een later gewijzigde voorkeur niet terugzetten.
- PATCH `/api/shows`: `{showId: string, trying: boolean}`; bestaande `requireUser` en `requireSameOrigin`, daarna eigenaargebonden update via userId + tvmazeId. Niet-gevolgde serie: 404. Succes: 200 met `{showId, trying}`.
- PATCH wijzigt alleen het persoonlijke veld, zonder TVmaze- of Google-aanvraag. Bronmetadata-updates schrijven dit veld nooit. Agenda-eventpayload en hash bevatten trying niet.
- Bij een zoekresultaat kiest de gebruiker Volgen of Proberen; bestaande series krijgen een aanpasbare, gelabelde keuze. Na een fout blijft de opgeslagen toestand leidend en volgt een begrijpelijke foutmelding.

### Bewijs en herstel

Test bestaande SQLite-data vóór/na de echte migratie in een tijdelijke database: false-default, behoud van series, episodes en link-ID's. Test toevoegen met beide keuzes, wijzigen, herladen, bronstatuswijziging en opnieuw synchroniseren. Ook testen: ongeldige JSON/boolean, anoniem, verkeerde origin en andere eigenaar; geen netwerkmutatie bij afwijzing.

Bewijs dat een Proberen-serie gewoon agenda-items krijgt, dat een gewijzigde voorkeur dezelfde event-ID's behoudt en dat herhaalde sync geen duplicaten maakt. Een gelijktijdige bronupdate mag trying niet wissen.

Voor productie: consistente databasebackup volgens bestaande procedure en migratie op de bestaande database; nooit reset of een leeg volume. Bij een approllback de toevoegende kolom behouden. Geen destructieve down-migratie.

## 6. P4 — Filters, sortering en integrale proef

**Bestanden:** nieuw `src/lib/series-list.ts` met zuivere presentatiehelpers, `src/app/series-panel.tsx`, bijbehorende CSS en `tests/series-list.test.ts`. Verplaats de bestaande bronstatusweergave naar dezelfde helper zodat labels en filtergroepen overeenkomen.

- Bronfilter: Alle, Lopend (Running), Vervolg nog onzeker (To Be Determined), Beëindigd (Ended), Status onbekend (alle overige bronwaarden).
- Persoonlijk filter: Alle, Volgen (trying=false), Proberen (trying=true).
- Combineer met AND. Filters gelden uitsluitend voor het weergegeven overzicht, niet voor synchronisatie of de Agenda-landingspagina.
- Standaardvolgorde: Running, To Be Determined, Ended, overige. Daarbinnen Nederlandse titelvergelijking; bij gelijke titels oplopend numeriek TVmaze-ID.
- Filters staan standaard op Alle en mogen tijdens deze versie lokaal in componentstate blijven; geen nieuwe gebruikersinstelling of opslag.
- Toon zichtbaar aantal versus totaal en een onderscheid tussen ‘geen series’ en ‘geen matches’, met herstel naar Alle.
- ‘Nu synchroniseren’ blijft alle gevolgde series omvatten, ook als de zichtbare lijst leeg is.

**Tests:** alle bronstatussen, onverwachte bronwaarde, beide persoonlijke keuzes, filtercombinaties, lege lijst, nul matches, gelijke titels en verschillende bronstatus bij gelijke titel. Bewijs dat sorteren de invoer niet muteert en dat filteren geen sync-aanvraag doet.

**Praktijkproef:** JP markeert een gevolgde serie als Proberen, herlaadt, filtert op beide kenmerken, zet filters terug en controleert lopende series bovenaan. Voeg één afgesproken proefserie toe; lees een eigen nieuw agenda-item terug en bevestig een ontvangen melding in de gekozen agenda-app. Gebruik bestaande eigendomsmarkeringen; geen vreemde afspraken wijzigen. Controleer daarna herhaalde sync zonder duplicaten.

## 7. Afronding en proces

Voor elke taak: relevante tests, typecheck/build waar de wijziging dat raakt, visueel of runtimebewijs volgens bovenstaande acceptatie, log_implementation en log_test_result. Commits loggen met log_commit. Een taak blijft open zolang noodzakelijk praktijkbewijs ontbreekt.

Vóór eindoverdracht: volledige tests, typecheck, build en HTTP-smoke op de uiteindelijke code; actualiseer installatie-instructie en proefbewijs. Controleer de DoD: serie toevoegen, automatisch uitzendschema ophalen en een echt ontvangen melding.

**Na akkoord op dit plan:** maak één sprint, één PBI en passende stories/taken voor P1–P4. Sla per taak het zelfstandige plan op via update_task_plan en controleer via verify_task_against_plan. Neem de globale grenzen, bronnen en noodzakelijke interfacecontracten in elke taak mee. Stop vervolgens volgens de afgesproken materialisatiegrens; bouwen begint op uitvoeringsopdracht.

**Niet als gereed presenteren:** een geslaagde build is geen iPhone-loginbewijs; een gemockte Google-test is geen ontvangen melding; dit document is geen deploy.

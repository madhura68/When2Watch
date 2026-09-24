---
title: "IDEA-216 — Posters en seriedetails"
status: active
version: "0.2"
last_updated: "2026-09-24"
---

# IDEA-216 — Posters en seriedetails

**Goedkeuring:** JP heeft versie 0.1 op 24 september 2026 goedgekeurd met “akkoord, voer uit”. Versie 0.2 legt alleen deze goedkeuring vast; inhoud, scope en de hardstop na materialisatie blijven gelijk. De goedgekeurde inhoud is ProductDoc-revisie 1 `cmuf9xpkc003mgo17veu84sgn`, hash `33e36220fc94c37ea1257a16d9806499503cab36658617cf71b5dfae7a365868`.

> Voor uitvoerende agents: werk taak voor taak met `superpowers:executing-plans`, binnen de bestaande Scrum4Me-afspraken. Dit document is het gevraagde plan; materialisatie en uitvoering volgen hun eigen faseovergang.

**Doel in JP's woorden:** “Bij het zoeken toon je ook thumbnails, bij de detail van mijn series niet.” JP wil de gevolgde series herkennen en nuttige informatie bekijken, met weinig belasting voor TVmaze. Hij heeft het advies voor posters, een korte omschrijving, genres, speelduur en uitklapbare afleveringsbeschrijvingen goedgekeurd.

**Eerst bruikbaar resultaat:** de bestaande poster staat bij iedere gevolgde serie; JP bekijkt dit op de echte site voordat de detailuitbreiding wordt uitgerold.

**Architectuur:** de bestaande Next.js-app op max2, dezelfde TVmaze-snapshot en persistente SQLite-database. Details openen gebruikt reeds opgeslagen gegevens. Afbeeldingen laden rechtstreeks vanaf TVmaze's bestaande afbeeldingslinks.

**Stack:** behoud Next.js 16.3.6, React 19.3.0, Prisma 6.19.3, TypeScript en Node >=24. Alleen voor HTML naar gewone tekst komt `html-to-text` 10.0.1 erbij, met `@types/html-to-text` 9.0.4 als ontwikkelafhankelijkheid. Leg exacte versies vast in het lockbestand; geen overige upgrades.

**Bronnen en uitgangspunt:** repository `janpeter/When2Watch`, lokale en remote branch gecontroleerd op commit `d13cad016474cf9d0f84a063d64d51aa74262de8`. Werkmap: `/Users/janpetervisser/.codex/worktrees/when2watch-increment-1`. Basisspecificatie: `SPECS/idea-216-specificatieplan` v0.3, revisie 3 `cmuf9deyw002fgo178e0uekbc`, hash `6ffda4b3cb4f3f2ccaea7398001052640ed01cacdc355e0ee45a55d1e41cd0bb`; lokaal `docs/specs/IDEA-216-specificatieplan.md`. Dit plan is de beperkte aanvulling op het overzicht uit §3.3, geen heropening van de hele v1.

## 1. Wat JP te zien krijgt

| Plaats | Gedrag |
|---|---|
| Kaart onder ‘Jouw series’ | Poster naast titel, jaar, platform en status. Komende afleveringen blijven direct zichtbaar. |
| Poster ontbreekt of laden mislukt | Rustig TV-vlak met dezelfde afmetingen; titel en bediening blijven bruikbaar. |
| ‘Over deze serie’ | In dezelfde kaart uitklappen: korte omschrijving, genres en ‘Speelduur: circa … min.’ Alleen beschikbare waarden tonen. |
| Lange serieomschrijving | Maximaal 400 tekens op een woordgrens, met een weglatingsteken en ‘Lees verder op TVmaze’. De volledige tekst blijft lokaal opgeslagen. |
| Ontbrekende serieomschrijving | ‘Nog geen omschrijving beschikbaar.’ Eventuele genres en speelduur blijven zichtbaar. |
| Komende aflevering met beschrijving | ‘Beschrijving (spoilers)’ is standaard dicht; expliciet openen toont de tekst. |
| Aflevering zonder beschrijving | Geen lege uitklapknop; subtiel ‘Nog geen beschrijving beschikbaar’. |

Gebruik native `details`/`summary` voor de uitklapdelen, met zichtbare toetsenbordfocus. Herladen begint met gesloten beschrijvingen. Geen popup of nieuwe detailpagina. De broninhoud behoudt zijn oorspronkelijke taal; de bediening is Nederlands. Poster en titel staan naast elkaar, dus de poster krijgt lege alt-tekst om dubbele voorlezing te voorkomen.

De poster reserveert ruimte in verhouding 5:7: richtmaat 80×112 px op desktop en 60×84 px op smalle schermen. Behoud het volledige beeld. Gebruik `loading="lazy"` en `decoding="async"`; een fout geeft één fallback, geen herhaalde laadlus. Een nieuwe poster-URL na synchronisatie krijgt wel weer een laadpoging.

## 2. Grenzen en brongebruik

- Zoekgrens vier getrimde tekens, 350 ms wachttijd, bestaande bronvertraging en 429-afhandeling blijven gelden.
- Geen extra metadata-aanroep bij paginaladen of uitklappen. Hergebruik `/shows/:id?embed=episodes` tijdens toevoegen en de bestaande handmatige/dagelijkse synchronisatie. Afbeeldingsverkeer naar het CDN blijft afzonderlijk bestaan; browsercache en uitgesteld laden beperken dat verkeer. [TVmaze API](https://www.tvmaze.com/api#embedding)
- De reeds opgeslagen `poster`-URL blijft de middelgrote afbeelding. Geen afbeeldingsgalerij, servermirror of nieuwe afbeeldingsproxy. TVmaze staat rechtstreeks linken toe; hun beheerder adviseert dat ook voor verwijderverzoeken. [Toelichting van TVmaze](https://www.tvmaze.com/threads/6552/using-posters-and-data-from-tvmaze-api-on-a-commercial-website)
- Behoud bronlink per serie en de CC BY-SA 4.0-link. Vermeld bij de bronregel dat omschrijvingen als gewone tekst en waar nodig verkort worden getoond. Voor verspreide bewerkingen gelden de licentievoorwaarden. [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
- Nieuwe omschrijvingen, genres en speelduur zijn alleen scherminformatie. Ze komen niet in agenda-items, eventhashes of meldingen: anders zou een tekstcorrectie onnodige Calendar-writes of spoilers in meldingen veroorzaken.
- Buiten dit increment: cast, beoordelingen, banners, trailers, afleveringsafbeeldingen, vertaling, volledige afleveringgeschiedenis, aanbevelingen en Nederlandse streamingbeschikbaarheid. Ook agenda wisselen, series verwijderen en de nog open OAuth-duurproef worden hiermee niet uitgebreid.

## 3. Gegevens en interfaces

`TrackedShow.poster` is al opgeslagen; `overview()` geeft hem al terug. Voor taak 1 is geen datamigratie nodig. Voor taak 2 worden alleen de volgende velden toegevoegd:

| Bron | Parser-/overzichtveld | SQLite via Prisma | Ontbrekend of onbruikbaar |
|---|---|---|---|
| Serie `summary` | `summaryText: string \| null` | `TrackedShow.summaryText String?` | `null` |
| Serie `genres` | `genres: string[]` | `TrackedShow.genresJson String @default("[]")` | `[]` |
| Serie `averageRuntime`, daarna `runtime` | `runtimeMinutes: number \| null` | `TrackedShow.runtimeMinutes Int?` | `null` |
| Aflevering `summary` | `summaryText: string \| null` | `Episode.summaryText String?` | `null` |

Neem de eerste positieve gehele speelduur uit `averageRuntime` of `runtime` die in Prisma `Int` past (maximaal 2147483647); onbruikbare waarden mogen geen databasefout veroorzaken. Bij genres alleen niet-lege getrimde strings, zonder duplicaten. De bestaande zoekresultaatvorm `Show` blijft intact; `Snapshot.show` krijgt de aanvullende velden via `Show & ShowDetails`. `SourceEpisode` krijgt `summaryText`. `overview()` retourneert de serievelden en `upcoming[].summaryText`, binnen dezelfde gebruikersselectie en hetzelfde datumfilter.

De enige nieuwe teksthelper is `summaryText(input: unknown): string | null` in `src/server/summary-text.ts`. Gebruik `html-to-text` om HTML-entiteiten en alinea's correct te verwerken; sla scripts, styles en afbeeldingen over en neem van links alleen de zichtbare tekst mee. Normaliseer overtollige witruimte. Lege/niet-tekstuele input of een conversiefout geeft `null`. Render het resultaat als gewone React-tekst, nooit als HTML.

Deze kleine parserafhankelijkheid voorkomt dat bron-HTML wordt uitgevoerd of dat een eigen regex HTML-entiteiten en opmaak fout verwerkt. De library blijft op de server. [Librarydocumentatie](https://github.com/html-to-text/node-html-to-text/blob/master/packages/html-to-text/README.md)

De bestaande transactie bewaart de extra metadata samen met de geldige snapshot. Een fout bij optionele metadata mag de huidige agenda-synchronisatie niet blokkeren. Een mislukte bronopvraag behoudt de laatst opgeslagen gegevens. Bij een geldige nieuwe respons met een leeg optioneel veld wordt dat veld wel leeggemaakt. De bestaande strikte controles op identiteit, datums en volledige afleveringenlijst blijven gelden.

Gebruik een toevoegende migratie `prisma/migrations/20260924100000_series_details/migration.sql`, mits die naam bij uitvoering nog vrij is. Bestaande records krijgen `null`/`[]`; de eerstvolgende gewone synchronisatie vult ze. Geen automatisch TVmaze-verkeer vanuit een migratie, appstart of paginalaadactie.

## 4. Taak A — Posters zichtbaar maken en direct beproeven

**Bestanden:** nieuw `src/app/series-poster.tsx`; aanpassen `src/app/series-panel.tsx`, `src/app/globals.css` en bewijs toevoegen in `docs/praktijkproef.md`.

**Interface:** component `SeriesPoster({ src }: { src: string | null })`, gevoed met het bestaande `data.shows[].poster`. De nieuwe component verzorgt vaste beeldruimte, uitgesteld laden en fallback. De zoekweergave hoeft hiervoor niet te worden verbouwd.

- [ ] Toon de poster in de kop van iedere gevolgde serie, met de afgesproken fallback en maten.
- [ ] Controleer de bestaande kleuren, teksthiërarchie en bediening op desktop en 375 px breedte; geen horizontale scroll, overlappende tekst of verspringende kaart tijdens laden.
- [ ] Controleer ontbrekende en kapotte afbeelding lokaal met gecontroleerde voorbeelddata. De productiegegevens worden daarvoor niet aangepast. Voor deze presentatieaanpassing volstaat de browserproef naast de bestaande controles.
- [ ] Draai `npm test`, `npm run typecheck` en `npm run build`.
- [ ] Rol alleen deze appwijziging uit volgens §7 en laat JP de echte poster bij Slow Horses op max2 beoordelen. Leg release, browserbeeld en resultaat vast voordat taak B wordt uitgerold; voorbereidend werk aan B kan doorgaan.

**Gereed:** de bestaande gevolgde series zijn herkenbaar aan hun poster; ontbrekend beeld hindert het gebruik niet; het openen van de pagina triggert geen TVmaze-metadataopvraag of synchronisatie.

## 5. Taak B — Details lokaal bewaren en zonder spoilers tonen

**Afhankelijkheid:** taak A levert de posterweergave. De gegevenscontracten staan volledig in §3; de bestaande agenda- en bronafspraken uit §2 blijven leidend.

**Bestanden:** aanpassen `prisma/schema.prisma`, nieuwe migratie uit §3, `package.json`, `package-lock.json`, `src/server/tvmaze.ts`, `src/server/sync.ts`, `src/server/overview.ts`, `src/app/series-panel.tsx` en `src/app/globals.css`. Nieuw `src/server/summary-text.ts` en `tests/summary-text.test.ts`. Gerichte uitbreidingen in `tests/tvmaze.test.ts`, `tests/sync.test.ts`, `tests/database.ts` indien nodig voor de migratieproef, en `scripts/smoke-http.mjs`. Gebruik bestaande fixtures; pas getypeerde test-snapshots aan waar de nieuwe velden dat vereisen.

- [ ] Leg eerst de betekenisvolle regressiegevallen uit §6 vast en observeer de verwachte fouten.
- [ ] Voeg velden, migratie, tekstconversie en snapshotnormalisatie toe volgens §3.
- [ ] Neem de metadata mee in `SyncService.showData()` en de bestaande episode-upserts; wijzig `episodeEvent()` en `calendarEventHash()` niet.
- [ ] Breid `overview()` uit vanuit de lokale database en voeg de twee uitklapweergaven uit §1 toe. Gebruik de bestaande `sourceUrl` voor de volledige omschrijving op TVmaze.
- [ ] Draai tests, typecheck, build en HTTP-controles; inspecteer tekst, ontbrekende waarden, focus en gesloten spoilerweergave in de browser.
- [ ] Rol app en migratie uit volgens §7. Gebruik één gewone handmatige synchronisatie om bestaande series te vullen; voer daarna de leesproef uit. De bestaande dagelijkse taak neemt toekomstige updates mee.
- [ ] Leg het werkelijke resultaat en eventuele ontbrekende bronvelden vast in `docs/praktijkproef.md` en de Scrum4Me-log.

**Gereed:** de extra gegevens zijn na synchronisatie en herstart beschikbaar, zonder nieuwe detailrequests en zonder agenda-effecten door alleen gewijzigde metadata.

## 6. Acceptatie en gerichte verificatie

| Faalpad / acceptatie | Bewijs |
|---|---|
| Bron-HTML verschijnt als markup of actieve inhoud | Tekstconversietest met alinea's, `&amp;`, Unicode, script/style en afbeeldings-/linktags. In de browser alleen leesbare tekst; geen broncode-uitvoering of extra bronlinks/afbeeldingen uit de synopsis. |
| Optionele velden ontbreken of hebben een verkeerd type | Parsergevallen `null`, afwezig, lege tekst, onbruikbare speelduur en gemengde genres; neutrale waarden, geldige afleveringen blijven synchroniseerbaar. |
| Metadatawijziging wijzigt onbedoeld de agenda | Bestaande SQLite/simulated-Calendar-test: alleen synopsis, genres en speelduur wijzigen; lokale waarden veranderen, event-ID's/payloads/hashes blijven gelijk en er zijn nul Google-writes. |
| Migratie beschadigt bestaande gebruikersgegevens | Testdatabase vullen met de vorige migraties, nieuwe migratie toepassen: bestaande gebruikers, gevolgde series, afleveringen en eventkoppelingen behouden; nieuwe velden `null`/`[]`. Heropening leest opgeslagen metadata terug. |
| Detail openen lekt spoilers of doet netwerkwerk | Native uitklappers standaard gesloten, toetsenbordbediening werkt. Live pagina en details tweemaal openen terwijl TVmaze-metadataopvragen worden geobserveerd: nul. CDN-afbeeldingen afzonderlijk tellen. Een `overview()`-test leest uit SQLite met providerverkeer uitgeschakeld. |
| Nieuwe gegevens gaan naar een andere of anonieme gebruiker | Bestaande HTTP-toegangscontroles blijven groen; verrijkte gegevens alleen voor de ingelogde eigenaar. |
| Eerste echte bronproef vult het verwachte gedrag niet in | Gebruik de bestaande ongewijzigde Slow Horses-fixture, opgehaald 24 september: genres Drama/Thriller/Espionage, `runtime=null`, `averageRuntime=45`. Van vier komende afleveringen heeft er maar één een beschrijving: ID 3643507. Ontbrekende beschrijvingen zijn dus onderdeel van de proef. Live gegevens mogen intussen afwijken; rapporteer wat werkelijk terugkomt. |

Verificatiecommando's: `npm test`, `npm run typecheck`, `npm run build`, `npm run test:http`. Voer ze uit bij de betreffende codewijziging; een gecontroleerd plan is nog geen geslaagde implementatieproef. De browsercontrole dekt zowel desktop als een smal scherm en gebruikt geen nieuwe productierelaties of proefagenda-items.

## 7. Uitrol en herstel

Volg `deploy/README.md`: bouw een gepinde release uit de beoordeelde commit en vervang alleen `when2watch-web-1` op max2 via `ssh janpeter@192.168.0.158`. Bewaar vorige image/release/configuratie en maak vooraf een consistente SQLite-backup met integriteitscontrole. Pas alleen de toevoegende migratie uit taak B toe. Controleer health, bestaande sessie, actuele volglijst en kalenderkoppelingen; laat `current` en `RELEASE_TAG` naar dezelfde bewezen release wijzen.

Bij een probleem kan de vorige app tegen de database met de extra kolommen terugstarten. Verwijder geen kolommen en zet geen oude database blind terug: tijdens gebruik kunnen echte series of agenda-acties zijn bijgekomen. Er wordt geen cronregel, OAuth-instelling, proxy of andere app gewijzigd.

Een gewone synchronisatie kan intussen echte broncorrecties vinden. Nul writes is daarom de eis van de gecontroleerde metadataregressie, niet een onbewezen belofte over iedere live synchronisatierun.

## 8. Oplevering en faseovergang

Dit plan levert twee uitvoerbare taken op. Voorgestelde uitvoering: in dezelfde sessie, achtereenvolgens, met het eerste zichtbare resultaat na taak A.

Na akkoord op dit plan volgt de afgesproken Scrum4Me-materialisatie: `create_sprint → create_pbi → create_story(sprint_id) → create_task` voor A en B. Bewaar per taak een zelfstandig uitvoerbaar plan met `update_task_plan`, inclusief de gedeelde grenzen, bronrevisies en eigen acceptatie; controleer het opgeslagen plan. Daarna geldt de bestaande hardstop. De eerdere productietoestemming blijft intact; dit plan verruimt haar niet naar andere diensten.

De bestaande administratieve blokkade ISS-7 en de ontbrekende `origin/main` zijn bekend uit het vorige increment. Bij de volgende processtap de actuele toestand controleren; geen status-, database- of repositorybypass. Deze punten verhinderen het opstellen en opslaan van dit plan niet.

**Zelfcontrole:** het goedgekeurde advies is afgedekt door A (poster) en B (compacte details). De eerste max2-proef zit in A. Nieuwe velden en gebruikersgedrag hebben expliciete lege toestanden; de vijf belangrijkste foutpaden staan in §6. Er is geen formele reviewronde of runtimeproef voor deze uitbreiding uitgevoerd.

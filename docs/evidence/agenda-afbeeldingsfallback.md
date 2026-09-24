# T-12 — Afbeeldingsfallback in Agenda

Uitvoering op 24 september 2026 voor ST-006, sprint S-2026-09-24-3.
Goedgekeurde bron: ProductDoc `cmufmduv900a5go17krfrpfy3`, revisie
`cmufmil4l00apgo17xqx9sqcn`, hash
`3053eccb3362236353b2f3bd498ea3786fbf810ab632bf61677a704d482bbfc1`.
De geïsoleerde branch begint op de opnieuw gecontroleerde productierelease
`e86439762d18698464402eaf94556df2ae9e8014`; de onvoltooide B2-delta zit er niet in.

## Vroege echte beeldproef

De ongewijzigde openbare response van
<https://api.tvmaze.com/shows/44776/images> staat in
`tests/fixtures/tvmaze/lanterns-images.json`. De naastgelegen bronmetadata bevat
URL en ophaaltijd. Er zijn 20 beelden: 12 posters, 7 achtergronden, 1 typografie,
geen banner. De bestaande Slow Horses-response wordt hergebruikt.

De gekozen Lanterns-achtergrond is ID **1559687**, origineel **1065×597**. Dit is
de kleinste geleverde liggende breedte vanaf 900 px; geen achtergrond is als
hoofdbeeld aangewezen. Er wordt geen medium-URL verzonnen. De bestaande banner
van Slow Horses blijft ID 1472065.

Vóór de opslag-/migratiewijziging zijn het werkelijke `SeriesBanner`-component
en de bestaande stylesheet in een tijdelijke lokale SSR/hydration-proef in
Chrome bekeken. Desktop en 375 px tonen:

- Slow Horses met zijn banner.
- Lanterns met de gekozen achtergrond; titel en kenmerkend beeld blijven
  herkenbaar met gecentreerde `cover`. De algemene CSS-keuze is daarom behouden.
- De bestaande Lanterns-poster volledig zichtbaar met `contain`, op een rustig
  vlak. Geen uitrekking of uitsnede van de poster.
- De lokale algemene banner wanneer alle seriebeelden ontbreken.

Alle vier beelden zijn daadwerkelijk geladen (respectievelijk natuurlijke
afmetingen 758×140, 1065×597, 210×295, 900×180). Mobiel: viewport en scrollbreedte
beide 375 px, bannerhoogte 67,398 px. De proef gebruikt rechtstreeks CDN-beelden;
er is geen lokaal gewijzigde of gegenereerde afbeelding gebruikt.

## Browserlaadfouten

Een SSR-pagina is vóór hydration gelezen: vijf 404-afbeeldingen waren al
`complete: true, naturalWidth: 0`. Na starten van hydration kwamen de juiste
achtergrond, poster en algemene banner in beeld. De volgende kandidaten met
404 werden pas ná hydration aangevraagd en werkten eveneens door naar de
volgende beschikbare afbeelding.

- Bannerfout → achtergrond; twee fouten → poster; drie fouten → algemeen.
- Eenzelfde defecte URL als banner én achtergrond werd één keer geprobeerd.
- Elk van de acht unieke defecte proefadressen werd één keer aangevraagd;
  geen metadata-aanvraag of retrylus.
- Een gewijzigde kandidatenlijst herstelde naar de echte Slow Horses-banner.
- Bij een ontbrekende lokale SVG eindigde de keten met een rustig leeg vlak,
  zonder kapot-afbeeldingsicoon of verdere pogingen.
- Het frame behield zijn hoogte vóór en na fouten: 67,398 px mobiel, 158 px
  bij de desktopkaart van 790 px breed.

## Automatisch bewijs

Baseline: 123 tests groen. De nieuwe SSR-beeldkeuze faalde eerst in drie gevallen;
de SyncService→Agenda-regressie faalde eerst doordat achtergrond en poster niet
werden doorgegeven. Beide zijn daarna groen uitgevoerd.

Eindcontrole vóór review: **141 tests**, typecheck, productiebuild en **115
HTTP-controles** geslaagd. De HTTP-proef draait echt Next.js/SQLite met
synthetische sessies; Google-antwoorden in integratietests zijn simulaties.

Getest: onveranderde bannerselectie, echte Lanterns-responsvorm, deterministische
achtergrondkeuze en hoofdbeeldvoorrang, originele resolutie, onveilige of
ongeldige brondata, 429-grenzen en één afbeeldingenaanvraag. Cachegedrag is
beproefd op de zeven-dagen-/24-uursgrens en na databaseheropening. Geldige lege
resultaten verwijderen beide oude keuzes; bronfouten bewaren beide.

De toevoegende migratie behoudt alle bestaande seriekolommen en de nog geldige
negatieve cache. Achtergrond en poster zijn beschikbaar via lokale Agenda-reads;
afbeeldingswijzigingen veroorzaken nul Google-writes en geen gewijzigde
event-ID's, payloads of hashes. Historische bannermigratie- en
installatiemigratietests lezen expliciet het schema van hun eigen tijdstip;
een toekomstige kolom wordt niet stilzwijgend in die oude migraties ingebouwd.

## Review en max2

Een onafhankelijke reviewer beoordeelde de gehele delta
`e86439762d18698464402eaf94556df2ae9e8014` →
`c04812c4b86fa7087d505d158012332f56a1c5dc`: geen concrete bevindingen, technisch
GO. De reviewer herhaalde zelfstandig alle 141 tests. B2/C1 en de nog te verrichten
uitrol vielen buiten zijn oordeel; de uitvoerder heeft de uitrol hieronder
daadwerkelijk gecontroleerd.

Op max2 draait **`when2watch:c04812c`**, container healthy en publiek
`https://when2watch.jp-visser.nl/api/health` HTTP 200, `status: ok`.
`current` en de opgeslagen `RELEASE_TAG` wijzen beide naar deze release.
Bij de voorcontrole bleek de oude opgeslagen tag nog `b31af05`, terwijl de
container en `current` al `e864397` waren. Die vastgestelde afwijking is met deze
uitrol hersteld; de eerste voorcontrole stopte vóór enige wijziging.

Voor activatie is uitsluitend de app kort gestopt en met SQLite's backup-API een
consistente kopie gemaakt:
`/srv/apps/when2watch/db-backups/pre-c04812c-20260924T145143907245Z.db` (0600).
`integrity_check` was vóór en na de migratie `ok`. Alle oorspronkelijke kolommen
en rijen waren direct na activatie identiek, gecontroleerd met hashes per tabel.
Dat omvatte 9 series, 170 afleveringen, 11 eventkoppelingen, 14 synchronisatieruns,
de eigenaar, sessie en Google-configuratie. Alleen de nullable achtergrondkolom
en de nieuwe migratieregistratie zijn toegevoegd.

In de ingelogde productiepagina toont Lanterns nu zijn **volledige poster** en
Slow Horses zijn bestaande banner. Beide echte CDN-beelden zijn geladen; de
desktopframes zijn 790×158 px. Spoilers blijven gesloten en de bronvermelding
blijft aanwezig. De 375px-proef is eerder op het echte lokale component gedaan;
de viewportoverride veranderde deze productie-Chrome-tab niet, dus voor productie
wordt alleen de daadwerkelijk geziene desktopweergave geclaimd.

De oude cachetermijnen van Lanterns en Slow Horses zijn behouden. Lanterns heeft
in productie nog geen achtergrond; die volgt bij de reguliere verversing. Er is
geen synchronisatie of vervroegde bronverversing voor de uitrol gestart.
Tijdens de nacontrole kwamen door afzonderlijke `add`-acties nieuwe series en
afleveringen binnen. Een vergelijking op de oorspronkelijke rij-ID's bevestigde
dat de oorspronkelijke 9 series, 170 afleveringen, 14 runs en alle 11
eventkoppelingen nog identiek waren. Nieuwe gebruikershandelingen zijn behouden.

## Integratie in de lopende sprint

Dezelfde codewijziging is zonder conflict overgenomen op
`codex/when2watch-agenda-configuratie` als **`4565be3`**, bovenop `824212b`.
Op die gecombineerde code slagen **158 tests**, typecheck, productiebuild en
**123 HTTP-controles**. B2 is hierdoor niet uitgerold of als praktijkproef
goedgekeurd; C1 is niet gestart.

De lokale proefserver op poort 3401 is voor de integratie kort gestopt. Ook de
proefdatabase is consistent geback-upt en uitsluitend met de nullable kolom
uitgebreid; alle bestaande kolommen en rijen bleven identiek. Daarna is de
server met dezelfde privéconfiguratie herstart. Het bestaande Chrome-tabblad
toont opnieuw de instellingen van de proefeigenaar en dezelfde proefagenda.
Er zijn daarbij geen Google-acties uitgevoerd.

De branches en werkmappen blijven bewaard. Er is in deze uitvoering niet gepusht,
geen PR gemaakt en niet gemerged.

Eerdere Scrum4Me-statusaanroepen gaven `PPE_INPUT_INCOMPLETE`. De afrondende
aanroep slaagde wel: **T-12 staat op done**, met doorgeschoven storystatus.
Er is geen statusbypass toegepast; de uitvoering en bewijzen staan in de taaklogs.
De algemene planverifier meldde `divergent` wegens een ontbrekende job-baseline
(`job_id: null`) en het meenemen van eerder werk vanaf `origin/main`. Daarom
wordt geen geautomatiseerd ALIGNED-oordeel geclaimd. De juiste wijzigingsrange
`e864397..c04812c` is tegen het gepinde plan en onafhankelijk gereviewd.

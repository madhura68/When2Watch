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

De onafhankelijke review en de afzonderlijke max2-uitrol worden na de lokale
controle uitgevoerd. Dit document claimt op dit punt nog geen productie-uitrol.
De uitrol behoudt de bestaande afbeeldingentermijnen: Lanterns kan meteen zijn
opgeslagen poster tonen; de achtergrond volgt bij de reguliere verversing.

De Scrum4Me-statusaanroep geeft de bekende `PPE_INPUT_INCOMPLETE`-fout. Er is geen
statusbypass toegepast; de uitvoering en concrete bewijzen staan in de taaklogs.

# IDEA-216 — Review posters en seriedetails

24 september 2026. Eén onafhankelijke read-only review van `19ac7ddd85c5ab66e04d9408be4d9e66bc46ff8f` tot `b31af0565eda836f5a784549e20fef739a7eae03`, tegen het goedgekeurde plan v0.2. Geen formele review-loop of mergeautorisatie.

**Oordeel: GO voor app-only uitrol volgens §7 van het plan.** Geen Critical- of Important-bevindingen.

## Onderbouwing

Metadata gebruikt de bestaande snapshot en SQLite-transactie; kalenderpayload en hashes blijven gelijk. De regressie controleert nul Google-writes en identieke eventkoppelingen/payloads. De toevoegende migratie bewaart bestaande gegevens uit zeven tabellen. Optionele bronvelden zijn genormaliseerd; bronfouten behouden waarden en geldige lege velden wissen ze. Overzicht/details lezen lokaal, React rendert gewone tekst en native uitklappers beginnen gesloten. De poster vangt ook fouten vóór hydration op en probeert een nieuwe URL opnieuw.

De reviewer controleerde code, migratie, relevante tests en praktijkbewijs, met een schoon `git diff --check`. De door de uitvoerder gedraaide 64 tests, typecheck, build, 50 HTTP-controles en Chrome-proeven zijn inhoudelijk beoordeeld; niet opnieuw gedraaid door de reviewer. De werkboom bleef schoon.

## Niet-blokkerend open punt

**Minor:** bij meer dan 400 tekens zonder witruimte geeft `summaryExcerpt` uitsluitend `…`. Onafhankelijk gereproduceerd met 401 tekens zonder spaties; bijvoorbeeld een lange Chinese of Japanse synopsis kan dit raken. De volledige tekst is wel lokaal opgeslagen en via de TVmaze-link bereikbaar. Locatie: `src/app/series-panel.tsx:16` op de beoordeelde commit. Uitgesteld, niet stilzwijgend opgelost door de afgesproken woordgrensregel te veranderen.

## Buiten beoordeling

- De live migratie, gewone synchronisatie en herstartproef van taak B volgen na deze review en zijn hier niet als voltooid aangemerkt.
- OAuth na dag zeven, agenda wisselen, serie verwijderen en volledige v1-herstelacceptatie blijven buiten dit increment.
- ISS-7 en de ontbrekende `origin/main` zijn bestaande administratieve beperkingen; geen bypass.
- Geen merge of wijziging aan andere diensten.

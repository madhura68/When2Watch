# IDEA-217 — PWA en prettiger seriebeheer

**Status:** voorstel ter beoordeling, 24 september 2026. Product When2Watch (`cmud1npa000rykh7rlhlhojd3`), idee `cmufkn23q01e0rp7r2aytjvtm`. Het uitvoeringsplan staat in `IDEA-217-uitvoeringsplan.md`; nog geen nieuwe sprint of bouwopdracht.

## Doel

JP wil When2Watch vanaf het beginscherm van zijn telefoon openen en de bestaande app prettiger gebruiken. Daarbij horen een herkenbaar icoon met de twee W’s, beter gebruik van de schermbreedte, series kunnen markeren als ‘Proberen’, statusfilters en lopende series bovenaan.

**Eerste zichtbare resultaat:** de bestaande app op max2 vanaf het beginscherm van een iPhone/iPad starten, met het gekozen icoon en een werkende Google-login. Daarna volgen het ruimere serieoverzicht en ‘Proberen’. De bestaande agenda blijft de landingspagina.

## Door JP bevestigd

- T-11 staat in de wacht totdat JP deze taak hervat. Eerst de app verder ontwikkelen; later beoordelen of PostgreSQL nodig is.
- De praktijkproef vindt eerst plaats op **iPhone/iPad**.
- Een serie met **Proberen** krijgt **dezelfde Google-agendasynchronisatie** als andere gevolgde series.
- De huidige kleuren blijven: groen `#176b60`, donkere tekst `#152e32` en lichte achtergrond `#f4f7f3`.

De bestaande max2-installatie met Prisma/SQLite is de basis. Voor dit idee is geen database- of hostingmigratie nodig. Een kleine aanvullende SQLite-schemamigratie voor de persoonlijke serievoorkeur is wel voorzien.

## Voorgestelde PWA

Een installeerbare webapp met een eigen naam, icoon en zelfstandig venster. De eerste versie vereist internet. Meldingen blijven afkomstig uit de gekoppelde Google-/Apple-agenda, volgens de al geteste instellingen.

Next.js ondersteunt een webmanifest in de bestaande App Router. Op iPhone kan de gebruiker de website via Safari aan het beginscherm toevoegen en als webapp openen. [Next.js PWA-handleiding](https://nextjs.org/docs/app/guides/progressive-web-apps), [Apple-installatiestappen](https://support.apple.com/nl-nl/guide/iphone/iphea86e5236/ios).

Het manifest krijgt een stabiele identiteit, `/` als startpagina en het appgebied als scope, plus kleuren en iconen voor gangbare formaten. Een Apple-touch-icoon hoort daarbij. Bestaande privécachingregels voor sessies, instellingen en agenda-inhoud blijven gelden.

De eerste praktijkproef omvat toevoegen aan het beginscherm, herkenbaar icoon, openen van Agenda, navigeren, Google-login en terugkeer naar de app, sluiten/heropenen en een nieuwe apprelease. De werking van login in het zelfstandige venster moet op het echte toestel worden aangetoond; een desktopsimulatie is daarvoor onvoldoende.

**Afweging:** deze online PWA is de kleinste stap naar het doel. Offline lezen vraagt aanvullende cache-, privacy- en verversingsafspraken. Een native app vraagt een afzonderlijke distributie. Beide worden voor dit increment uitgesteld. Er komt nu geen eigen pushdienst of offline wachtrij voor wijzigingen.

## Tien icoonrichtingen en JP's aanvullende voorstel

De vergelijking bij dit gesprek toont de tien richtingen in de bestaande kleuren, met een grote en kleine weergave van de geselecteerde variant. JP voegde tijdens de verkenning een elfde richting toe: een tv'tje met één W erin en een 2 erboven. Die staat als eerste in de vergelijking.

| Nr. | Richting | Kenmerk |
| --- | --- | --- |
| 01 | Tweeling | Twee helder leesbare W’s naast elkaar |
| 02 | Verweven | Twee W’s die diagonaal in elkaar grijpen |
| 03 | Ritme | Vier V’s in één doorlopende lijn |
| 04 | Agenda | Dubbele W in een kalender |
| 05 | Scherm | Dubbele W in een televisiescherm |
| 06 | Gestapeld | Een W voor When boven een W voor Watch |
| 07 | Monogram | Krachtige, geometrische lettervormen |
| 08 | Play | Twee W’s met een afspeelteken ertussen |
| 09 | Zachte golf | Afgeronde W’s als vloeiende lijn |
| 10 | Wijzerplaat | Dubbele W in een ronde tijdsaanduiding |
| 11 | W op tv | JP's voorstel: één W in het scherm, een 2 boven de tv |

**Gekozen door JP: 05 — Scherm.** De uitwerking met twee W's in een televisiescherm is door JP als SVG goedgekeurd. Variant 11 blijft als eerder verkend alternatief bewaard. De uitwerking en exports staan in [het icoonpakket](/Users/janpetervisser/Documents/ChatGPT/When2Watch/IDEA-217-icoon-05/README.md). Dit keuzeakkoord autoriseert de icoonuitwerking; het is nog geen opdracht om de app te deployen. Leesbaarheid en uitsnede op het echte beginscherm worden tijdens de PWA-proef gecontroleerd.

## Meer ruimte op Volgen

De huidige `main` is maximaal 840 pixels breed. Voor Volgen wordt de inhoud op een breed scherm circa 90% van de viewport. Langere tekst behoudt een leesbare regelbreedte.

Een brede serierij krijgt twee delen: links poster, titel, bronstatus en persoonlijke keuze; rechts seriedetails en komende afleveringen. Waar daarvoor onvoldoende ruimte is, staan de delen onder elkaar. Op de telefoon blijven vaste zijmarges en goed bedienbare knoppen belangrijker dan het percentage.

De bestaande uitklapbare details blijven herkenbaar. Afleveringsbeschrijvingen blijven standaard gesloten vanwege spoilers. De zoekgrens van vier tekens en de bestaande afbeeldingsfallback blijven behouden.

## Proberen, filters en volgorde

**Proberen is een persoonlijke keuze.** De bestaande status komt van TVmaze. Beide worden afzonderlijk opgeslagen en getoond: een serie kan bijvoorbeeld tegelijk ‘Lopend’ en ‘Proberen’ zijn. Een bronupdate mag de persoonlijke keuze niet overschrijven.

- Bij een zoekresultaat kies je **Volgen** of **Proberen** vóór toevoegen. Bestaande series krijgen standaard Volgen.
- In het serieoverzicht kan de eigenaar de keuze later aanpassen. De bestaande serie en agendakoppelingen blijven daarbij behouden; alleen het label verandert.
- Een bronstatusfilter biedt Alle, Lopend, Vervolg nog onzeker, Beëindigd en Status onbekend.
- Een tweede filter biedt Alle, Volgen en Proberen. Filters combineren, zodat bijvoorbeeld alleen lopende proefseries zichtbaar zijn.
- Filters veranderen alleen het zichtbare overzicht. Alle gevolgde series, inclusief Proberen, blijven synchroniseren.
- Standaardvolgorde: Lopend, Vervolg nog onzeker, Beëindigd, Status onbekend; binnen een groep alfabetisch op titel, met een stabiele tweede sorteersleutel.

Voor het persoonlijke onderscheid volstaat een klein opgeslagen veld. Een nieuw systeem met kijkvoortgang, beoordelingen, aanbevelingen of afleveringvinkjes is niet nodig.

## Uitwerking na akkoord

1. **PWA en icoon:** manifest, metadata en gekozen icoon; zo vroeg mogelijk de echte iPhone/iPad-proef op de bestaande installatie.
2. **Volgen:** breedte en indeling aanpassen; bij 390, 768, 1440 en 1920 pixels controleren op leesbaarheid, bediening en horizontale overloop.
3. **Persoonlijke keuze en filters:** databaseveld, eigenaargebonden toevoegen/wijzigen, weergave, gecombineerde filters en stabiele sortering. Beproef een bestaande serie, een nieuwe proefserie, bronstatuswijziging en herhaalde sync zonder nieuwe duplicaten.

De betrokken onderdelen zijn vooral `src/app/layout.tsx`, een nieuw manifest en iconen, `src/app/volgen/page.tsx`, `src/app/series-panel.tsx`, `src/app/globals.css`, `src/server/overview.ts`, de series-API en het Prisma-schema. Synchronisatie behoudt haar bestaande eventidentiteiten en eigendomscontroles.

Na akkoord volgt een zelfstandig uitvoerbaar plan en de bestaande Scrum4Me-materialisatiestap. T-11 blijft ondertussen in de wacht. Dit voorstel is geen deployment of hervatting van T-11.

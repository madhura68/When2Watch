# A2 — Seriebanners

Uitgevoerd op 24 september 2026 voor T-7 / ST-003. Code:
`790ed777b60fc068c3b3ff5feceb8b0d0d5c806e`.

## Broncontract en beperkte aanvragen

De ongewijzigde openbare response van
<https://api.tvmaze.com/shows/45039/images> staat in
`tests/fixtures/tvmaze/slow-horses-images.json`; bron en exacte ophaaltijd staan in
het naastgelegen `slow-horses-images-source.json`. De response heeft 24 beelden,
waarvan drie banners. Geen van die drie heeft `main: true`. De vaste keuze is
afbeelding 1472065, met de geleverde medium-URL.

De [TVmaze-documentatie](https://www.tvmaze.com/api#show-images) beschrijft het
images-endpoint en de resoluties. De parsertests gebruiken de echte veldvorm.
Afgeleide testvarianten dekken hoofdbeeld, volgorde, ontbrekend medium, geen
banner, ongeldige lijst en onveilige URL.

De bestaande bronvertraging en beperkte 429-herhaling worden hergebruikt.
Succes (ook geen banner) wordt zeven dagen bewaard; bronfouten behouden de oude
keuze en plannen een controle na 24 uur. Alleen toevoegen/synchroniseren
controleert de termijn. Pagina's doen daarvoor geen bronaanvraag.

## Browserbewijs

Een lokale proef met het werkelijke `SeriesBanner`-component en SSR gaf:

- Vóór hydration was een 404-afbeelding al `complete: true, naturalWidth: 0`.
  Na hydration verscheen de algemene SVG (naturalWidth 900).
- Een andere 404 na hydration gaf dezelfde fallback.
- Een daarop gekozen echte Slow Horses-URL laadde wel (naturalWidth 758).
- Zonder URL verscheen direct de algemene banner.
- Beide defecte adressen werden elk eenmaal aangevraagd; geen retrylus.
- De banner en kaartinhoud zijn op desktop en 375 px gecontroleerd.

De proefserver gebruikte alleen tijdelijke lokale testdata en is gestopt.

## max2

Vorige release: `b2e4de9`; nieuwe release/image: `790ed77`.
Consistente private SQLite-backup vóór activatie:
`/srv/apps/when2watch/db-backups/pre-790ed77-20260924T111458208921Z.db`
(0600, integrity ok). Vóór synchronisatie zijn alle bestaande kolommen en
rijaantallen ongewijzigd teruggelezen na de toevoegende migratie.

Eén normale synchronisatie via Volgen gaf: **0 toegevoegd, 0 bijgewerkt,
0 opgeruimd, 11 ongewijzigd**. De elf mappingrecords inclusief payloads en hashes
zijn identiek gebleven. Ook de 170 afleveringen zijn ongewijzigd. Er staan nu
drie bannerkeuzes en zes lege keuzes, alle met controletermijn zeven dagen later.
Alleen de verwachte seriecontrolemomenten en één SyncRun veranderden.

Agenda toont Slow Horses met echte banner en Lanterns met algemene banner.
Desktop en 375 px zijn visueel gecontroleerd; breedte en scrollbreedte zijn beide
375 px, spoilers blijven gesloten. Herladen behoudt de keuzes. Bestaande sessie
en periode blijven werken. Container healthy en publieke HTTPS-health HTTP 200.
`current` verwijst na deze controles naar `790ed77`.

## Automatisch bewijs

104 tests, typecheck, productiebuild en 83 HTTP-controles geslaagd.
SQLite-tests controleren de zeven-dagen-/24-uursgrenzen, heropening en
migratiebehoud. Een bannerfout blokkeert Calendar niet; een gewijzigde banner
verandert geen event-ID/payload/hash en veroorzaakt nul Google-writes.
Herhaalde overzichtsreads veroorzaken nul bronaanvragen.

Scrum4Me-logs zijn bijgewerkt. De taakstatus wordt nog geblokkeerd door de
bestaande ISS-7; geen statusbypass toegepast. A2 is functioneel afgerond;
de volgende taak is de afzonderlijke echte Google-configuratieproef B0.

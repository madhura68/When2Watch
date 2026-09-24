# When2Watch — oplevering posters en seriedetails

24 september 2026 · Sprint S-2026-09-24-1 · Story ST-002

**T-4 en T-5 zijn inhoudelijk uitgevoerd en live op [When2Watch](https://when2watch.jp-visser.nl).** De administratieve taakstatussen en sprint blijven open doordat de bekende MCP-storing ISS-7 het bijwerken van taakstatussen blokkeert. Alle uitvoering, commits en controles zijn wel gelogd; geen bypass.

## Wat beschikbaar is

- Posters bij gevolgde series, met vaste beeldruimte en fallback. JP heeft de posterproef goedgekeurd.
- ‘Over deze serie’ met korte synopsis, genres en speelduur; lange synopsis verwijst naar TVmaze.
- Afleveringsbeschrijvingen achter ‘Beschrijving (spoilers)’, standaard gesloten en alleen aanwezig als TVmaze tekst levert.
- Details komen uit de lokale database; zoeken blijft vanaf vier tekens en bestaande synchronisatie vult de informatie aan.

## Werkelijk bewijs

| Controle | Resultaat |
|---|---|
| Unit-/integratietests | 64/64 geslaagd |
| Typecheck / productiebuild | Geslaagd |
| Echte Next/SQLite HTTP-controles | 50/50 geslaagd |
| Chrome desktop en 375 px | Poster/fallback, tekst, toetsenbordfocus, gesloten details, geen horizontale scroll |
| Migratie | Bestaande kolommen van negen productietabellen ongewijzigd; vooraf consistente backup met integriteitscontrole |
| Gewone live synchronisatie | 9 series gevuld; 0 agenda-items toegevoegd/bijgewerkt/verwijderd, 11 ongewijzigd, 0 fouten |
| Herstart | Metadata, serie- en agendakoppelingen gelijk; bestaande sessie werkt; geen extra synchronisatie |
| Onafhankelijke review | GO; 0 blokkerende bevindingen |

Bij Slow Horses zijn de drie genres en circa 45 min. aanwezig. De volledige synopsis heeft 451 tekens. Eén van de vier komende afleveringen heeft een beschrijving; de overige drie tonen de lege toestand.

## Releases en herstel

Posters: `2153d945fb6527837a466a4d901388f19b329439`.

Details en huidige productie: `b31af0565eda836f5a784549e20fef739a7eae03`. Container healthy, HTTPS health 200; image, `current` en `RELEASE_TAG` gelijk. Alleen When2Watch op max2 gewijzigd. Oude releases, configuraties en privébackups blijven beschikbaar. Geen merge uitgevoerd.

## Open punten

- **Klein weergavepunt, uitgesteld:** een synopsis van meer dan 400 tekens zonder witruimte toont alleen ‘…’. De volledige tekst blijft lokaal en via de TVmaze-link beschikbaar.
- **Administratie:** ISS-7 (`tasks.dispatch_request_id` ontbreekt) verhindert statuswijzigingen. `origin/main` ontbreekt; de MCP-codeverificatie is daarom niet als geslaagd opgevoerd. Acceptatie is met tests, onafhankelijke review en praktijkbewijs gecontroleerd.
- Eerder afgesproken onderwerpen buiten dit increment, waaronder OAuth-gebruik na dag zeven, blijven buiten deze oplevering.

De volledige technische onderbouwing staat in `docs/praktijkproef.md`; de onafhankelijke review in `docs/IDEA-216-review-posters-en-seriedetails.md`.

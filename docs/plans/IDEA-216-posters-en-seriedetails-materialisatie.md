---
title: "IDEA-216 — Materialisatie posters en seriedetails"
status: active
version: "0.1"
last_updated: "2026-09-24"
---

# IDEA-216 — Materialisatie posters en seriedetails

Het goedgekeurde plan is op 24 september 2026 vastgelegd als onderstaande sprint, PBI, story en twee taken. De productcode en productie-app zijn tijdens deze fase niet gewijzigd. De voorgeschreven hardstop na materialisatie is bereikt.

| Onderdeel | Code / naam | ID |
|---|---|---|
| Sprint | S-2026-09-24-1 | cmufa5zyl004hgo177u01hskb |
| PBI | PBI-2 — Posters en compacte seriedetails | cmufa6qxo004igo170quj8kdx |
| Story | ST-002 — Als JP herken ik mijn series en bekijk ik details zonder spoilers of extra zoekverkeer | cmufa6r0d004kgo17e7jm6b7x |
| Taak A | T-4 — Toon posters bij gevolgde series en beproef ze op max2 | cmufa9pd3004lgo175gk4hsma |
| Taak B | T-5 — Bewaar seriedetails lokaal en toon beschrijvingen zonder spoilers | cmufady5f004mgo17xw6b2gfe |

Beide taken staan op `todo`. Taak A levert de posterweergave en de eerste max2-proef. Taak B levert lokale metadata en uitklapbare beschrijvingen; de uitrol volgt na de vastgelegde posterproef en JP-beoordeling van A.

## Bronnen en controles

- JP's goedkeuring: “akkoord, voer uit”.
- Plan: `docs/plans/IDEA-216-posters-en-seriedetails.md`, versie 0.2. Deze revisie voegt uitsluitend de goedkeuringsregistratie toe aan versie 0.1.
- ProductDoc cmuf9xpjn003lgo17opd0pyzd, revisie 2 cmufa5zru0042go17pyuwbum6, hash `c3d5664692e5a05367126006d7ad9bb15973e40d10fe66158d9ba45905df9aec`; de PBI is aan precies deze revisie gekoppeld.
- Codebasis `d13cad016474cf9d0f84a063d64d51aa74262de8`; vooraf gelezen plancommit `0f0714aad6f30627c7844c86dd908fbc4d6b18a0`.
- Beide volledige taakplannen zijn via `update_task_plan` opgeslagen en via `get_sprint_context(task_id)` exact teruggelezen: A 5355 tekens, B 7976 tekens. Bestanden, interfaces, bronrevisies, grenzen en eigen acceptatie staan in iedere taak.
- De MCP accepteert maximaal 8000 tekens bij `create_task.implementation_plan`. Een eerste te lange invoer is vóór schrijven geweigerd. De uiteindelijke plannen passen zonder verlies van eisen; er zijn precies twee taken aangemaakt.
- `verify_task_against_plan` is voor A aangeroepen en faalt op het ontbreken van `origin/main`. Dezelfde repositoryvoorwaarde geldt voor B, dus geen herhaling van dezelfde mislukte controle. Dit is geen geslaagde codeverificatie; er is nog geen implementatie. De bron en taakinhoud zijn wel via teruglezen gecontroleerd.
- ISS-7 (cmuf74alx000wgo170rwti8uk) staat nog open. Taakaanmaak en planopslag werken; statuswijzigingen zijn hier niet opnieuw geprobeerd en er is geen bypass toegepast.

## Faseovergang

De hardstop komt uit JP's AGENTS-afspraak, plan §8 en het materialisatiedeel van [review-loop](/Users/janpetervisser/.agents/skills/review-loop/SKILL.md): “then **hardstop** — composing is not executing”.

De volgende opdracht kan de uitvoering starten met T-4, gevolgd door T-5. Bestaande When2Watch-productietoestemming blijft gelden; er is geen autorisatie toegevoegd voor andere systemen.


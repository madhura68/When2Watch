# S-2026-09-24-4 — lokale uitvoering en open praktijkproeven

Datum: 24 september 2026. Branch `codex/when2watch-pwa`; basis `799d88a70cc7326ca0fba18874698a9ff0bfef50`; gereviewde code `41a8b9540be089af8326b434e83463eb4d0506fd`.

## Opgeleverd in code

| Taak | Commit | Resultaat | Open bewijs |
| --- | --- | --- | --- |
| T-13 | 7068455 | Online PWA, icoon Scherm, manifest, Apple-touchmetadata | Geautoriseerde uitrol en echte iPhone/iPad-installatie/login/heropenen/uitloggen |
| T-14 | fed05a5 | Volgen gebruikt breed scherm, headers/details naast elkaar, mobiel gestapeld | Nieuwe UI zichtbaar in eerder geïnstalleerde PWA na release |
| T-15 | beade63 | Proberen opslaan/toevoegen/wijzigen; toevoegende SQLite-migratie | Productie-upgrade na backup bij latere geautoriseerde uitrol |
| T-16 | 41a8b95 | Gecombineerde filters, aantallen/reset, lopende series eerst | JP-proef met serie en echt ontvangen agenda-melding |

## Verificatie

- Schone basis: 141 tests geslaagd.
- PWA-HTTP-controle eerst rood door ontbrekend manifest; groen na implementatie.
- Nieuwe trying-sync-tests eerst rood doordat de voorkeur ontbrak; groen na implementatie. PATCH-HTTP-controle eerst rood doordat de route ontbrak; groen na implementatie.
- Filtertests eerst rood door ontbrekende helper, daarna 9/9 groen.
- Definitieve code: **153 tests in 19 bestanden**, typecheck, productiebuild en **154 HTTP-asserties** geslaagd.
- Browserproef met echte lokale Next/SQLite en synthetische eigenaarsessie: **171 asserties** totaal. Echte PATCH, herladen, mislukte PATCH, bewaarde én zichtbare keuze; AND-filters, lege lijst, herstel, filteren zonder sync, sync met lege zichtbare lijst zonder beperkte selectie; Proberen-knop verzendt trying=true.
- Browsergeometrie en screenshots op 390, 768, 1440 en 1920 pixels; geen horizontale overloop, lange titel/fout/ontbrekende poster/geen afleveringen. Desktop- en telefoonscreenshots visueel beoordeeld. Agenda en Instellingen houden hun begrensde breedte.
- In browserproef zijn externe hosts geblokkeerd. Zoeken en toevoegen/synchroniseren zijn voor UI-contractcontrole afgevangen; echte synchronisatielogica is afzonderlijk met echte SQLite en gesimuleerde providers getest. Dit is geen echte Google- of iPhone-proef.
- Tijdelijke HTTP-processen en testdatabases zijn door de testharness opgeruimd.

## Onafhankelijke review

Reviewer `review_pwa_sprint` heeft diff, omliggende auth/sync/cachecode en tests read-only gecontroleerd.

**Geen Critical of Important bevindingen. Verdict: ready for code integration.** Dit is geen merge/deploymenttoestemming en geen sprintacceptatie.

Eén niet-blokkerende testverbetering uitgesteld: de retrytest bewijst sequentiële wijzigingen, geen daadwerkelijke interleaving van voorkeurwijziging met een lopende providerfetch. Inspectie toont dat sync/artwork uitsluitend expliciete metadata-velden wijzigen en trying niet overschrijven. Het restrisico is dat een toekomstige verbreding van die updates zonder extra interleavingtest minder gericht wordt gedetecteerd.

De reviewer kon echte iPhone-installatie/login/logout/update, echte Calendar-wijzigingen/melding en productie-upgrade niet beoordelen; die blijven expliciet open. Browsergedrag is apart met de hierboven beschreven proef gecontroleerd.

## Uitvoeringskeuzes

- Native worktree-tool kon vanuit de documentmap geen HEAD vinden. De eigen worktree is daarom met Git aangemaakt vanuit de gecontroleerde repository; geen productscopewijziging.
- De eerste statusaanroep had per ongeluk expected_status zonder gekoppelde ppe-context. Brononderzoek bevestigde de normale interactieve route; de gecorrigeerde ondersteunde aanroep werd geaccepteerd. Geen autorisatiecontrole omzeild.
- Responsieve CSS is met browsermetingen en screenshots gecontroleerd, zonder tests die alleen de CSS-tekst nabootsen. Uitsneden op echte iOS-apparaten moeten nog worden beoordeeld.
- Vier historische migratietests gebruikten de nieuwste Prisma-insert tegen een oud schema. Seeding gebruikt nu historische SQL. Alle bestaande behoudsasserties blijven staan; de banner-cache-runtimeproef brengt daarna zijn fixture op het huidige schema. Kosten/risico: deze fixture-aanpassing moet bij toekomstige verplichte kolommen opnieuw bekeken worden.

## Grenzen en volgende stap

PWA-only release `7068455` is concreet voorbereid; uitroltoestemming is bij JP gevraagd en nog niet ontvangen. De rest van de code bevat een SQLite-migratie en hoort bij een afzonderlijk gecontroleerde vervolgrelease. Voor de migratie: consistente backup, normale migrate deploy, nooit reset. Een approllback behoudt de toegevoegde kolom.

T-11 blijft in de wacht. Geen push, merge of deployment uitgevoerd. Alle bouwtakken en bewijsmateriaal blijven bewaard. De sprint blijft open totdat de vereiste praktijkproeven zijn bevestigd.


---
title: "IDEA-241 Verkenning van de volwassen When2Watch app"
status: draft
date: "2026-10-07"
idea: IDEA-241
last_updated: 2026-10-08
---

# IDEA-241 Verkenning van de volwassen When2Watch app

Werkdocument voor JP. Revisie 1 (7 oktober 2026) legde de richting en open vragen vast. Revisie 2 (8 oktober 2026) voegt de veertien besluiten uit de grill-sessie toe, past de eerdere tekst daarop aan en legt de bouwvolgorde vast. Revisie 3 (8 oktober 2026) corrigeert de aanname over het syncvenster na codeonderzoek voor [specs/idea-241-stap-1](../specs/IDEA-241-stap-1.md). Dit is nog geen specificatie, uitvoeringsplan of uitvoeringsopdracht. Deze repo-kopie is gelijk aan ProductDoc GRILLS/idea-241-verkenning revisie 3.

## Uitgangspunt: de live R2-basis

De basis voor dit idee is `origin/main`, waarop IDEA-219 R2 sinds 26 september 2026 in productie draait: PostgreSQL, gedeelde TVmaze-catalogus (`CatalogShow`, `CatalogEpisode`, `UserFollow`), uitnodigingen en admin, versleutelde Google-tokens, `CalendarBinding` met aanmaakbewijs (`APP_CREATED` / `LEGACY_UNVERIFIED`), voorkeuren (`agendaMonths`, `timeZone`), privacypagina en de Google-scopes `calendar.app.created` + `calendar.calendarlist.readonly`. De UI is Nederlands met tabs Agenda, Volgen, Instellingen (en Beheer, Statistiek voor de admin). De sync werkt met een venster: alleen afleveringen met een datum vanaf de lokale datum min 7 dagen worden aangemaakt, gewijzigd of verwijderd (`src/server/sync.ts:131-133`, `:209-233`); oudere afspraken blijven staan zoals ze zijn. Revisie 2 stelde ten onrechte dat alle gedateerde afleveringen, ook uit het verleden, worden geschreven; bij de R2-omschakeling ging het om 28 links op 834 catalogusafleveringen.

Uit de R2-oplevering staat voor JP nog open: opnieuw inloggen, een nieuwe When2Watch-agenda aanmaken en daarnaar overstappen, een eerste sync en een werkelijk ontvangen melding met de smalle scopes (T-27 op review). Dat is een voorwaarde voor stap 1 hieronder.

## Doel en eerste bruikbare resultaat

JP wil een gratis, Engelstalige app waarmee gebruikers maximaal 100 TV-series volgen via hun Google-agenda. De gebruiker wil weten wanneer een aflevering oorspronkelijk verschijnt en waar de serie te zien is.

De eerste doelgroep bestaat uit kennissen die de app enkele maanden op uitnodiging gebruiken. Zelfregistratie komt later. De Google-koppeling moet buiten de beperking tot vooraf ingestelde Google-testgebruikers kunnen werken.

Het eerste bruikbare resultaat van IDEA-241 is stap 1 van de bouwvolgorde: een Engelstalige app met landingpagina en privacybeleid, een verrijkt afspraakmodel, een op het iPhone vastgelegde melding van een proefevent, en een OAuth-consent in Production zodat een eerste genodigde zonder testgebruikerslijst kan koppelen.

## Besluiten uit de grill van 8 oktober 2026

Alle besluiten staan ook als DECISION-regels in de tijdlijn van IDEA-241.

| Nr | Onderwerp | Besluit |
| --- | --- | --- |
| 1 | Agendatoegang | R2-model blijft: alleen door When2Watch aangemaakte agenda's (`APP_CREATED`). Geen hergebruik van handmatig aangemaakte agenda's en dus geen bredere scope. Naamconflict met een niet-app-agenda: andere naam vragen. |
| 2 | Google-verificatie | Twee stappen. Eerst OAuth-consent naar Production zonder verificatie zodra de smalle scopes bewezen zijn (waarschuwingsscherm, grens 100 gebruikers, geen 7-dagen-tokenverval; aankondigen in de uitnodigingstekst). Daarna brand- en sensitive-scope-verificatie indienen op `when2watch.jp-visser.nl` zodra landingpagina en Engels privacybeleid live zijn. Latere verhuizing naar Vercel is een nieuw geautoriseerd domein, geen reden om te wachten. |
| 3 | Indeling Volgen | Beëindigd (`Ended`-tab) uitsluitend bij TVmaze-status `Ended`, met laatste aflevering en einddatum. Alle andere statussen onder Lopend; zonder bekende volgende datum "next date not announced", bij `To Be Determined` "renewal undecided", plus aantal aangekondigde afleveringen zonder datum. Geen tijdsdrempel. |
| 4 | Tweede bron TMDB/JustWatch | TMDB-ID per catalogusserie via `/find` op TVmaze `externals.imdb`, anders `externals.thetvdb`; geen of meerdere treffers: geen aanbieders, geen titelmatching, nieuwe poging alleen in de wekelijkse volledige controle. Eén tabel per serie × land met samengevoegde, op provider-ID ontdubbelde aanbieders (naam, provider-ID, logopad), TMDB-watchlink en `fetchedAt`. Alleen landen die minstens één volger heeft gekozen; verversen in de dagelijkse catalogusrun voor series met actieve volgers. Oorspronkelijke aanbieder blijft TVmaze `network`/`webChannel` op serieniveau. |
| 5 | Logo's en beeld | Alleen `logo_path` opslaan; logo klein via de TMDB-CDN tonen, naam als tekst bij laadfout. Seriebeeld blijft uitsluitend TVmaze. Aanbiedersrijen die langer dan 6 maanden niet ververst zijn worden opgeruimd (TMDB-cachegrens). |
| 6 | Verrijkte afspraak | Titel `Show · S03E04 · Episode title` zonder aanbieder. Locatie: regionale aanbieders voor het land van de gebruiker (`Netherlands: Netflix, Videoland`), leeg als onbekend. Beschrijving in het Engels met oorspronkelijke aanbieder, link naar de When2Watch-seriepagina, TVmaze-afleveringslink en bronregels (TVmaze; "Watch availability: JustWatch via TMDB"). Alleen afspraken van afleveringen vanaf vandaag volgen tekst- en aanbiederswijzigingen; eerdere afspraken zijn bevroren (alleen verwijderen als de aflevering uit de bron verdwijnt). **Correctie revisie 3:** het bestaande venster van 7 dagen dekt dit al; de spec van stap 1 stelt voor dat venster ongewijzigd te laten in plaats van een aparte "vanaf vandaag"-regel toe te voegen (ter bevestiging door JP). |
| 7 | Afspraakvorm | Eén voorkeur per gebruiker: All-day (standaard) of Fixed time in de eigen tijdzone; niet per serie. Duur bij vast tijdstip: TVmaze `runtimeMinutes`, anders 60 minuten. Afspraak blijft vrij; herinneringen via Google-standaard. Wisselen herschrijft alleen afspraken vanaf vandaag. |
| 8 | Onboarding | Engelstalige `/welcome`-reeks: Sign in with Google → Connect your calendar (tweede consent, met uitleg over het waarschuwingsscherm) → Calendar name (standaard When2Watch) → Region (standaard Netherlands) en event style (standaard All-day) → Add your first series. Voortgang afgeleid uit bestaande data, geen wizard-tabel. Startpagina stuurt naar de ontbrekende stap. Login en agendatoestemming blijven gescheiden. |
| 9 | Navigatie | Agenda (start) · Search · Following · Settings, plus Admin en Stats voor de beheerder. Search: zoeken en toevoegen met Follow/Try; bij 100 series knoppen uit met "Limit reached (100). Unfollow a series to add another." Following: tabs Running en Ended met teller `n / 100`; Proberen blijft als `Trying`-label en filter binnen Running; de statusfilter vervalt. Compacte rij: poster, titel, oorspronkelijke aanbieder, maximaal drie regionale logo's, volgende release of einddatum, Trying-label. Uitgeklapt: samenvatting, genres, looptijd, alle regionale aanbieders met landnaam en JustWatch/TMDB-vermelding, TVmaze-link, syncstatus, Trying-schakelaar, Unfollow. |
| 10 | Engels | Alles in één keer: UI, serverfoutmeldingen, privacypagina, uitnodigings- en adminpagina's, manifest, agenda-afspraken, `lang="en"`. Geen i18n-laag. Opmaak `en-GB`, 24-uurs, tijdzone van de gebruiker. Engelse routes (`/search`, `/following`, `/settings`, `/invitation`, `/admin/users`, `/admin/series`) met tijdelijke redirects. Privacypagina herschreven met TMDB/JustWatch, landvoorkeur, aanbiedersgegevens en TMDB-notice. |
| 11 | Landingpagina | De onaangemelde `/` wordt de Engelse landingpagina: drie stappen, "Access is by invitation for now", Sign in with Google, verwijzing naar de ontvangen uitnodigingslink, geen wachtlijst. Bronvermelding TVmaze, TMDB-logo met notice, JustWatch. Footer: Privacy en contact. Openbaar zonder login: alleen `/`, `/privacy`, `/invitation`. |
| 12 | Regio | ISO-landcode in `UserPreferences`, standaard `NL`; Engelse landnaam in afspraaklocatie en uitgeklapte rij. Keuzelijst = TMDB-regio's, dagelijks gecachet. Bij landwissel direct aanbieders ophalen voor gevolgde series; daarna dagelijkse run. |
| 13 | TMDB-toegang | Read-access-token als omgevingsvariabele in `.env` op max2. Zonder sleutel: functie uit, health meldt "providers: disabled". Bij storing: bestaande aanbieders behouden met "as of <datum>", volgende dag opnieuw, geen foutmelding naar de gebruiker. Eén centrale client met pauze en retry; aanroepen tellen mee in de admin-statistiek. |
| 14 | Bouwvolgorde | Zie onderstaande sectie. |

## Bouwvolgorde

0. **R2 afronden** (voorwaarde, geen IDEA-241-werk): JP's agenda-overstap naar een `APP_CREATED`-agenda, eerste sync en een werkelijk ontvangen melding met de smalle scopes.
1. **Engels + afspraakmodel + landing + privacy**: alle teksten Engels; titel, beschrijving, locatieveld en vaste-tijd-voorkeur in de sync; bestaande proefroute uitgebreid met locatie en vaste tijd. **Eerste praktijkbewijs**: één `[W2W TEST]`-proefevent met locatie en vaste tijd in JP's app-agenda, melding op iPhone vastgelegd (toont de melding de locatie?). Daarna OAuth naar Production zonder verificatie en de eerste genodigde. Specificatie: [specs/idea-241-stap-1](../specs/IDEA-241-stap-1.md).
2. **Verificatie indienen** direct na stap 1, parallel aan de verdere bouw. Demo-video toont consent, agenda aanmaken en een afspraak.
3. **TMDB-aanbieders**: model, client, catalogusrun, regio-voorkeur, aanbieders in de bestaande lijst en in de afspraaklocatie.
4. **Navigatie**: Search, Following met Running/Ended, compacte rijen, teller, Engelse routes.
5. **Onboarding `/welcome`**.

## Toegang en agendakeuze

- Toegang tot When2Watch blijft op uitnodiging.
- De app stelt de agendanaam **When2Watch** voor. De gebruiker mag een andere naam invullen.
- Er wordt geen agendalijst aan de gebruiker getoond. Interne naamcontrole via de agendalijst is toegestaan.
- Alleen een door When2Watch aangemaakte agenda (`APP_CREATED`) wordt gebruikt. Bestaat er al zo'n agenda voor dit account, dan wordt die hergebruikt; anders maakt de app er een aan. Een gelijknamige agenda zonder aanmaakbewijs krijgt geen koppeling; de app vraagt een andere naam (besluit 1).
- Na koppeling bewaart de app het agenda-ID. De naam is de zichtbare keuze; het ID identificeert de agenda bij latere acties.
- De app beheert uitsluitend eigen When2Watch-afspraken.

De eerdere passage over hergebruik van een handmatig aangemaakte agenda met lees- en schrijfrechten vervalt. Dat zou `calendar.events` (toegang tot alle agenda's) vereisen en de verificatie zwaarder maken. De scopes blijven `calendar.app.created` en `calendar.calendarlist.readonly`. Zie [Google Calendar-rechten](https://developers.google.com/workspace/calendar/api/auth).

## Releasedatum en meldingen

- De oorspronkelijke releasedatum van **iedere aflevering** bepaalt de agendadatum.
- De gekozen regio verandert die releasedatum niet.
- De gebruiker kiest per account een hele-dagafspraak of een vast tijdstip in de eigen tijdzone (besluit 7). Deze instelling is later aanpasbaar.
- Herinneringen worden geregeld via de instellingen van Google Agenda. When2Watch krijgt geen eigen meldingsinstelling in deze versie.
- De afspraak vermeldt de oorspronkelijke aanbieder in de beschrijving en de regionale aanbieders in de locatie (besluit 6).

De oorspronkelijke aanbieder is de TVmaze `network` of `webChannel` op serieniveau, zoals die nu al in de catalogus staat. Seizoenshistorie wordt niet bijgehouden.

TVmaze is de bron voor oorspronkelijke afleveringdata. Die volgen het premierebeleid van TVmaze, inclusief uitzonderingen voor seizoenconsistentie en de oorspronkelijke opdrachtgever. We beloven daarmee niet zonder meer de absoluut vroegste wereldwijde vertoning. Zie [TVmaze-afleveringsbeleid](https://www.tvmaze.com/faq/15/episodes).

## Volgen en dagelijkse weergave

Alle gevolgde series tellen mee voor de grens van 100 per gebruiker, inclusief beëindigde series en series met Trying. Ontvolgen is altijd mogelijk en maakt ruimte. Een favorietencollectie hoort niet bij deze versie.

Bij ontvolgen worden toekomstige eigen When2Watch-afspraken voor de serie verwijderd en stopt de verdere synchronisatie voor die gebruiker en serie. Eerdere afspraken blijven als agendahistorie staan. Een serie die door iemand anders wordt gevolgd, blijft voor die andere gebruiker gewoon synchroniseren.

Navigatie, tabindeling, compacte rij en uitgeklapte details staan in besluit 9; de indeling Running/Ended in besluit 3. Er komt geen onderscheid in abonnement, gratis, huren of kopen: aanbieders worden samengevoegd tot één lijst, ontdubbeld op provider-ID.

## Bronnen en regio

De regio is een persoonlijke landkeuze (besluit 12): landcode in de voorkeuren, standaard Netherlands, keuzelijst uit de TMDB-regio's. Automatische locatiebepaling is niet nodig.

TVmaze blijft de bron voor zoeken en voor de dagelijkse catalogusupdate, gedeeld over gebruikers (R2).

TMDB met JustWatch-gegevens is de tweede bron voor regionale aanbieders (besluit 4). Koppelen gebeurt via het IMDb-ID, anders het TheTVDB-ID uit de TVmaze-`externals`. Bij ontbrekende of meerdere treffers wordt geen aanbieder gegokt. Zie [TMDB koppelen via externe ID](https://developer.themoviedb.org/reference/find-by-id), [aanbieders per serie](https://developer.themoviedb.org/reference/tv-series-watch-providers) en [ondersteunde regio's](https://developer.themoviedb.org/reference/watch-providers-available-regions).

Gecontroleerde TMDB-voorwaarden (8 oktober 2026): gratis gebruik alleen niet-commercieel; cache maximaal 6 maanden; TMDB-logo plus de notice "uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB"; bij aanbiedersdata verplichte vermelding van JustWatch als bron. Logo's worden niet lokaal opgeslagen maar via de TMDB-CDN getoond (besluit 5). Zie [TMDB API-voorwaarden](https://www.themoviedb.org/api-terms-of-use).

TVmaze documenteert dat afbeeldingen via zijn CDN kunnen worden getoond en gecachet. Seriebeeld komt uitsluitend van TVmaze. Zie [TVmaze-afbeeldingen](https://www.tvmaze.com/api#images) en [copyrightbeleid](https://www.tvmaze.com/site/copyright).

## Verrijkte afspraak en vroege meldingsproef

Het afspraakmodel staat in besluit 6; de proef is stap 1 van de bouwvolgorde. Google ondersteunt titel, locatie, beschrijving en een bronlink; de Calendar API heeft geen instelbaar veld voor een eigen banner in de notificatie. Welke afspraakgegevens in de melding zichtbaar zijn, moet op het doeltoestel worden waargenomen. Zie [Google Event-velden](https://developers.google.com/workspace/calendar/api/v3/reference/events).

Onderstaand voorbeeld is volledig fictief. De TEST-markering voorkomt verwarring met een echte aflevering.

| Veld | Proefinhoud |
| --- | --- |
| Titel | `[W2W TEST] Example Show · S01E01 · Example episode` |
| Locatie | `Netherlands: Example service A, Example service B` |
| Beschrijving | `Notification test only — not a real episode.` Daarna "Originally on Example broadcaster", een link naar de app en de bronregels. |
| Datum en tijd | Bij uitvoering afspreken; vaste tijd in de tijdzone van JP, duur 60 minuten. De hele-dagvorm is al bewezen in IDEA-216. |
| Herinneringen | De bestaande agenda-instellingen gebruiken. |
| Identiteit | Eigen unieke proefevent-ID en When2Watch-proefmarkering bewaren. |

De proef omvat het volgende:

1. Controleer het actuele account en de exacte doelagenda (`APP_CREATED`) voordat een proefitem wordt geschreven.
2. Maak één herkenbaar proefitem en lees de opgeslagen inhoud terug. Een onzekere respons leidt tot terugzoeken op hetzelfde event-ID, niet tot een nieuwe blinde aanmaak.
3. Bekijk titel, locatie, beschrijving en link in de agenda op het doeltoestel.
4. Wacht op de ingestelde melding en leg vast: toestel, agenda-app, feitelijke ontvangsttijd, zichtbare titel, zichtbare locatie en eventuele afkapping. API-readback bewijst geen ontvangen melding.
5. Ruim uitsluitend het eigen gemarkeerde proefitem op en controleer de uitkomst.

`src/server/calendar-probe.ts` maakt nu een vaste hele-dagproef met vaste titel en beschrijving; het `CalendarEvent`-type heeft nog geen locatieveld en geen tijdgebonden variant. Beide komen in stap 1.

## Google-productiestatus

Besluit 2 legt de route vast. Voor de verificatie horen een openbare productpagina (besluit 11), een Engels privacybeleid op hetzelfde domein (besluit 10), bewezen domeinbezit via Search Console, een Engelse unlisted demo-video van de consentflow en een motivatie per scope bij de voorbereiding. Zie [Google-verificatie en uitzonderingen](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification).

De actuele Cloud Console-configuratie is in deze verkenning niet gewijzigd. Het hostingadres en de loginredirect moeten bij een latere verhuizing opnieuw op elkaar aansluiten.

## Overige richting en toekomst

De app wordt geheel Engelstalig (besluit 10). PWA-gebruik hoort bij deze versie; VAPID-meldingen nog niet.

Later volgen mogelijk Vercel en Neon, zelfregistratie, native iOS/Android-apps en directe meldingen via VAPID of APNs. Deze onderwerpen behoren niet tot de eerste besloten gebruikersproef.

## Nog te verduidelijken

Opgelost in de grill van 8 oktober: de rij zonder volgende releasedatum (besluit 3), het naamconflict (besluit 1), beeldrechten en cachevoorwaarden (besluit 5) en de verificatieroute (besluit 2).

Nog open:

- Toont de iOS-melding het locatieveld? Wordt waargenomen in de proef van stap 1; bepaalt of de aanbieders in de melding zichtbaar zijn of alleen in de afspraak.
- Werkelijke Nederlandse dekking en matchkwaliteit van TMDB/JustWatch voor de nu gevolgde series. Te meten met een leesproef op de bestaande catalogus vóór stap 3; bij tegenvallende dekking is de fallback "Where to watch: unknown" zonder tweede bron.
- Status van de R2-afronding (stap 0, T-27): nog niet in deze verkenning gecontroleerd.
- Bewaking van de grens van 100 gebruikers in de onverifieerde Production-fase: wie telt mee, en wat gebeurt er als de verificatie langer duurt dan de proef.
- Bevestiging van JP op de afwijking in de spec van stap 1: syncvenster van 7 dagen ongewijzigd laten in plaats van een aparte "vanaf vandaag"-bevriesregel. (Gegeven op 8 oktober 2026; zie spec §2.)

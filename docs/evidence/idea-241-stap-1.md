# IDEA-241 stap 1 — bewijs en acceptatie

Status 8 oktober 2026: **P1–P8 gebouwd en lokaal geverifieerd; uitrol en praktijkbewijs van deze release staan OPEN.** Geen merge, deploy, Google-writes of Cloud-Console-wijziging uitgevoerd vanuit deze sprint. PR/CI en definitieve review worden in het opleveringsverslag vastgelegd.

Bronnen: spec v0.6, plan v0.3; baseline `e2ce00c` (gemerged documentatie-PR #13, code identiek aan `1554c6a`). Scope: Engels, eventstijl, publieke landing/privacy, proefevent en consentvoorbereiding. TMDB/JustWatch-productdata, Search/Running/Ended-navigatie en verificatie-indiening horen bij volgende stappen.

## Stap 0 — R2

JP bevestigde in deze chat op 8 oktober 2026 dat stap 0 afgerond is. Zijn agenda bevat **When2Watch** en hij ontving **Slow Horses S06E04 — Lost and Found**, gepland op **7 Oct 2026**, met de Nederlandse TVmaze-beschrijving en CC BY-SA-bronregel. Zie `idea-219-r2.md` voor het volledige vastgelegde voorbeeld. Exacte ontvangsttijd niet opgegeven. APP_CREATED-provenance bij de uitrol nog onafhankelijk teruglezen.

## Lokale verificatie (A3/A4/A5/A6/A8/A10/A12, gedeeltelijk)

- PostgreSQL 17 op de afgeschermde lokale testserver; geen productiegegevens.
- `npm test`: 313/313 in 43 bestanden na P7; `npm run typecheck` en `npm run build` geslaagd.
- `npm run test:http`: 197 assertions, echte Next/PostgreSQL met synthetische sessies; geen Google-calls.
- Legacy-hashfixture, offsetequivalentie, timezone/locatiehash, DST in vier zones, null-clearing PATCH, stabiele ID's en nul writes op herhaling getest.
- Overview-linked, episode-airdate lastDate, intrekking na remote verschuiving en legacy remote readback getest.
- Proefevent: eigen markers, beide stijlen, locatie/titel/beschrijving/cancelled-controle en retry op dezelfde datum getest.
- Publieke Engelse landing/privacy met beheerder/contact en robots getest; private toegang en redirects getest.
- Dit is geen CI-, productie- of ontvangen-meldingsbewijs voor stap 1.

## A1 — handmatige doorloop op max2

| Pagina/toestand | Engels, layout/acties gecontroleerd | Door wie, wanneer, bewijs |
|---|---|---|
| Onaangemelde landing en loginfout | OPEN | OPEN |
| Agenda en Following met/zonder series | OPEN | OPEN |
| Settings: voorkeuren, Google, agenda, proef en privacy | OPEN | OPEN |
| Admin: Users en Stats | OPEN | OPEN |
| Invitation: geldig, verlopen en fout | OPEN | OPEN |
| Publiek privacybeleid en echte contactgegevens | OPEN | OPEN |

## A2 — oude uitnodigingslink met fragment

Alle vier oude paden geven lokaal 307 met de juiste nieuwe Location. Handmatig:

| Client | `/uitnodiging#token=…` → `/invitation`, fragment behouden, eenmalig geaccepteerd | Bewijs zonder token |
|---|---|---|
| Safari op JP's iPhone | OPEN | OPEN |
| Chrome desktop | OPEN | OPEN |

## A4 — eerste productiesync

Release-SHA: OPEN. APP_CREATED-binding en kalender-ID privé gecontroleerd: OPEN. Sync-start/einde: OPEN.

| Serie | updated | created | deleted | failed | Verklaring gewone reconciliatie |
|---|---:|---:|---:|---:|---|
| OPEN | OPEN | OPEN | OPEN | OPEN | OPEN |

De vaste testset is PATCH-only. Productie kan tegelijk gewone aanmaak/verwijdering doen binnen het bestaande 7-dagenvenster; verklaar verschillen. Bestaande event-ID's behouden; oude geschiedenis buiten het venster blijft onaangetast.

## A5 — vormwissel op echte eigen afspraken

- [ ] All-day → Fixed time: dezelfde ID's; PATCH wist date; readback start/end bevatten dateTime en timeZone.
- [ ] Teruggelezen zone is verzonden `Europe/Amsterdam`; offset-equivalentie canoniek gecontroleerd.
- [ ] Fixed time → All-day: dezelfde ID's; PATCH wist dateTime en timeZone; readback bevat date.
- [ ] Na elke bevestigde vormwissel tweede sync nul writes; Overview-linked klopt.
- [ ] Bewijs geschoond opgeslagen: OPEN.

## A6/A7 — proefprocedure op JP's iPhone

1. Actueel account en exacte APP_CREATED-doelagenda controleren. Verlopen Testing-grant zo nodig opnieuw verbinden. Standaardmelding voor **tijdgebonden** events instellen in Google Calendar; Apple Calendar-waarschuwingen zo nodig controleren.
2. Fixed time 20:00 kiezen. Eén gemarkeerd `[W2W TEST]`-item op een toekomstige proefdatum aanmaken. Bij onzekere response hetzelfde ID terugzoeken, geen blind nieuw item. Readback met locatie, start/einde, offset en gelijke zone bewaren.
3. Op de iPhone titel, locatie, beschrijving en link bekijken. Dit bewijst het event, nog geen melding.
4. Werkelijke ontvangst vastleggen: onderstaande tabel.
5. All-day op **een andere datum** beproeven; een proef is uniek per gebruiker en datum. De opgeslagen stijl van de eerdere proef blijft zichtbaar.
6. Vormwissel op echte eigen afspraken beproeven volgens A5; uitlegbaar syncresultaat vastleggen.
7. Alleen de eigen gemarkeerde proefitems opruimen, readback/verwijderstatus controleren.

| Stijl | Proefdatum | Toestel/agenda-app | Standaardmelding | Feitelijke ontvangsttijd + zone | Titel/locatie/afkapping zichtbaar | Readback/opruimen |
|---|---|---|---|---|---|---|
| Fixed time 20:00 | OPEN | iPhone / OPEN | OPEN | OPEN | OPEN | OPEN |
| All-day | OPEN (andere datum) | iPhone / OPEN | OPEN | OPEN | OPEN | OPEN |

## A9 — Production-consent

Pas na bovenstaande praktijkproef en op aparte opdracht van JP: `docs/runbooks/idea-241-production-consent.md`.

| Controle | Status/bewijs |
|---|---|
| Echte beheerder/contact; HTTPS homepage/privacy | OPEN |
| Exact vijf scopes; calendar.events verwijderd indien aanwezig | OPEN |
| Status In production + datum/operator | OPEN |
| JP na publicatie opnieuw verbonden | OPEN |
| Niet-testaccount: uitnodiging, identiteitslogin, afzonderlijke Calendar-consent, eigen agenda/sync | OPEN |
| Uitnodigingstekst vooraf gedeeld; budgetstartstand en teller | OPEN |

## A11 — bewijs schoon houden

Geen tokens, secrets, autorisatiecodes, cookies of volledige uitnodigingslinks opslaan. Redigeer schermafbeeldingen en readback; bewijs bron, ID-continuïteit en tijden zonder credentials. De voorbeeldteksten bevatten geen echte tokens.

## Afronding

Sprint blijft OPEN totdat release, iPhone-proef voor beide stijlen en Production/non-testaccountbewijs compleet zijn. Stap 0 is door JP bevestigd, geen vervanging van stap-1-bewijs. Spec §15 (historie bij ontvolgen) blijft een besluit voor een latere stap.

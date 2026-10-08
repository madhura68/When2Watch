# IDEA-241 stap 1 — Production-consent

Uitvoeren uitsluitend op afzonderlijke opdracht van JP; dit runbook autoriseert geen merge, uitrol, agenda-write of Cloud-Console-wijziging. Project: `when2watch-509517`. Bron: goedgekeurde specificatie v0.6 §5/§8 en uitvoeringsplan v0.3 P8/P9.

## 1. Voorwaarden vóór Publish app

- [ ] Stap 0 bevestigd in `docs/evidence/idea-219-r2.md`; actuele binding vóór uitrol teruggelezen als `APP_CREATED`.
- [ ] Beoordeelde release-SHA en CI groen (tests, typecheck, build, HTTP en beide Docker-images); JP heeft merge én uitrol opgedragen.
- [ ] Stap 1 op max2 uitgerold volgens `deploy/README.md`, met databasebackup en aparte migratie.
- [ ] Homepage en `/privacy` publiek, Engels, via HTTPS; echte `W2W_PRIVACY_CONTROLLER` en `W2W_PRIVACY_CONTACT` zichtbaar.
- [ ] Praktijkbewijs in `docs/evidence/idea-241-stap-1.md`: Fixed-time-readback, werkelijk ontvangen iPhone-melding, All-day-proef op andere datum en vormwissel van eigen echte afspraken op dezelfde event-ID's. Readback alleen bewijst geen ontvangen melding.

Ontbreekt een vinkje: niet publiceren en nog geen eerste genodigde laten autoriseren. De consent-switch is een aparte opdracht van JP.

## 2. Data Access: exact de effectieve scopes

Controleer gedeclareerde én door de app gevraagde scopes:

- `openid`
- `email`
- `profile`
- `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
- `https://www.googleapis.com/auth/calendar.app.created`

Verwijder `calendar.events` als die historische scope nog in de Console staat. Geen bredere Calendar-scope toevoegen. Identiteitslogin en afzonderlijke agendatoestemming blijven gescheiden. Bewijs alleen namen van scopes, nooit autorisatiecodes of tokens.

## 3. Branding

- App name: When2Watch; echte support-e-mail invullen.
- Homepage: `https://when2watch.jp-visser.nl`.
- Privacy: `https://when2watch.jp-visser.nl/privacy`.
- Authorized domain: `jp-visser.nl`.
- Logo pas bij de latere verificatie (IDEA-241 stap 2); stap 1 dient geen verificatieaanvraag in.

## 4. Audience → Publish app

JP controleert het project en kiest Publish app. Leg status **In production**, datum en operator vast. Production opent OAuth voor Google-accounts buiten de testlijst; dit vervangt geen verificatie van sensitive scopes. Een waarschuwingsscherm kan blijven staan. De app zelf blijft uitnodiging-only.

## 5. JP opnieuw verbinden

JP verbindt Calendar opnieuw na publicatie. Een grant uit Testing verloopt na zeven dagen; alleen de publicatiestatus wijzigen vernieuwt die grant niet. Controleer daarna verbinding, eigen APP_CREATED-agenda en sync. Geen bestaand vreemd agenda-item wijzigen.

## 6. Niet-testaccount

Gebruik een tweede account van JP of de eerste genodigde, buiten de Google-testlijst:

1. Vóór de eerste consentpoging de onderstaande uitnodigingstekst delen.
2. Uitnodigingslink accepteren; identiteitslogin hoort geen sensitive-scope-waarschuwing te vragen.
3. Apart agendatoegang geven; bij het verwachte onverifieerde-app-scherm: **Advanced → Go to When2Watch** (de zichtbare naam kan het domein zijn zolang branding niet geverifieerd is).
4. Eigen agenda laten aanmaken, bevestigen en eerste sync draaien.
5. Uitkomst en eventuele afwijkende schermtekst in de evidence vastleggen, zonder accounttokens of volledige uitnodigingslink.

Een account met organisatiebeperkingen kan een andere route of blokkade krijgen. Geen scope of beveiligingsinstelling verruimen om dat te omzeilen; leg het feit vast.

## 7. Uitnodigingstekst (voor JP, niet automatisch verzonden)

> When2Watch is free and currently available by invitation. Open the invitation link you received and sign in with the Google account you were invited with.
>
> When you connect your Google Calendar, Google may display “Google hasn't verified this app”. When2Watch is currently in a small invitation-only trial and its Calendar access has not yet completed Google's verification. If you choose to continue, open Advanced, then Go to When2Watch (or the displayed When2Watch domain). When2Watch asks to read your calendar list and manage only calendars it created; it does not read or change events in your other calendars.
>
> You can read our privacy policy at https://when2watch.jp-visser.nl/privacy. Set your calendar's notifications for timed and all-day events to receive reminders on your phone.

JP voegt de persoonlijke uitnodigingslink zelf toe. Bewaar geen token in dit document, logs of screenshots.

## 8. Handmatig uitnodigingsbudget

Interne grens: 50 vóór verificatie. Tel iedere uitgegeven uitnodiging en iedere agenda-accountwissel als één. Verwijderde accounts en hergebruik van namen verlagen de teller niet; een lokale gebruikerslijst is geen levenslange Google-teller. Reconstructeer de startstand; onbekend is niet nul. Bij 50 geen verdere uitnodigingen/accountwissels tot JP de verificatieroute heeft afgerond.

| Datum | Genodigde/accountwissel (privé referentie, geen e-mail) | Teller na actie | Grens |
|---|---|---:|---:|
| OPEN | Startstand door JP vaststellen | OPEN | 50 |

Google documenteert voor onverifieerde sensitive-scope-toegang een cap van 100 nieuwe gebruikers gedurende de levensduur van het project; publicatie reset die niet.

## Bronnen, gecontroleerd 8 oktober 2026

- [App Audience: Testing, Production en user cap](https://support.google.com/cloud/answer/15549945)
- [Unverified apps](https://support.google.com/cloud/answer/7454865)
- [Sensitive-scope-verificatie](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
